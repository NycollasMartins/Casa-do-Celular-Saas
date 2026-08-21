-- =====================================================================
-- Asserçoes das FUNCOES SQL, com dados de verdade.
--
-- As funcoes de anonimizacao, lembrete e resumo semanal foram escritas e
-- nunca executadas — a aplicacao so as chama por RPC, e o banco onde elas
-- deveriam existir nunca as recebeu. Aqui elas rodam contra o seed.
--
-- Tudo o que escreve, desfaz no final: o arquivo precisa ser re-executavel.
-- =====================================================================
\set QUIET on

create temp table resultado_funcoes(
  ordem serial, caso text, esperado text, obtido text, situacao text
);
grant all on resultado_funcoes to public;

create or replace function pg_temp.checar(p_caso text, p_esperado text, p_obtido text)
returns void language sql as $$
  insert into resultado_funcoes(caso, esperado, obtido, situacao)
  values (p_caso, p_esperado, p_obtido,
          case when p_esperado = p_obtido then 'PASSOU' else '>>> FALHOU' end);
$$;

-- ---------------------------------------------------------------------
-- agendamentos_para_lembrete (migration 007)
-- ---------------------------------------------------------------------
do $$
declare
  v_loja uuid; v_franq uuid; v_agendador uuid; v_id uuid; v_total int;
begin
  select id into v_loja from public.lojas order by nome limit 1;
  select franqueado_id into v_franq from public.lojas where id = v_loja;
  select usuario_id into v_agendador from public.agendadores_lojas
    where loja_id = v_loja and data_fim is null limit 1;

  insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
    cliente_cpf, cliente_telefone, cliente_email, data_agendamento, status)
  values (v_franq, v_loja, v_agendador, 'Fulano de Teste', '529.982.247-25',
          '(61) 99999-0000', 'fulano@teste.com', current_date + 1, 'agendado')
  returning id into v_id;

  select count(*) into v_total
  from public.agendamentos_para_lembrete(current_date + 1) where id = v_id;
  perform pg_temp.checar('lembrete lista quem tem visita amanha', '1', v_total::text);

  -- Status diferente de 'agendado' nao deve ser lembrado.
  update public.agendamentos set status = 'contatado' where id = v_id;
  select count(*) into v_total
  from public.agendamentos_para_lembrete(current_date + 1) where id = v_id;
  perform pg_temp.checar('quem so foi contatado nao entra', '0', v_total::text);
  update public.agendamentos set status = 'agendado' where id = v_id;

  -- Ja lembrado nao aparece de novo: e o que impede o envio em duplicidade.
  insert into public.notificacoes (agendamento_id, tipo, canal, status)
  values (v_id, 'vespera', 'email', 'enviada');

  select count(*) into v_total
  from public.agendamentos_para_lembrete(current_date + 1) where id = v_id;
  perform pg_temp.checar('quem ja recebeu nao entra de novo', '0', v_total::text);

  -- Falha anterior NAO bloqueia a reentrega.
  delete from public.notificacoes where agendamento_id = v_id;
  insert into public.notificacoes (agendamento_id, tipo, canal, status, detalhe)
  values (v_id, 'vespera', 'email', 'falhou', 'provedor fora do ar');

  select count(*) into v_total
  from public.agendamentos_para_lembrete(current_date + 1) where id = v_id;
  perform pg_temp.checar('falha anterior permite nova tentativa', '1', v_total::text);

  delete from public.notificacoes where agendamento_id = v_id;
  delete from public.agendamentos where id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- anonimizar_agendamentos_antigos (migration 006)
-- ---------------------------------------------------------------------
do $$
declare
  v_loja uuid; v_franq uuid; v_agendador uuid; v_id uuid;
  v_tratados int; v_nome text; v_cpf text; v_status text; v_loja_depois uuid;
