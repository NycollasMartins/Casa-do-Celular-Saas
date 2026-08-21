#!/usr/bin/env bash
#
# Mede as consultas quentes num PostgreSQL local com volume sintetico.
#
#   npm run medir:consultas            # 300 mil agendamentos, 6 tenants
#   LINHAS_POR_LOJA=50000 npm run medir:consultas
#
# POR QUE ISTO EXISTE
# "Esta lento" e "precisa de indice" sao palpites ate alguem medir. Este script
# monta um banco descartavel com volume, IMPERSONA os papeis reais para que o
# RLS entre no plano, e imprime EXPLAIN ANALYZE. O predicado do RLS e uma
# chamada de funcao: medir com um `where franqueado_id = ...` equivalente da
# outro plano e outra conclusao.
#
# O que a primeira execucao mostrou, em 300 mil linhas:
#   franqueado, 90 dias, paginado ... 7ms   (5.276 linhas descartadas)
#   agendador,  90 dias, paginado ... 24ms  (30.172 descartadas)
#   franqueado, 730 dias, completo .. 118ms (50.000 devolvidas)
# Ou seja: o banco NAO era o gargalo. O custo esta no transporte — 50 mil
# linhas saem do Supabase por HTTP em paginas de mil.
#
# Requer PostgreSQL local.

set -euo pipefail

DB="${MEDIR_DB:-casa_celular_medicao}"
LINHAS_POR_LOJA="${LINHAS_POR_LOJA:-10000}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL local nao esta aceitando conexoes."
  echo "  brew services start postgresql@16"
  exit 1
fi

echo "Banco de medicao: $DB (recriado a cada execucao)"
psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/verificacao/00-stubs.sql" >/dev/null

# O seed depende de usuarios em auth.users criados por um script Node; aqui ele
# nao interessa, e a medicao usa dados proprios.
for arquivo in "$RAIZ"/supabase/migrations/*.sql; do
  case "$arquivo" in
    *_seed.sql) continue ;;
  esac
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$arquivo" >/dev/null 2>&1
done

echo "Populando ($LINHAS_POR_LOJA por loja, 30 lojas)..."
psql -d "$DB" -q -v ON_ERROR_STOP=1 -v linhas="$LINHAS_POR_LOJA" >/dev/null 2>&1 <<'SQL'
insert into franqueados (id, nome, cnpj, email_contato)
select gen_random_uuid(), 'Franq '||i, lpad(i::text,14,'0'), 'f'||i||'@x.com' from generate_series(1,6) i;

insert into lojas (id, franqueado_id, nome, codigo_loja, cidade, estado)
select gen_random_uuid(), f.id, 'Loja '||f.nome||'-'||j, f.nome||'-'||j, 'Cidade', 'SP'
from franqueados f, generate_series(1,5) j;

insert into auth.users (id, email)
select gen_random_uuid(), 'a'||f.nome||j||'@x.com' from franqueados f, generate_series(1,10) j;

insert into usuarios (id, franqueado_id, nome, email, role)
select u.id, f.id, 'Ag '||u.email, u.email, 'agendador'
from auth.users u join franqueados f on u.email like '%'||f.nome||'%';

insert into agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome, cliente_cpf,
                          cliente_telefone, data_agendamento, status)
select l.franqueado_id, l.id,
       (select u.id from usuarios u where u.franqueado_id = l.franqueado_id order by u.id limit 1),
       'Cliente '||g, lpad((random()*1e11)::bigint::text,11,'0'), '11999999999',
       current_date - (random()*730)::int,
       (array['contatado','agendado','nao_agendado','compareceu','nao_compareceu'])[1+floor(random()*5)]
from lojas l, generate_series(1, :linhas) g;

-- Sem vinculo o RLS do agendador nao devolve nada, e a medicao mediria o vazio.
insert into agendadores_lojas (usuario_id, loja_id, data_inicio)
select u.id, (select l.id from lojas l where l.franqueado_id = u.franqueado_id order by l.id limit 1),
       current_date - 800
from usuarios u where u.role = 'agendador';

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111','dono@x.com');
insert into usuarios (id, franqueado_id, nome, email, role)
select '11111111-1111-4111-8111-111111111111', id, 'Dono', 'dono@x.com', 'franqueado'
from franqueados order by id limit 1;

grant select on all tables in schema public to authenticated;
analyze;
SQL

TOTAL=$(psql -d "$DB" -t -A -c "select count(*) from agendamentos;")
AGENDADOR=$(psql -d "$DB" -t -A -c \
  "select u.id from usuarios u join agendadores_lojas al on al.usuario_id=u.id where u.role='agendador' limit 1;")
DONO=11111111-1111-4111-8111-111111111111

medir() {
  local titulo="$1" usuario="$2" dias="$3" limite="$4"
  echo
  echo "── $titulo"
  psql -d "$DB" -f - 2>&1 <<SQL | grep -E "Execution Time|Rows Removed|using idx|Seq Scan|rows=[0-9]+ loops=1\)$" | head -5
set role authenticated;
set request.jwt.claim.sub = '$usuario';
explain (analyze, buffers, costs off)
select a.* from agendamentos a
where a.data_agendamento >= (current_date - $dias) and a.data_agendamento <= current_date
order by a.data_agendamento desc, a.id desc $limite;
SQL
}

echo
echo "═══ $TOTAL agendamentos, 6 franqueados, 30 lojas ═══"
medir "franqueado · 90 dias · paginado (tabela)"  "$DONO"      90  "limit 1000"
medir "agendador  · 90 dias · paginado (tabela)"  "$AGENDADOR" 90  "limit 1000"
medir "franqueado · 90 dias · completo (metricas)" "$DONO"     90  ""
medir "franqueado · 730 dias · completo (relatorio)" "$DONO"   730 ""
echo
echo "Banco $DB mantido para inspecao. Remova com: dropdb $DB"
