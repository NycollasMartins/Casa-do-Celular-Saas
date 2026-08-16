-- =====================================================================
-- 002 - ROW LEVEL SECURITY
-- Execute depois de 001_schema.sql.
--
-- POR QUE FUNCOES SECURITY DEFINER?
-- Uma policy da tabela `usuarios` que precise consultar `usuarios` para
-- descobrir o papel do usuario logado entra em recursao infinita
-- (o Postgres reaplica a policy na subquery). As funcoes abaixo rodam
-- como owner (security definer), ignorando RLS, e por isso quebram o
-- ciclo. Elas sao a UNICA fonte de verdade de permissao do sistema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de permissao
-- ---------------------------------------------------------------------
create or replace function public.usuario_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select u.role from public.usuarios u where u.id = auth.uid();
$$;

create or replace function public.usuario_franqueado_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select u.franqueado_id from public.usuarios u where u.id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select u.role from public.usuarios u where u.id = auth.uid()) = 'super_admin', false);
$$;

-- Conjunto de lojas que o usuario logado pode enxergar.
-- super_admin -> todas
-- franqueado  -> as do seu tenant
-- diretor     -> apenas onde tem participacao ATIVA (data_fim is null)
-- agendador   -> apenas a loja em que esta alocado
create or replace function public.lojas_permitidas()
returns setof uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.user_role := public.usuario_role();
begin
  if v_role is null then
    return;
  elsif v_role = 'super_admin' then
    return query select l.id from public.lojas l;
  elsif v_role = 'franqueado' then
    return query
      select l.id from public.lojas l
      where l.franqueado_id = public.usuario_franqueado_id();
  elsif v_role = 'diretor' then
    return query
      select p.loja_id from public.participacoes_societarias p
      where p.usuario_id = auth.uid() and p.data_fim is null;
  elsif v_role = 'agendador' then
    return query
      select a.loja_id from public.agendadores_lojas a
      where a.usuario_id = auth.uid() and a.data_fim is null;
  end if;
  return;
end;
$$;

-- Papeis que podem administrar cadastros dentro do tenant.
create or replace function public.pode_gerenciar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.usuarios u where u.id = auth.uid()) in ('super_admin', 'franqueado'),
    false
  );
$$;

grant execute on function public.usuario_role,
                          public.usuario_franqueado_id,
                          public.is_super_admin,
                          public.lojas_permitidas,
                          public.pode_gerenciar
  to authenticated;

-- ---------------------------------------------------------------------
-- Habilita RLS em TODAS as tabelas
-- ---------------------------------------------------------------------
alter table public.franqueados               enable row level security;
alter table public.usuarios                  enable row level security;
alter table public.lojas                     enable row level security;
alter table public.participacoes_societarias enable row level security;
alter table public.agendadores_lojas         enable row level security;
alter table public.agendamentos              enable row level security;

-- ---------------------------------------------------------------------
-- franqueados
-- ---------------------------------------------------------------------
drop policy if exists franqueados_select on public.franqueados;
create policy franqueados_select on public.franqueados for select to authenticated
using (public.is_super_admin() or id = public.usuario_franqueado_id());

drop policy if exists franqueados_insert on public.franqueados;
create policy franqueados_insert on public.franqueados for insert to authenticated
with check (public.is_super_admin());

drop policy if exists franqueados_update on public.franqueados;
create policy franqueados_update on public.franqueados for update to authenticated
using (public.is_super_admin() or (public.usuario_role() = 'franqueado' and id = public.usuario_franqueado_id()))
with check (public.is_super_admin() or (public.usuario_role() = 'franqueado' and id = public.usuario_franqueado_id()));

