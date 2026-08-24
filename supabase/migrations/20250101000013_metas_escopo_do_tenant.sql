-- =====================================================================
-- 014 - METAS: O ESCOPO ESTAVA SO NA ESCRITA
-- Execute depois de 013_super_admin_so_por_super_admin.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE  (vazamento e escrita entre tenants)
--
-- `metas_write` foi criada como `for all` com:
--
--     using (public.pode_gerenciar())
--
-- Sem escopo nenhum. O `with check` dela e bem restrito — exige vinculo ativo
-- numa loja permitida —, e e ele que se ve ao ler a migration 009. Mas
-- `using` e `with check` respondem por coisas diferentes: o primeiro decide
-- QUAIS LINHAS a pessoa alcanca; o segundo, como a linha pode FICAR.
--
-- Duas consequencias, medidas no banco de verificacao com dois tenants:
--
--   franqueado do tenant A enxerga a meta do tenant B  -> 1 linha
--   franqueado do tenant A apaga a meta do tenant B    -> apagou
--
-- A leitura vaza porque `for all` cobre SELECT tambem, e policies permissivas
-- se somam por OU: o `metas_select`, esse sim escopado, e atropelado por um
-- `using` mais largo. E o DELETE nao tem `with check` — so `using` — entao
-- nada o segurava.
--
-- POR QUE O ESCOPO AQUI E O TENANT, E NAO O VINCULO ATIVO
-- Copiar a condicao do `with check` para o `using` deixaria a meta de quem
-- foi desligado sem dono: o desligamento encerra o vinculo, e ninguem mais
-- conseguiria remove-la. O `using` responde "esta pessoa e da minha rede?",
-- que e a fronteira certa e nao depende de vinculo.
--
-- O `with check` continua exigindo vinculo ativo: criar ou editar meta de
-- quem nao esta lotado em lugar nenhum nao faz sentido.
-- =====================================================================

drop policy if exists metas_write on public.metas;
create policy metas_write on public.metas for all to authenticated
using (
  public.pode_gerenciar()
  and exists (
    select 1 from public.usuarios u
    where u.id = metas.usuario_id
      and (public.is_super_admin() or u.franqueado_id = public.usuario_franqueado_id())
  )
)
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
