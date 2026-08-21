-- =====================================================================
-- 005 - PROTECAO DOS CAMPOS SENSIVEIS DE public.usuarios
-- Execute depois de 004_usuario_status.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE  (escalada de privilegio)
--
-- A policy `usuarios_update` (002_rls.sql) libera a edicao quando
-- `id = auth.uid()`, tanto no USING quanto no WITH CHECK, sem restringir
-- coluna alguma. Na pratica, qualquer usuario autenticado podia rodar:
--
--     update public.usuarios set role = 'franqueado' where id = auth.uid();
--
-- As duas clausulas passam — a linha e dele — e `usuario_role()` passa a
-- devolver 'franqueado'. Como TODA a visibilidade do sistema deriva dessa
-- funcao, um agendador se promovia sozinho e enxergava o tenant inteiro.
-- A mesma brecha permitia trocar o proprio `franqueado_id` (pular para
-- outro tenant) e reativar o proprio `status` depois de desligado,
-- desfazendo o encerramento de acesso feito pelo franqueado.
--pode seguir para a proxima etapa
-- POR QUE TRIGGER, E NAO POLICY
-- Uma policy WITH CHECK enxerga apenas a linha NOVA; ela nao sabe qual era
-- o papel antes e por isso nao consegue exigir "role nao mudou". O trigger
-- BEFORE UPDATE recebe OLD e NEW e compara os dois, que e exatamente o que
-- a regra precisa. A policy continua valendo para o resto — a edicao do
-- proprio nome segue liberada.
-- =====================================================================

create or replace function public.protege_campos_sensiveis_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- service_role (scripts de seed, Admin API) nao tem auth.uid() e ja
  -- ignora RLS por natureza; barrar aqui so quebraria a automacao.
  if auth.uid() is null then
    return new;
  end if;

  -- super_admin e franqueado gerenciam a equipe: e o caminho legitimo,
  -- usado por atualizarUsuario e definirStatusUsuario.
  if public.pode_gerenciar() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Sem permissao para alterar o papel do usuario' using errcode = '42501';
  end if;

  if new.franqueado_id is distinct from old.franqueado_id then
    raise exception 'Sem permissao para alterar o franqueado do usuario' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Sem permissao para alterar o status do usuario' using errcode = '42501';
  end if;

  -- O id e chave primaria referenciada por agendamentos; trocar quebraria
  -- o historico mesmo sem ser escalada.
  if new.id is distinct from old.id then
    raise exception 'O identificador do usuario nao pode ser alterado' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_usuarios_campos_sensiveis on public.usuarios;
create trigger trg_usuarios_campos_sensiveis
  before update on public.usuarios
  for each row execute function public.protege_campos_sensiveis_usuario();

-- Sobra ao usuario comum o que faz sentido editar na propria linha: `nome`.
-- `email` acompanha auth.users e tem fluxo proprio de reconfirmacao.
