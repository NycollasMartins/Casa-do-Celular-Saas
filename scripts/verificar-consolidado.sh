#!/usr/bin/env bash
#
# Verifica supabase/APLICAR-PENDENTES.sql — o arquivo que uma PESSOA cola no
# SQL Editor de producao.
#
#   npm run verificar:consolidado
#
# POR QUE ISTO EXISTE
# O cabecalho do arquivo afirma duas coisas fortes: que e SEGURO RODAR MAIS DE
# UMA VEZ e que repara aplicacao PARCIAL. Ninguem tinha verificado nenhuma das
# duas. Se fossem falsas, a descoberta viria no pior lugar possivel: um erro no
# meio da execucao, em producao, deixando o banco num estado pior que o
# inicial e sem transacao para desfazer.
#
# `npm run verificar:banco` cobre outra coisa: aplica as migrations UMA a uma,
# na ordem, num banco vazio. E o caminho do desenvolvedor. Este script cobre o
# caminho de quem opera — parcial, repetido, com dados dentro.
#
# CENARIOS
#   1. Aplicacao parcial: schema, RLS e seed prontos, mais algumas migrations
#      posteriores. E o estado real em que este projeto ja esteve.
#   2. Repeticao: o mesmo arquivo tres vezes seguidas.
#   3. Instalacao limpa: so schema, RLS e seed.
# Em todos, no fim: nenhum item FALTANDO, dados intactos e as asserçoes de
# comportamento passando.
#
# Requer PostgreSQL local.

set -euo pipefail

# As migrations sao idempotentes por construcao (`drop ... if exists` antes de
# cada create), entao aplicar sobre um banco montado despeja dezenas de NOTICE
# de "does not exist, skipping". Sao esperados e afogam o que importa.
export PGOPTIONS='-c client_min_messages=warning'

DB="${CONSOLIDADO_DB:-casa_celular_consolidado}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$RAIZ/supabase/migrations"
CONSOLIDADO="$RAIZ/supabase/APLICAR-PENDENTES.sql"

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL local nao esta aceitando conexoes."
  echo "  brew services start postgresql@16"
  exit 1
fi

falhas=0

banco_base() {
  psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/verificacao/00-stubs.sql" >/dev/null
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG/20250101000000_schema.sql" >/dev/null
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG/20250101000001_rls.sql" >/dev/null
  # O seed exige os usuarios em auth.users, que no Supabase vem do script Node.
  psql -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users (email) values
  ('dono@franqueado.com.br'), ('diretor1@franqueado.com.br'), ('diretor2@franqueado.com.br')
on conflict (email) do nothing;
insert into auth.users (email)
select format('agendador%s.loja%s@franqueado.com.br', n, l)
from generate_series(1, 9) l, generate_series(1, 2) n
on conflict (email) do nothing;
SQL
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG/20250101000002_seed.sql" >/dev/null
}

contar() {
  psql -d "$DB" -t -A -c \
    "select (select count(*) from usuarios)||'/'||(select count(*) from lojas)
            ||'/'||(select count(*) from agendamentos)||'/'||(select count(*) from vendas);"
}

aplicar() {
  local rotulo="$1" saida
  if saida="$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$CONSOLIDADO" 2>&1)"; then
    if echo "$saida" | grep -q "FALTANDO"; then
      echo "  FALHOU   $rotulo — a propria conferencia do arquivo acusou item faltando:"
      echo "$saida" | grep "FALTANDO" | sed 's/^/             /'
      falhas=1
    else
      echo "  OK       $rotulo"
    fi
  else
    echo "  FALHOU   $rotulo — psql saiu com erro:"
    echo "$saida" | grep -iE "^ERROR|^psql:" | head -5 | sed 's/^/             /'
    falhas=1
  fi
}

assercoes() {
  local rotulo="$1" arquivo saida
  for arquivo in "$RAIZ"/scripts/verificacao/9*.sql; do
    if saida="$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$arquivo" 2>&1)"; then
      echo "  OK       $rotulo · $(basename "$arquivo" .sql): $(echo "$saida" | grep -oE '[0-9]+ passaram')"
    else
      echo "  FALHOU   $rotulo · $(basename "$arquivo" .sql)"
      echo "$saida" | grep -E ">>> FALHOU" | head -5 | sed 's/^/             /'
      falhas=1
    fi
  done
}

echo "Banco: $DB (recriado a cada cenario)"

# ── Cenario 1: aplicacao parcial ─────────────────────────────────────────
echo
echo "1. Aplicacao PARCIAL (schema, RLS, seed + algumas posteriores)"
banco_base
# Aplica um subconjunto fora de ordem de proposito: e o estado em que este
# projeto ja esteve, com as posteriores dentro e as do meio de fora.
for m in 20250101000007_vendas 20250101000008_metas; do
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG/$m.sql" >/dev/null 2>&1 || true
done
antes="$(contar)"
aplicar "primeira execucao sobre estado parcial"
assercoes "parcial"

# ── Cenario 2: repeticao ─────────────────────────────────────────────────
echo
echo "2. REPETICAO (o cabecalho promete que rodar de novo e seguro)"
aplicar "segunda execucao"
aplicar "terceira execucao"
depois="$(contar)"
if [ "$antes" = "$depois" ]; then
  echo "  OK       dados intactos (usuarios/lojas/agendamentos/vendas: $depois)"
else
  echo "  FALHOU   dados mudaram: antes $antes, depois $depois"
  falhas=1
fi
assercoes "apos repeticao"

# ── Cenario 3: instalacao limpa ──────────────────────────────────────────
echo
echo "3. Instalacao LIMPA (so schema, RLS e seed)"
banco_base
aplicar "execucao unica sobre base limpa"
assercoes "limpa"

echo
if [ "$falhas" -ne 0 ]; then
  echo "APLICAR-PENDENTES.sql NAO cumpre o que o cabecalho promete."
  exit 1
fi
echo "APLICAR-PENDENTES.sql cumpre: repara parcial, repete sem estrago, instala limpo."
echo "Banco '$DB' preservado. Para remover: psql -d postgres -c 'drop database $DB;'"
