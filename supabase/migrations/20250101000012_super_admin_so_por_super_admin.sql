-- =====================================================================
-- 013 - SO UM SUPER ADMIN CONCEDE O PAPEL DE SUPER ADMIN
-- Execute depois de 012_vinculo_mesmo_tenant.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE  (escalada entre tenants)
--
-- A policy de INSERT em public.usuarios ja impedia um franqueado de criar
-- conta com papel de super admin:
--
--     and role <> 'super_admin'
--
-- A de UPDATE nao ganhou o equivalente. E o trigger de campos sensiveis
-- (005) devolve `new` logo no comeco para quem passa em `pode_gerenciar()`,
-- que inclui o franqueado. Resultado, medido no banco de verificacao:
--
--     franqueado promove um agendador do tenant  -> papel vira super_admin
--     franqueado promove A SI MESMO              -> papel vira super_admin
--
-- Um UPDATE e a rede inteira fica visivel: super admin enxerga todos os
-- franqueados, todas as lojas e todos os agendamentos. A fronteira entre
-- tenants — que e a promessa central de um sistema multiempresa — cai.
--
-- O diretor NAO alcanca isso: a policy de update ja o filtra, e o UPDATE
-- dele afeta zero linhas.
--
-- POR QUE NO TRIGGER, E NAO NA POLICY
-- A policy nao enxerga o papel ANTERIOR. Ela so aprovaria ou recusaria a
-- linha nova, e recusar toda linha com `role = 'super_admin'` impediria ate
-- um super admin de editar o proprio nome. O trigger recebe OLD e NEW e
-- consegue exigir o que a regra realmente diz: conceder o papel e privilegio
-- de quem ja o tem.
--
-- O caminho de service role continua livre, como antes: `auth.uid()` e nulo
-- ali, e a checagem acontece depois dessa saida. E o que a Admin API usa
-- para criar contas, e o schema da aplicacao ja restringe os papeis
-- aceitos no formulario.
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
    -- Menos uma coisa: conceder o proprio papel de super admin. Vale tanto
    -- para promover outra pessoa quanto para promover a si mesmo — os dois
    -- passavam, e o segundo e o mais direto.
    if new.role = 'super_admin'
       and old.role is distinct from 'super_admin'
       and not public.is_super_admin() then
      raise exception 'Apenas um super admin concede o papel de super admin'
        using errcode = '42501';
    end if;

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

-- O trigger em si nao muda; a funcao foi substituida acima.
