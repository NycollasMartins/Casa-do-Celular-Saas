-- =====================================================================
-- 009 - METAS POR AGENDADOR
-- Execute depois de 008_vendas.sql.
--
-- O sistema ja mede o desempenho de cada agendador. Faltava o outro lado da
-- conta: o que se esperava dele. Sem meta, "42 agendamentos no mes" nao diz
-- se foi bom ou ruim — e o franqueado precisa saber quem esta abaixo antes
-- do fim do mes, nao depois.
--
-- COMPETENCIA, NAO INTERVALO
-- A meta e mensal e `competencia` guarda sempre o dia 1 do mes. Uma meta com
-- inicio e fim livres pareceria mais flexivel, mas abriria espaco para
-- periodos sobrepostos e para a pergunta "qual meta vale hoje?" nao ter
-- resposta unica.
-- =====================================================================

create table if not exists public.metas (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuarios (id) on delete cascade,

  -- Sempre o dia 1. O check evita que alguem grave 15/03 e crie duas metas
  -- para o mesmo mes sem violar o unique.
  competencia  date not null check (extract(day from competencia) = 1),

  -- Todas opcionais: cada rede acompanha o que importa para ela. Uma meta
  -- sem nenhum alvo definido nao faz sentido, e o check abaixo barra isso.
  meta_agendamentos    int            check (meta_agendamentos is null or meta_agendamentos > 0),
  meta_taxa_conversao  numeric(5, 2)  check (meta_taxa_conversao is null or (meta_taxa_conversao > 0 and meta_taxa_conversao <= 100)),
  meta_vendas          int            check (meta_vendas is null or meta_vendas > 0),
  meta_receita         numeric(12, 2) check (meta_receita is null or meta_receita > 0),

  definida_por uuid not null references public.usuarios (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (usuario_id, competencia),

  constraint meta_precisa_de_alvo check (
    meta_agendamentos is not null
    or meta_taxa_conversao is not null
    or meta_vendas is not null
    or meta_receita is not null
  )
);

create index if not exists idx_metas_competencia on public.metas (competencia);

drop trigger if exists trg_metas_updated_at on public.metas;
create trigger trg_metas_updated_at before update on public.metas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
--
-- O agendador LE a propria meta: saber o alvo e parte de persegui-lo, e
-- esconder isso tornaria a meta um instrumento de cobranca em vez de
-- direcao. Escrever fica com quem gerencia.
-- ---------------------------------------------------------------------
alter table public.metas enable row level security;

drop policy if exists metas_select on public.metas;
create policy metas_select on public.metas for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    public.usuario_role() in ('franqueado', 'diretor')
    and exists (
      select 1 from public.agendadores_lojas al
      where al.usuario_id = metas.usuario_id
        and al.data_fim is null
        and al.loja_id in (select public.lojas_permitidas())
    )
  )
);

drop policy if exists metas_write on public.metas;
create policy metas_write on public.metas for all to authenticated
using (public.pode_gerenciar())
with check (
  public.pode_gerenciar()
  and definida_por = auth.uid()
  and exists (
    select 1 from public.agendadores_lojas al
    where al.usuario_id = metas.usuario_id
      and al.data_fim is null
      and al.loja_id in (select public.lojas_permitidas())
  )
);
