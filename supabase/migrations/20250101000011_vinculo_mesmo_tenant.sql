-- =====================================================================
-- 012 - VINCULO SO DENTRO DO PROPRIO TENANT
-- Execute depois de 011_venda_trava_status.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE  (vazamento entre tenants)
--
-- `lojas_permitidas()` devolve, para o agendador, as lojas onde ele tem
-- vinculo ativo — sem conferir se a loja pertence ao franqueado DELE:
--
--     select a.loja_id from agendadores_lojas a
--     where a.usuario_id = auth.uid() and a.data_fim is null
--
-- Bastava existir uma linha em `agendadores_lojas` ligando um usuario do
-- tenant A a uma loja do tenant B para esse usuario passar a enxergar os
-- agendamentos do tenant B. O RLS fazia exatamente o que estava escrito; o
-- furo era o vinculo poder existir.
--
-- E ele podia: `criarUsuario` grava o vinculo pelo cliente com service role,
-- que ignora RLS por natureza — a Admin API e necessaria para criar a conta
-- em auth.users. Um franqueado enviando `loja_id` de outro tenant na
-- requisicao criava o vinculo cruzado sem encontrar barreira nenhuma.
--
-- POR QUE NO BANCO
-- A aplicacao tambem foi corrigida, mas a regra precisa valer para qualquer
-- caminho: script, correcao manual, rota futura, e principalmente qualquer
-- codigo que use service role. O schema ja adota essa postura em
-- `validar_tenant_agendamento`; aqui os vinculos ganham a mesma.
-- =====================================================================

create or replace function public.vinculo_exige_mesmo_tenant()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_franqueado_usuario uuid;
  v_franqueado_loja    uuid;
begin
  select u.franqueado_id into v_franqueado_usuario
  from public.usuarios u where u.id = new.usuario_id;

  select l.franqueado_id into v_franqueado_loja
  from public.lojas l where l.id = new.loja_id;

  -- `is distinct from` cobre o caso do super_admin, cujo franqueado_id e
  -- nulo: ele administra pelo painel proprio e nao se vincula a loja.
  if v_franqueado_usuario is distinct from v_franqueado_loja then
    raise exception
      'A loja pertence a outro franqueado. Vinculo so dentro do proprio tenant.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agendadores_lojas_tenant on public.agendadores_lojas;
create trigger trg_agendadores_lojas_tenant
  before insert or update of usuario_id, loja_id on public.agendadores_lojas
  for each row execute function public.vinculo_exige_mesmo_tenant();

drop trigger if exists trg_participacoes_tenant on public.participacoes_societarias;
create trigger trg_participacoes_tenant
  before insert or update of usuario_id, loja_id on public.participacoes_societarias
  for each row execute function public.vinculo_exige_mesmo_tenant();

-- O trigger dispara apenas quando `usuario_id` ou `loja_id` mudam. Encerrar
-- vinculo (data_fim) e reabrir continuam livres, sem pagar a consulta.
