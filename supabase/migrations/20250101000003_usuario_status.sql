-- =====================================================================
-- 004 - STATUS DO USUARIO (desligamento)
-- Execute depois de 003_seed.sql.
--
-- PROBLEMA QUE RESOLVE
-- Nao havia como revogar o acesso de alguem pela aplicacao. Apagar a linha
-- nao serve: `agendamentos.agendador_id` referencia o usuario, e o historico
-- de quem agendou o que e justamente o dado que o sistema existe para medir.
--
-- A saida e desligar sem apagar. O corte acontece nas funcoes de permissao,
-- nao em cada policy: `usuario_role()` devolve null para quem esta inativo, e
-- como `lojas_permitidas()` deriva dela, o acesso cai nas seis tabelas de uma
-- vez. Uma unica linha de defesa, no lugar onde ja mora a regra.
-- =====================================================================

alter table public.usuarios
  add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_status_valido'
  ) then
    alter table public.usuarios
      add constraint usuarios_status_valido check (status in ('ativo', 'inativo'));
  end if;
end $$;

create index if not exists idx_usuarios_status on public.usuarios (status);

-- ---------------------------------------------------------------------
-- Helpers de permissao: passam a ignorar usuario inativo.
-- O corpo e identico ao de 002_rls.sql, com o filtro de status somado.
-- ---------------------------------------------------------------------
create or replace function public.usuario_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo';
$$;

create or replace function public.usuario_franqueado_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select u.franqueado_id from public.usuarios u where u.id = auth.uid() and u.status = 'ativo';
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo') = 'super_admin',
    false
  );
$$;

create or replace function public.pode_gerenciar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo')
      in ('super_admin', 'franqueado'),
    false
  );
$$;

-- `lojas_permitidas()` nao muda: ela comeca por `usuario_role()`, que agora
-- devolve null para o inativo e faz a funcao retornar conjunto vazio.

-- ---------------------------------------------------------------------
-- Um usuario inativo continua lendo a PROPRIA linha (policy usuarios_select
-- permite `id = auth.uid()`). Isso e proposital: a aplicacao precisa ler o
-- status para deslogar a pessoa com uma mensagem, em vez de mostrar uma tela
-- vazia sem explicacao.
-- ---------------------------------------------------------------------
