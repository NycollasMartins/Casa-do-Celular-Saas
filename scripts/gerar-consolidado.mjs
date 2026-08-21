/**
 * Gera `supabase/APLICAR-PENDENTES.sql` a partir das migrations.
 *
 *   npm run consolidado:gerar      # regrava o arquivo
 *   npm run consolidado:conferir   # falha se estiver desatualizado
 *
 * POR QUE
 * O consolidado e o arquivo que alguem cola no SQL Editor. Ele foi montado a
 * mao uma vez; a partir dai, cada migration nova precisava ser lembrada. Se
 * fosse esquecida, o arquivo aplicaria um schema PARCIAL — que e exatamente
 * o estado em que este projeto ja esteve, com as migrations 007 a 010
 * aplicadas e as 005 e 006 nao.
 *
 * O conteudo sai das migrations em ordem de nome. A ordem importa: a funcao
 * do lembrete referencia a coluna da anonimizacao, e a do relatorio
 * referencia a tabela de vendas.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = 'supabase/migrations';
const DESTINO = 'supabase/APLICAR-PENDENTES.sql';

/**
 * O consolidado cobre o que vem DEPOIS do seed. Schema, RLS e seed sao
 * passos manuais documentados no README — o seed inclusive depende do script
 * Node que cria os usuarios em auth.users.
 */
const DEPOIS_DO_SEED = '20250101000002_seed.sql';

const arquivos = readdirSync(PASTA)
  .filter((nome) => nome.endsWith('.sql'))
  .sort()
  .filter((nome) => nome > DEPOIS_DO_SEED);

/** Numero e titulo saem do cabecalho da propria migration. */
function descrever(conteudo, nome) {
  const m = conteudo.match(/^--\s*(\d{3})\s*-\s*(.+?)\s*$/m);
  if (!m) throw new Error(`${nome}: cabecalho sem "-- NNN - TITULO"`);
  return { numero: m[1], titulo: m[2] };
}

const partes = arquivos.map((nome) => {
  const conteudo = readFileSync(join(PASTA, nome), 'utf8').replace(/\s+$/, '');
  return { nome, conteudo, ...descrever(conteudo, nome) };
});

const indice = partes
  .map((p) => `--   ${p.numero}  ${p.titulo.padEnd(34)} (${p.nome})`)
  .join('\n');

const corpo = partes
  .map(
    (p) => `

-- ---------------------------------------------------------------------
-- >>> ${p.numero} · ${p.titulo}
-- ---------------------------------------------------------------------

${p.conteudo}
`
  )
  .join('');

const saida = `-- =====================================================================
-- APLICAR PENDENTES  ·  Casa do Celular
--
-- ARQUIVO GERADO. Nao edite a mao: rode \`npm run consolidado:gerar\`.
-- O conteudo sai de supabase/migrations, e o CI confere se esta em dia.
--
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e execute uma vez.
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Todo comando aqui e idempotente:
-- \`create table if not exists\`, \`create index if not exists\`,
-- \`create or replace function\`, e \`drop ... if exists\` antes de cada
-- \`create policy\` e \`create trigger\`. Se parte disso ja foi aplicada, os
-- trechos correspondentes apenas se repetem sem efeito — nenhum dado e
-- perdido e nenhuma permissao e afrouxada.
--
-- ORDEM IMPORTA. As migrations dependem umas das outras: a funcao do
-- lembrete referencia a coluna criada pela anonimizacao, e a de relatorio
-- referencia a tabela de vendas. Rodar fora de ordem faz a criacao da
-- funcao falhar.
--
-- AO FINAL ha um \`notify pgrst\` que recarrega o cache de schema do
-- PostgREST. Sem ele, funcoes recem-criadas ficam invisiveis para a API e
-- os scripts respondem "Could not find the function ... in the schema
-- cache" mesmo com a funcao existindo no banco.
--
-- Conteudo, na ordem de execucao:
${indice}
-- =====================================================================
${corpo}

-- =====================================================================
-- RECARGA DO CACHE DE SCHEMA
--
-- O PostgREST guarda em memoria a lista de tabelas e funcoes expostas.
-- Sem esta recarga, uma funcao recem-criada existe no banco mas responde
-- "Could not find the function ... in the schema cache" quando chamada
-- pela API — o que faz parecer que a migration nao rodou.
-- =====================================================================
notify pgrst, 'reload schema';


-- =====================================================================
-- CONFERENCIA
--
-- Roda depois de tudo e devolve uma linha por item esperado, com OK ou
-- FALTANDO. Se alguma linha vier FALTANDO, o trecho correspondente acima
-- nao foi aplicado — copie a mensagem de erro que o editor mostrou.
--
-- Usa to_regclass em vez do cast ::regclass: o cast levanta erro quando a
-- tabela nao existe e derrubaria a consulta inteira, justamente no caso em
-- que ela precisa reportar.
-- =====================================================================
with esperado(item, tipo, presente) as (
  values
    ('usuarios.status',                 'coluna',
      (select count(*) > 0 from information_schema.columns
        where table_schema = 'public' and table_name = 'usuarios' and column_name = 'status')),
    ('agendamentos.anonimizado_em',     'coluna',
      (select count(*) > 0 from information_schema.columns
        where table_schema = 'public' and table_name = 'agendamentos' and column_name = 'anonimizado_em')),
    ('notificacoes',                    'tabela', (select to_regclass('public.notificacoes') is not null)),
    ('vendas',                          'tabela', (select to_regclass('public.vendas') is not null)),
    ('metas',                           'tabela', (select to_regclass('public.metas') is not null)),
    ('envios_relatorio',                'tabela', (select to_regclass('public.envios_relatorio') is not null)),
    ('trg_usuarios_campos_sensiveis',   'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.usuarios') and tgname = 'trg_usuarios_campos_sensiveis')),
    ('trg_agendadores_lojas_tenant',    'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.agendadores_lojas') and tgname = 'trg_agendadores_lojas_tenant')),
    ('trg_participacoes_tenant',        'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.participacoes_societarias') and tgname = 'trg_participacoes_tenant')),
    ('trg_agendamentos_status_venda',   'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.agendamentos') and tgname = 'trg_agendamentos_status_venda')),
    ('trg_vendas_exige_comparecimento', 'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.vendas') and tgname = 'trg_vendas_exige_comparecimento')),
    ('anonimizar_agendamentos_antigos', 'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'anonimizar_agendamentos_antigos')),
    ('agendamentos_para_lembrete',      'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'agendamentos_para_lembrete')),
    ('resumo_do_periodo',               'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'resumo_do_periodo'))
)
select
  case when presente then 'OK' else 'FALTANDO' end as situacao,
  tipo,
  item
from esperado
order by presente, item;
`;

const conferir = process.argv.includes('--conferir');

if (conferir) {
  const atual = readFileSync(DESTINO, 'utf8');
  if (atual !== saida) {
    console.error(`${DESTINO} esta desatualizado em relacao a ${PASTA}.`);
    console.error('Rode `npm run consolidado:gerar` e commite o resultado.');
    process.exit(1);
  }
  console.log(`  OK  ${DESTINO} cobre as ${partes.length} migrations posteriores ao seed`);
} else {
  writeFileSync(DESTINO, saida);
  console.log(`${DESTINO} regravado com ${partes.length} migrations.`);
}
