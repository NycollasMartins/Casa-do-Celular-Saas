-- =====================================================================
-- 010 - RELATORIO SEMANAL POR E-MAIL
-- Execute depois de 009_metas.sql.
--
-- O franqueado nao abre o sistema todo dia. O resumo semanal leva o numero
-- ate ele — e, quando algo destoa, ele entra para investigar.
--
-- POR QUE AGREGAR NO BANCO
-- As metricas da aplicacao sao calculadas em JavaScript, o que faz sentido
-- para uma tela que ja carregou os registros. Uma rotina em lote nao tem
-- essa leitura na mao, e trazer milhares de linhas para somar quatro
-- numeros seria desperdicio. Aqui a agregacao fica onde os dados estao.
-- =====================================================================

create table if not exists public.envios_relatorio (
  id            uuid primary key default gen_random_uuid(),
  franqueado_id uuid not null references public.franqueados (id) on delete cascade,

  -- Segunda-feira da semana coberta. O check evita gravar outro dia e criar
  -- duas linhas para a mesma semana sem violar o indice.
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),

  status        text not null check (status in ('enviado', 'falhou')),
  detalhe       text,
  criado_em     timestamptz not null default now()
);

-- Mesma ideia do lembrete de vespera: sucesso e unico, falha pode repetir.
-- Se o indice cobrisse todas as linhas, uma queda do provedor impediria a
-- reentrega para sempre.
create unique index if not exists envios_relatorio_unico
  on public.envios_relatorio (franqueado_id, semana_inicio)
  where status = 'enviado';

alter table public.envios_relatorio enable row level security;

drop policy if exists envios_relatorio_select on public.envios_relatorio;
create policy envios_relatorio_select on public.envios_relatorio for select to authenticated
using (public.is_super_admin() or franqueado_id = public.usuario_franqueado_id());

-- ---------------------------------------------------------------------
-- Resumo do periodo para um franqueado.
--
-- Os nomes espelham os da aplicacao (contatos, agendados, compareceram) para
-- quem ler os dois lados reconhecer o mesmo vocabulario.
-- ---------------------------------------------------------------------
create or replace function public.resumo_do_periodo(
  p_franqueado_id uuid,
  p_inicio date,
  p_fim date
)
returns table (
  contatos      bigint,
  agendados     bigint,
  compareceram  bigint,
  nao_compareceram bigint,
  vendas        bigint,
  receita       numeric,
  melhor_loja   text
)
language sql stable security definer set search_path = public
as $$
  with periodo as (
    select a.id, a.loja_id, a.status
    from public.agendamentos a
    where a.franqueado_id = p_franqueado_id
      and a.data_agendamento between p_inicio and p_fim
  ),
  vendas_periodo as (
    select v.agendamento_id, v.valor
    from public.vendas v
    join periodo p on p.id = v.agendamento_id
  ),
  ranking as (
    select l.nome
    from periodo p
    join public.lojas l on l.id = p.loja_id
    where p.status = 'compareceu'
    group by l.nome
    order by count(*) desc, l.nome
    limit 1
  )
  select
    (select count(*) from periodo),
    (select count(*) from periodo where status in ('agendado', 'compareceu', 'nao_compareceu')),
    (select count(*) from periodo where status = 'compareceu'),
    (select count(*) from periodo where status = 'nao_compareceu'),
    (select count(*) from vendas_periodo),
    (select coalesce(sum(valor), 0) from vendas_periodo),
    (select nome from ranking);
$$;

comment on function public.resumo_do_periodo(uuid, date, date) is
  'Agregados de um franqueado no periodo. Usado pelo relatorio semanal por e-mail.';
