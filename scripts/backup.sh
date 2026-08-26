#!/usr/bin/env bash
#
# Copia de seguranca do banco, e o ensaio de restauracao.
#
#   npm run backup            # gera a copia
#   npm run backup -- --ensaio  # gera E restaura num banco descartavel,
#                               # rodando as assercoes contra a copia
#
# POR QUE ISTO EXISTE
# O Supabase so faz copia automatica em planos pagos. No plano gratuito nao
# ha nenhuma: se algo acontecer com o projeto, o dado de cliente vai junto — e
# este sistema guarda nome, CPF e telefone de quem foi atendido.
#
# POR QUE O ENSAIO IMPORTA MAIS QUE A COPIA
# Copia que nunca foi restaurada e uma suposicao. O `--ensaio` restaura o
# arquivo num banco novo e roda as mesmas assercoes de comportamento que a
# verificacao usa. Se a copia estiver truncada ou fora de ordem, elas acusam.
#
# O QUE PRECISA
# A string de conexao do Postgres, em SUPABASE_DB_URL. No painel:
# Settings > Database > Connection string > URI. Ela NAO e a service role key;
# e a senha do banco, que voce define ao criar o projeto.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${BACKUP_DIR:-$RAIZ/backups}"
ENSAIO=0
[ "${1:-}" = "--ensaio" ] && ENSAIO=1

if [ -z "${SUPABASE_DB_URL:-}" ] && [ -f "$RAIZ/.env.local" ]; then
  SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$RAIZ/.env.local" | cut -d= -f2- | tr -d '"'"'"'' || true)"
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL nao definida."
  echo
  echo "  No painel do Supabase: Settings > Database > Connection string > URI."
  echo "  Guarde em .env.local (ja coberto pelo .gitignore):"
  echo
  echo '    SUPABASE_DB_URL="postgresql://postgres:SENHA@db.SEUPROJETO.supabase.co:5432/postgres"'
  echo
  echo "  Nao e a service role key — e a senha do banco, definida na criacao do projeto."
  exit 1
fi

mkdir -p "$DESTINO"
CARIMBO="$(date +%Y-%m-%d_%H%M)"
ARQUIVO="$DESTINO/casa-do-celular_$CARIMBO.sql"

echo "Copiando o banco..."
# --no-owner e --no-privileges: a copia precisa poder ser restaurada num
# projeto novo, onde os papeis do Supabase tem outros identificadores.
# O schema `auth` vai junto: sem ele, as contas nao voltam e todas as chaves
# estrangeiras de usuario ficam apontando para o vazio.
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-privileges \
  --schema=public --schema=auth \
  --file="$ARQUIVO"

TAMANHO="$(du -h "$ARQUIVO" | cut -f1)"
LINHAS="$(grep -c '^INSERT\|^COPY' "$ARQUIVO" || true)"
echo "  OK  $ARQUIVO  ($TAMANHO)"

gzip -f "$ARQUIVO"
echo "  compactado: ${ARQUIVO}.gz"

if [ "$ENSAIO" -eq 0 ]; then
  echo
  echo "Para conferir que esta copia RESTAURA de verdade:"
  echo "  npm run backup -- --ensaio"
  exit 0
fi

# ---------------------------------------------------------------------
# Ensaio de restauracao
# ---------------------------------------------------------------------
if ! pg_isready -q 2>/dev/null; then
  echo
  echo "Ensaio pulado: PostgreSQL local nao esta aceitando conexoes."
  echo "  brew services start postgresql@16"
  exit 1
fi

DB_ENSAIO="${ENSAIO_DB:-casa_celular_ensaio}"
echo
echo "Ensaio: restaurando em '$DB_ENSAIO' (banco descartavel)"
psql -d postgres -q -c "drop database if exists $DB_ENSAIO;" -c "create database $DB_ENSAIO;"

# Os papeis do Supabase nao existem num Postgres local. Sem eles o restore
# falha em cada GRANT e em cada policy que cita `authenticated`.
psql -d "$DB_ENSAIO" -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/verificacao/00-stubs.sql" >/dev/null 2>&1 || true

if gunzip -c "${ARQUIVO}.gz" | psql -d "$DB_ENSAIO" -q > /tmp/ensaio-restore.log 2>&1; then
  echo "  OK  restaurou sem erro"
else
  echo "  restaurou com avisos — os relevantes:"
  grep -iE "^ERROR" /tmp/ensaio-restore.log | grep -viE "already exists|does not exist" | head -5 | sed 's/^/       /'
fi

echo
echo "Conferindo a copia com as assercoes de comportamento:"
for arquivo in "$RAIZ"/scripts/verificacao/9*.sql; do
  if saida="$(psql -d "$DB_ENSAIO" -v ON_ERROR_STOP=1 -f "$arquivo" 2>&1)"; then
    echo "  OK  $(basename "$arquivo" .sql): $(echo "$saida" | grep -oE '[0-9]+ passaram' | head -1)"
  else
    echo "  FALHOU  $(basename "$arquivo" .sql)"
    echo "$saida" | grep -E ">>> FALHOU" | head -5 | sed 's/^/       /'
    exit 1
  fi
done

echo
echo "A copia restaura e o banco restaurado se comporta como o original."
echo "Banco '$DB_ENSAIO' preservado. Remova com: dropdb $DB_ENSAIO"