drop policy if exists franqueados_delete on public.franqueados;
create policy franqueados_delete on public.franqueados for delete to authenticated
using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- usuarios
-- Cada um ve a si mesmo; franqueado ve o time do tenant; diretor e
-- agendador veem colegas das lojas que ja podem enxergar (necessario
-- para exibir o nome do agendador na tabela e nos filtros).
-- ---------------------------------------------------------------------
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or (public.usuario_role() = 'franqueado' and franqueado_id = public.usuario_franqueado_id())
  or exists (
    select 1 from public.agendadores_lojas al
    where al.usuario_id = usuarios.id
      and al.data_fim is null
      and al.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios for insert to authenticated
with check (
  public.is_super_admin()
  or (public.usuario_role() = 'franqueado'
      and franqueado_id = public.usuario_franqueado_id()
      and role <> 'super_admin')
);

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or (public.usuario_role() = 'franqueado' and franqueado_id = public.usuario_franqueado_id())
)
with check (
  id = auth.uid()
  or public.is_super_admin()
  or (public.usuario_role() = 'franqueado' and franqueado_id = public.usuario_franqueado_id())
);

drop policy if exists usuarios_delete on public.usuarios;
create policy usuarios_delete on public.usuarios for delete to authenticated
using (public.is_super_admin() or (public.usuario_role() = 'franqueado' and franqueado_id = public.usuario_franqueado_id()));

-- ---------------------------------------------------------------------
-- lojas
-- ---------------------------------------------------------------------
drop policy if exists lojas_select on public.lojas;
create policy lojas_select on public.lojas for select to authenticated
using (id in (select public.lojas_permitidas()));

drop policy if exists lojas_insert on public.lojas;
create policy lojas_insert on public.lojas for insert to authenticated
with check (
  public.is_super_admin()
  or (public.usuario_role() = 'franqueado' and franqueado_id = public.usuario_franqueado_id())
);

drop policy if exists lojas_update on public.lojas;
create policy lojas_update on public.lojas for update to authenticated
using (public.pode_gerenciar() and id in (select public.lojas_permitidas()))
with check (public.is_super_admin() or franqueado_id = public.usuario_franqueado_id());

drop policy if exists lojas_delete on public.lojas;
create policy lojas_delete on public.lojas for delete to authenticated
using (public.pode_gerenciar() and id in (select public.lojas_permitidas()));

-- ---------------------------------------------------------------------
-- participacoes_societarias
-- ---------------------------------------------------------------------
drop policy if exists participacoes_select on public.participacoes_societarias;
create policy participacoes_select on public.participacoes_societarias for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (public.usuario_role() = 'franqueado' and loja_id in (select public.lojas_permitidas()))
);

drop policy if exists participacoes_write on public.participacoes_societarias;
create policy participacoes_write on public.participacoes_societarias for all to authenticated
using (public.pode_gerenciar() and loja_id in (select public.lojas_permitidas()))
with check (public.pode_gerenciar() and loja_id in (select public.lojas_permitidas()));

-- ---------------------------------------------------------------------
-- agendadores_lojas
-- ---------------------------------------------------------------------
drop policy if exists agendadores_lojas_select on public.agendadores_lojas;
create policy agendadores_lojas_select on public.agendadores_lojas for select to authenticated
using (usuario_id = auth.uid() or loja_id in (select public.lojas_permitidas()));

drop policy if exists agendadores_lojas_write on public.agendadores_lojas;
create policy agendadores_lojas_write on public.agendadores_lojas for all to authenticated
using (public.pode_gerenciar() and loja_id in (select public.lojas_permitidas()))
with check (public.pode_gerenciar() and loja_id in (select public.lojas_permitidas()));

-- ---------------------------------------------------------------------
-- agendamentos (a policy mais importante do sistema)
-- ---------------------------------------------------------------------
drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select on public.agendamentos for select to authenticated
using (loja_id in (select public.lojas_permitidas()));

-- Agendador so cria em nome proprio; gestores podem lancar por terceiros.
drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos for insert to authenticated
with check (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
);

drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos for update to authenticated
using (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
)
with check (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
);

-- Agendador nao apaga historico: so gestor (super_admin, franqueado, diretor).
drop policy if exists agendamentos_delete on public.agendamentos;
create policy agendamentos_delete on public.agendamentos for delete to authenticated
using (
  loja_id in (select public.lojas_permitidas())
  and public.usuario_role() in ('super_admin', 'franqueado', 'diretor')
);