begin
  select id into v_loja from public.lojas order by nome limit 1;
  select franqueado_id into v_franq from public.lojas where id = v_loja;
  select usuario_id into v_agendador from public.agendadores_lojas
    where loja_id = v_loja and data_fim is null limit 1;

  insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
    cliente_cpf, cliente_telefone, cliente_email, observacoes, data_agendamento, status)
  values (v_franq, v_loja, v_agendador, 'Antigo de Teste', '111.444.777-35',
          '(61) 98888-0000', 'antigo@teste.com', 'irma da Dona Maria, quadra 12',
          current_date - interval '40 months', 'compareceu')
  returning id into v_id;

  select public.anonimizar_agendamentos_antigos(24) into v_tratados;
  perform pg_temp.checar('anonimizacao trata o registro vencido',
    'pelo menos 1', case when v_tratados >= 1 then 'pelo menos 1' else v_tratados::text end);

  select cliente_nome, cliente_cpf, status, loja_id
    into v_nome, v_cpf, v_status, v_loja_depois
  from public.agendamentos where id = v_id;

  perform pg_temp.checar('nome vira marcador fixo', 'Cliente anonimizado', v_nome);
  perform pg_temp.checar('CPF vira marcador fixo', '000.000.000-00', v_cpf);
  perform pg_temp.checar('observacoes sao limpas', 'vazio',
    coalesce((select case when observacoes is null then 'vazio' else 'sobrou' end
              from public.agendamentos where id = v_id), 'vazio'));
  perform pg_temp.checar('e-mail e limpo', 'vazio',
    coalesce((select case when cliente_email is null then 'vazio' else 'sobrou' end
              from public.agendamentos where id = v_id), 'vazio'));

  -- O ponto da anonimizacao: a metrica sobrevive.
  perform pg_temp.checar('status e preservado para a metrica', 'compareceu', v_status);
  perform pg_temp.checar('loja e preservada para a metrica', v_loja::text, v_loja_depois::text);

  perform pg_temp.checar('marca a data da anonimizacao', 'marcado',
    (select case when anonimizado_em is not null then 'marcado' else 'nao marcado' end
     from public.agendamentos where id = v_id));

  -- Rodar de novo nao retrata o mesmo registro.
  select public.anonimizar_agendamentos_antigos(24) into v_tratados;
  perform pg_temp.checar('nao reprocessa o que ja foi anonimizado', '0', v_tratados::text);

  delete from public.agendamentos where id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- resumo_do_periodo (migration 010)
-- ---------------------------------------------------------------------
do $$
declare
  v_franq uuid; v_contatos bigint; v_compareceram bigint; v_receita numeric;
  v_vendas bigint; v_melhor text; v_esperado bigint;
begin
  select id into v_franq from public.franqueados limit 1;

  select contatos, compareceram, vendas, receita, melhor_loja
    into v_contatos, v_compareceram, v_vendas, v_receita, v_melhor
  from public.resumo_do_periodo(v_franq, current_date - 400, current_date + 400);

  select count(*) into v_esperado from public.agendamentos where franqueado_id = v_franq;
  perform pg_temp.checar('resumo conta todos os agendamentos do periodo',
    v_esperado::text, v_contatos::text);

  select count(*) into v_esperado
  from public.agendamentos where franqueado_id = v_franq and status = 'compareceu';
  perform pg_temp.checar('resumo conta os comparecimentos',
    v_esperado::text, v_compareceram::text);

  perform pg_temp.checar('resumo aponta a loja com mais comparecimentos',
    'apontou', case when v_melhor is null then 'nulo' else 'apontou' end);

  -- Periodo sem movimento devolve zero, nao nulo: o script decide o envio
  -- comparando com zero.
  select contatos, receita into v_contatos, v_receita
  from public.resumo_do_periodo(v_franq, '1990-01-01', '1990-12-31');
  perform pg_temp.checar('periodo vazio devolve zero contatos', '0', v_contatos::text);
  perform pg_temp.checar('periodo vazio devolve receita zero, nao nulo', '0', v_receita::text);
end $$;

-- ---------------------------------------------------------------------
-- Venda trava a mudanca de status (migration 011)
--
-- O trigger da 008 exige comparecimento para REGISTRAR a venda, mas nada
-- impedia mudar o status depois — e o faturamento passava a contar um
-- cliente que nao apareceu.
-- ---------------------------------------------------------------------
do $$
declare v_id uuid; v_venda uuid; v_erro text; v_gestor uuid;
begin
  select id into v_gestor from public.usuarios where role = 'franqueado' limit 1;
  select a.id into v_id
  from public.agendamentos a
  left join public.vendas v on v.agendamento_id = a.id
  where a.status = 'compareceu' and v.id is null
  limit 1;

  insert into public.vendas (agendamento_id, valor, data_venda, registrada_por)
  values (v_id, 999.99, current_date, v_gestor)
  returning id into v_venda;

  begin
    update public.agendamentos set status = 'nao_compareceu' where id = v_id;
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('mudar status com venda registrada e barrado', 'barrou', v_erro);
  perform pg_temp.checar('o status permanece intacto apos a tentativa', 'compareceu',
    (select status from public.agendamentos where id = v_id));

  -- Outros campos seguem editaveis: a trava e so na saida de 'compareceu'.
  begin
    update public.agendamentos set observacoes = 'anotacao' where id = v_id;
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('editar outro campo com venda continua liberado', 'permitiu', v_erro);
  update public.agendamentos set observacoes = null where id = v_id;

  delete from public.vendas where id = v_venda;
  begin
    update public.agendamentos set status = 'nao_compareceu' where id = v_id;
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('removida a venda, o status volta a mudar', 'permitiu', v_erro);
  update public.agendamentos set status = 'compareceu' where id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- Vinculo so dentro do proprio tenant (migration 012)
