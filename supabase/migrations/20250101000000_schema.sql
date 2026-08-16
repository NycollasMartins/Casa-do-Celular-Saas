-- =====================================================================
-- 001 - SCHEMA BASE
-- Sistema SaaS multi-tenant de performance de agendadores.
-- Execute este arquivo primeiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('super_admin', 'franqueado', 'diretor', 'agendador');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Funcao utilitaria de updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- franqueados: o "tenant" do SaaS. Todo dado de negocio pendura aqui.
-- ---------------------------------------------------------------------
create table if not exists public.franqueados (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cnpj             text,
  email_contato    text,
  telefone_contato text,
  status           text not null default 'ativo' check (status in ('ativo', 'inativo', 'pendente')),
  data_contrato    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- usuarios: espelha auth.users (id identico) com papel e tenant.
-- ---------------------------------------------------------------------
create table if not exists public.usuarios (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null unique,
  nome           text not null,
  role           public.user_role not null,
  -- super_admin nao pertence a nenhum franqueado (fica null)
  franqueado_id  uuid references public.franqueados (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint usuarios_franqueado_obrigatorio
    check (role = 'super_admin' or franqueado_id is not null)
);

-- ---------------------------------------------------------------------
-- lojas
-- ---------------------------------------------------------------------
create table if not exists public.lojas (
  id            uuid primary key default gen_random_uuid(),
  franqueado_id uuid not null references public.franqueados (id) on delete cascade,
  nome          text not null,
  codigo_loja   text not null,
  estado        text not null,
  cidade        text not null,
  endereco      text,
  telefone      text,
  gerente_nome  text,
  status        text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (franqueado_id, codigo_loja)
);

-- ---------------------------------------------------------------------
-- participacoes_societarias: define o que franqueado/diretor enxerga.
-- data_fim null = participacao ativa.
-- ---------------------------------------------------------------------
create table if not exists public.participacoes_societarias (
  id                      uuid primary key default gen_random_uuid(),
  usuario_id              uuid not null references public.usuarios (id) on delete cascade,
  loja_id                 uuid not null references public.lojas (id) on delete cascade,
  percentual_participacao decimal(5, 2) not null check (percentual_participacao > 0 and percentual_participacao <= 100),
  cargo                   text not null check (cargo in ('franqueado', 'diretor')),
  data_inicio             date not null,
  data_fim                date,
  created_at              timestamptz not null default now(),
  constraint participacao_periodo_valido check (data_fim is null or data_fim >= data_inicio)
);

-- Um usuario nao pode ter duas participacoes ativas na mesma loja.
create unique index if not exists participacoes_ativa_unica
  on public.participacoes_societarias (usuario_id, loja_id)
  where data_fim is null;

-- ---------------------------------------------------------------------
-- agendadores_lojas: vinculo do operacional com UMA loja.
-- ---------------------------------------------------------------------
create table if not exists public.agendadores_lojas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  loja_id     uuid not null references public.lojas (id) on delete cascade,
  data_inicio date not null,
  data_fim    date,
  created_at  timestamptz not null default now(),
  unique (usuario_id, loja_id),
  constraint vinculo_periodo_valido check (data_fim is null or data_fim >= data_inicio)
);

-- ---------------------------------------------------------------------
-- agendamentos: tabela de fato. franqueado_id fica desnormalizado de
-- proposito para permitir filtro por tenant sem join.
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id               uuid primary key default gen_random_uuid(),
  franqueado_id    uuid not null references public.franqueados (id) on delete cascade,
  loja_id          uuid not null references public.lojas (id) on delete cascade,
  agendador_id     uuid not null references public.usuarios (id) on delete restrict,
  cliente_nome     text not null,
  cliente_email    text,
  cliente_cpf      text not null,
  cliente_telefone text not null,
  data_agendamento date not null,
  status           text not null default 'contatado'
                   check (status in ('contatado', 'agendado', 'nao_agendado', 'compareceu', 'nao_compareceu')),
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Garante que loja e agendamento pertencem ao mesmo franqueado.
create or replace function public.validar_tenant_agendamento()
returns trigger
language plpgsql
as $$
declare
  v_franqueado_da_loja uuid;
begin
  select l.franqueado_id into v_franqueado_da_loja from public.lojas l where l.id = new.loja_id;
  if v_franqueado_da_loja is null then
    raise exception 'Loja % nao encontrada', new.loja_id;
  end if;
  if new.franqueado_id <> v_franqueado_da_loja then
    raise exception 'franqueado_id do agendamento nao corresponde ao franqueado da loja';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Indices de performance (filtros e joins mais usados no dashboard)
-- ---------------------------------------------------------------------
create index if not exists idx_agendamentos_franqueado    on public.agendamentos (franqueado_id);
create index if not exists idx_agendamentos_loja          on public.agendamentos (loja_id);
create index if not exists idx_agendamentos_data          on public.agendamentos (data_agendamento);
create index if not exists idx_agendamentos_status        on public.agendamentos (status);
create index if not exists idx_agendamentos_agendador     on public.agendamentos (agendador_id);
-- Indice composto: o filtro padrao do dashboard e loja + periodo.
create index if not exists idx_agendamentos_loja_data     on public.agendamentos (loja_id, data_agendamento desc);

create index if not exists idx_lojas_franqueado           on public.lojas (franqueado_id);
create index if not exists idx_participacoes_usuario      on public.participacoes_societarias (usuario_id);
create index if not exists idx_participacoes_loja         on public.participacoes_societarias (loja_id);
create index if not exists idx_agendadores_lojas_usuario  on public.agendadores_lojas (usuario_id);
create index if not exists idx_agendadores_lojas_loja     on public.agendadores_lojas (loja_id);
create index if not exists idx_usuarios_franqueado        on public.usuarios (franqueado_id);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists trg_franqueados_updated_at on public.franqueados;
create trigger trg_franqueados_updated_at before update on public.franqueados
  for each row execute function public.set_updated_at();

drop trigger if exists trg_usuarios_updated_at on public.usuarios;
create trigger trg_usuarios_updated_at before update on public.usuarios
  for each row execute function public.set_updated_at();

drop trigger if exists trg_lojas_updated_at on public.lojas;
create trigger trg_lojas_updated_at before update on public.lojas
  for each row execute function public.set_updated_at();

drop trigger if exists trg_agendamentos_updated_at on public.agendamentos;
create trigger trg_agendamentos_updated_at before update on public.agendamentos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_agendamentos_tenant on public.agendamentos;
create trigger trg_agendamentos_tenant before insert or update on public.agendamentos
  for each row execute function public.validar_tenant_agendamento();
