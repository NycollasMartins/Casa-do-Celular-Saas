-- =====================================================================
-- 008 - VENDAS (fecha o funil)
-- Execute depois de 007_notificacoes.sql.
--
-- Ate aqui o funil parava no comparecimento: o sistema media quantas pessoas
-- apareceram, nao quantas compraram. Sem isso, um agendador que traz muita
-- gente que nao compra parece melhor que um que traz pouca gente que compra.
--
-- POR QUE TABELA SEPARADA, E NAO COLUNAS EM `agendamentos`
-- A maioria dos agendamentos nao vira venda, entao colunas de valor ficariam
-- nulas na maior parte das linhas. Separar tambem deixa registrar QUEM
-- lancou a venda e QUANDO, que e informacao de auditoria que nao pertence
-- ao agendamento.
-- =====================================================================

create table if not exists public.vendas (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,

  -- numeric, nunca float: 0.1 + 0.2 em ponto flutuante nao da 0.3, e em
  -- dinheiro esse erro vira divergencia de fechamento.
  valor          numeric(12, 2) not null check (valor > 0),

  descricao      text,
  data_venda     date not null,

  -- Auditoria: quem lancou. `on delete restrict` porque apagar o usuario
  -- apagaria a autoria de um lancamento financeiro.
  registrada_por uuid not null references public.usuarios (id) on delete restrict,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Uma visita gera no maximo uma venda. Se a pessoa voltar e comprar de
  -- novo, isso e outro atendimento e outro agendamento.
  unique (agendamento_id)
);

create index if not exists idx_vendas_data on public.vendas (data_venda);
create index if not exists idx_vendas_agendamento on public.vendas (agendamento_id);

drop trigger if exists trg_vendas_updated_at on public.vendas;
create trigger trg_vendas_updated_at before update on public.vendas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Integridade: venda so existe onde houve comparecimento.
--
-- Isso e regra de negocio, mas fica no banco porque a alternativa — confiar
-- so na validacao da aplicacao — deixaria a porta aberta para qualquer
-- caminho que nao passe por ela (script, correcao manual, rota futura).
-- ---------------------------------------------------------------------
create or replace function public.venda_exige_comparecimento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.agendamentos a
  where a.id = new.agendamento_id;

  if v_status is distinct from 'compareceu' then
    raise exception 'Venda so pode ser registrada em agendamento com comparecimento confirmado'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendas_exige_comparecimento on public.vendas;
create trigger trg_vendas_exige_comparecimento
  before insert or update of agendamento_id on public.vendas
  for each row execute function public.venda_exige_comparecimento();

-- ---------------------------------------------------------------------
-- RLS: venda segue o escopo do agendamento a que pertence.
-- Agendador registra a venda da propria loja; apagar fica com gestor, pela
-- mesma razao que ele nao apaga agendamento — e historico financeiro.
-- ---------------------------------------------------------------------
alter table public.vendas enable row level security;

drop policy if exists vendas_select on public.vendas;
create policy vendas_select on public.vendas for select to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_insert on public.vendas;
create policy vendas_insert on public.vendas for insert to authenticated
with check (
  registrada_por = auth.uid()
  and exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_update on public.vendas;
create policy vendas_update on public.vendas for update to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
)
with check (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_delete on public.vendas;
create policy vendas_delete on public.vendas for delete to authenticated
using (
  public.usuario_role() in ('super_admin', 'franqueado', 'diretor')
  and exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);
