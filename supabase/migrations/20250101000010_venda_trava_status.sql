-- =====================================================================
-- 011 - VENDA TRAVA A MUDANCA DE STATUS
-- Execute depois de 010_relatorio_semanal.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE
-- A migration 008 criou um trigger que exige comparecimento para registrar
-- venda. Mas ele dispara em `vendas`, na insercao — e nada impedia mudar o
-- status do agendamento DEPOIS:
--
--     1. marca comparecimento
--     2. registra a venda           (o trigger aprova)
--     3. muda o status para nao_compareceu
--
-- A venda sobrevivia ao passo 3 e continuava somando no faturamento. Ou
-- seja, a rede exibia receita de um cliente que nao apareceu — e o numero
-- so seria questionado no fechamento, quando ninguem lembra do passo 3.
--
-- POR QUE BLOQUEAR EM VEZ DE APAGAR A VENDA
-- Apagar em cascata resolveria a inconsistencia destruindo um lancamento
-- financeiro sem ninguem pedir. Bloquear devolve a decisao a quem esta
-- editando: se a venda nao aconteceu, ela e removida de forma explicita, e
-- isso fica registrado.
-- =====================================================================

create or replace function public.status_respeita_venda()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- So interessa a saida de 'compareceu'. Entrar nele, ou mudar qualquer
  -- outro campo, segue livre.
  if old.status = 'compareceu' and new.status is distinct from 'compareceu' then
    if exists (select 1 from public.vendas v where v.agendamento_id = old.id) then
      raise exception
        'Este atendimento tem venda registrada. Remova a venda antes de alterar o comparecimento.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_status_venda on public.agendamentos;
create trigger trg_agendamentos_status_venda
  before update of status on public.agendamentos
  for each row execute function public.status_respeita_venda();

-- A exclusao do agendamento continua permitida: `vendas.agendamento_id` tem
-- `on delete cascade`, entao a venda vai junto e nao sobra linha orfa. Quem
-- apaga o atendimento inteiro esta assumindo que ele nao existiu.
