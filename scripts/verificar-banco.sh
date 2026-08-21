#!/usr/bin/env bash
#
# Verifica as migrations num PostgreSQL local, sem tocar no Supabase.
#
#   npm run verificar:banco
#
# POR QUE ISTO EXISTE
# As migrations sao escritas e so vao para o banco quando alguem cola no SQL
# Editor. Entre uma coisa e outra, erro de SQL nao aparece — e uma migration
# quebrada so se revela em producao, no pior momento possivel.
#
# Este script cria um banco descartavel, reproduz o que o Supabase fornece
# (schema auth, auth.uid(), os papeis), aplica TODAS as migrations na ordem,
# popula o seed, roda asserçoes de RLS impersonando cada papel, exercita as
# funcoes SQL (anonimizacao, lembrete, resumo semanal) contra dados reais e
# confere os tipos de TypeScript contra o schema que acabou de ser criado.
#
# Nao substitui os testes contra o Supabase (npm run test:rls), que exercitam
# tambem o PostgREST e o GoTrue. Cobre a camada onde mora a seguranca.
#
# Requer apenas PostgreSQL local: `brew install postgresql@16 && brew services start postgresql@16`

set -euo pipefail

DB="${VERIFICAR_DB:-casa_celular_verificacao}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$RAIZ/supabase/migrations"
VERIFICACAO="$RAIZ/scripts/verificacao"

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL local nao esta aceitando conexoes."
  echo "  brew services start postgresql@16"
  exit 1
fi

echo "Banco de verificacao: $DB (recriado a cada execucao)"
psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

echo
echo "Stubs do Supabase"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$VERIFICACAO/00-stubs.sql"
echo "  OK"

echo
echo "Migrations"
falhou=0
for arquivo in "$MIGRATIONS"/*.sql; do
  nome="$(basename "$arquivo")"

  # O seed precisa dos usuarios em auth.users, que no Supabase vem do
  # script Node. Aqui basta o e-mail: nenhuma senha e verificada.
  if [[ "$nome" == *_seed.sql ]]; then
    psql -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (email) values
  ('dono@franqueado.com.br'), ('diretor1@franqueado.com.br'), ('diretor2@franqueado.com.br')
on conflict (email) do nothing;

insert into auth.users (email)
select format('agendador%s.loja%s@franqueado.com.br', n, l)
from generate_series(1, 9) l, generate_series(1, 2) n
on conflict (email) do nothing;
SQL
  fi

  if saida="$(psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$arquivo" 2>&1)"; then
    echo "  OK       $nome"
  else
    echo "  FALHOU   $nome"
    echo "$saida" | sed 's/^/           /' | head -8
    falhou=1
  fi
done

if [ "$falhou" -ne 0 ]; then
  echo
  echo "Alguma migration falhou. As asserçoes nao vao rodar."
  exit 1
fi

# ON_ERROR_STOP + a excecao final de cada arquivo fazem o psql sair com
# codigo diferente de zero quando alguma asserçao falha. `set -o pipefail`,
# no topo, garante que o status do psql sobreviva ao pipe do sed.
problemas=0
total_assercoes=0

for arquivo in "$VERIFICACAO"/9*.sql; do
  titulo="$(basename "$arquivo" .sql | sed 's/^[0-9]*-//')"
  echo
  echo "Asserçoes: $titulo"

  saida_assercoes="$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$arquivo" 2>&1)" || problemas=1
  echo "$saida_assercoes" | sed -n '/situacao/,$p' | sed 's/^/  /'

  # Quantas RODARAM, nao quantas estao escritas. Contar chamadas no arquivo
  # erra por dois motivos: a linha que DEFINE pg_temp.checar tambem casa, e ha
  # desvio de guarda com duas chamadas das quais so uma executa.
  executadas="$(echo "$saida_assercoes" | grep -cE '^ *(PASSOU|>>> FALHOU) ')"
  total_assercoes=$((total_assercoes + executadas))
done

if [ "$problemas" -ne 0 ]; then
  echo
  echo "Ha asserçao falhando."
  exit 1
fi

# O README afirma quantas asserçoes rodam. Esse numero so e conhecivel aqui,
# depois de rodar — por isso a conferencia mora neste script e nao num teste
# unitario, que so consegue ler o arquivo.
echo
echo "Numero afirmado no README"
afirmado="$(grep -oE '\*\*[0-9]+ asserções\*\*' "$RAIZ/README.md" | head -1 | grep -oE '[0-9]+')"
if [ "$afirmado" != "$total_assercoes" ]; then
  echo "  README diz $afirmado asserçoes; rodaram $total_assercoes."
  echo "  Corrija o README: documentacao que mente e pior que documentacao ausente."
  exit 1
fi
echo "  OK  $total_assercoes asserçoes, igual ao README"

# Os tipos de lib/types/database.ts sao escritos a mao e precisam espelhar as
# migrations. Nada garante isso sozinho: o TypeScript confia no que esta
# declarado, entao coluna nova sem tipo compila e passa despercebida.
echo
echo "Tipos contra o schema"
if ! node "$VERIFICACAO/tipos.mjs"; then
  echo
  echo "Atualize lib/types/database.ts para refletir as migrations."
  exit 1
fi

echo
echo "Banco '$DB' preservado para inspecao. Para remover:"
echo "  psql -d postgres -c 'drop database $DB;'"