--
-- lojas_permitidas() devolve as lojas onde o agendador tem vinculo ativo,
-- sem conferir tenant. Bastava existir um vinculo cruzado para um usuario
-- do tenant A enxergar os agendamentos do tenant B — e o cliente com
-- service role, usado para criar usuario, criava esse vinculo sem barreira.
-- ---------------------------------------------------------------------
do $$
declare v_franq_b uuid; v_loja_b uuid; v_user uuid; v_loja_a uuid; v_erro text;
begin
  insert into public.franqueados (nome, status) values ('__tenant_teste__', 'ativo')
  returning id into v_franq_b;
  insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade)
  values (v_franq_b, '__loja_teste__', 'TESTE-B1', 'SP', 'Sao Paulo')
  returning id into v_loja_b;

  select id into v_user from public.usuarios where role = 'agendador' limit 1;

  begin
    insert into public.agendadores_lojas (usuario_id, loja_id, data_inicio)
    values (v_user, v_loja_b, current_date);
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('lotacao em loja de outro tenant e barrada', 'barrou', v_erro);

  begin
    insert into public.participacoes_societarias
      (usuario_id, loja_id, percentual_participacao, cargo, data_inicio)
    values (v_user, v_loja_b, 10, 'diretor', current_date);
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('participacao em loja de outro tenant e barrada', 'barrou', v_erro);

  -- Dentro do proprio tenant segue liberado.
  select l.id into v_loja_a
  from public.lojas l
  join public.usuarios u on u.franqueado_id = l.franqueado_id
  where u.id = v_user
    and l.id not in (select loja_id from public.agendadores_lojas where usuario_id = v_user)
  limit 1;

  begin
    insert into public.agendadores_lojas (usuario_id, loja_id, data_inicio)
    values (v_user, v_loja_a, current_date);
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('lotacao no proprio tenant continua liberada', 'permitiu', v_erro);

  delete from public.agendadores_lojas where usuario_id = v_user and loja_id = v_loja_a;
  delete from public.lojas where id = v_loja_b;
  delete from public.franqueados where id = v_franq_b;
end $$;

-- ---------------------------------------------------------------------
-- RLS de metas (migration 009): o agendador le a propria
-- ---------------------------------------------------------------------
do $$
declare v_agendador uuid; v_outro uuid; v_gestor uuid; v_visiveis int;
begin
  select u.id into v_agendador from public.usuarios u
    where u.email = 'agendador1.loja1@franqueado.com.br';
  select u.id into v_outro from public.usuarios u
    where u.email = 'agendador1.loja9@franqueado.com.br';
  select u.id into v_gestor from public.usuarios u where u.role = 'franqueado' limit 1;

  insert into public.metas (usuario_id, competencia, meta_agendamentos, definida_por)
  values (v_agendador, date_trunc('month', current_date)::date, 60, v_gestor),
         (v_outro,     date_trunc('month', current_date)::date, 40, v_gestor)
  on conflict (usuario_id, competencia) do nothing;

  perform set_config('request.jwt.claim.sub', v_agendador::text, false);
  set local role authenticated;
  select count(*) into v_visiveis from public.metas;
  reset role;

  perform pg_temp.checar('agendador le a propria meta e nao a do colega', '1', v_visiveis::text);

  delete from public.metas where usuario_id in (v_agendador, v_outro);
end $$;

\pset tuples_only off
select situacao, caso, esperado, obtido from resultado_funcoes order by ordem;
select count(*) filter (where situacao = 'PASSOU') || ' passaram, ' ||
       count(*) filter (where situacao <> 'PASSOU') || ' falharam' as total
from resultado_funcoes;

do $$
declare v_falhas int;
begin
  select count(*) into v_falhas from resultado_funcoes where situacao <> 'PASSOU';
  if v_falhas > 0 then
    raise exception '% assercao(oes) de funcao falharam', v_falhas;
  end if;
end $$;
