-- =====================================================================
-- 006 - ANONIMIZACAO (LGPD)
-- Execute depois de 005_protege_campos_sensiveis.sql.
--
-- O PROBLEMA
-- `agendamentos` guarda nome, CPF, e-mail e telefone de clientes finais.
-- CPF e dado pessoal sob regime estrito, e a LGPD da ao titular o direito
-- de pedir a eliminacao (art. 18, VI). Ate aqui nao havia como atender esse
-- pedido: nem pela tela, nem sem quebrar os relatorios.
--
-- POR QUE ANONIMIZAR EM VEZ DE APAGAR
-- Apagar a linha destroi a metrica: o agendamento e o fato que o sistema
-- existe para medir, e some do historico da loja e do agendador. A LGPD
-- resolve isso no art. 12 — dado anonimizado deixa de ser dado pessoal.
-- Entao limpamos os campos que identificam a pessoa e preservamos loja,
-- agendador, data e status, que nao identificam ninguem.
--
-- `anonimizado_em` marca quando aconteceu. Serve de prova de atendimento ao
-- pedido do titular e evita reprocessar as mesmas linhas na rotina de
-- retencao.
-- =====================================================================

alter table public.agendamentos
  add column if not exists anonimizado_em timestamptz;

comment on column public.agendamentos.anonimizado_em is
  'Quando os dados pessoais do cliente foram removidos (LGPD art. 18, VI). Nulo = dados presentes.';

-- Indice parcial: as consultas de retencao procuram o que AINDA nao foi
-- anonimizado, entao indexar so essas linhas mantem o indice pequeno.
create index if not exists idx_agendamentos_nao_anonimizados
  on public.agendamentos (data_agendamento)
  where anonimizado_em is null;

-- ---------------------------------------------------------------------
-- A anonimizacao em si roda pela aplicacao, sob RLS, para o registro de
-- quem executou continuar valendo. Esta funcao existe para a rotina de
-- retencao, que roda com service role e precisa varrer o tenant inteiro.
--
-- CPF vira NULL nao: a coluna e NOT NULL e mudar isso quebraria o insert.
-- Usamos marcadores fixos, iguais para todos, que nao permitem reidentificar.
-- ---------------------------------------------------------------------
create or replace function public.anonimizar_agendamentos_antigos(meses int default 24)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_total int;
begin
  with alvo as (
    update public.agendamentos
    set cliente_nome     = 'Cliente anonimizado',
        cliente_cpf      = '000.000.000-00',
        cliente_telefone = '(00) 00000-0000',
        cliente_email    = null,
        observacoes      = null,
        anonimizado_em   = now()
    where anonimizado_em is null
      and data_agendamento < (current_date - make_interval(months => meses))
    returning 1
  )
  select count(*) into v_total from alvo;

  return v_total;
end;
$$;

comment on function public.anonimizar_agendamentos_antigos(int) is
  'Aplica a politica de retencao: limpa dados pessoais de agendamentos mais antigos que N meses. Devolve quantos foram tratados.';
