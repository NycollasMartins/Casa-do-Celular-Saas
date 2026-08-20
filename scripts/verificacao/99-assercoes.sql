\set QUIET on
\pset tuples_only off

create or replace function pg_temp.como(p_email text) returns void
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v_id::text, false);
end $$;

create temp table resultado(ordem serial, caso text, esperado text, obtido text, situacao text);

-- O papel `authenticated` precisa gravar aqui durante a impersonacao.
grant all on resultado to public;
grant usage, select on all sequences in schema pg_temp to public;

create or replace function pg_temp.checar(p_caso text, p_esperado text, p_obtido text) returns void
language sql as $$
  insert into resultado(caso, esperado, obtido, situacao)
  values (p_caso, p_esperado, p_obtido,
          case when p_esperado = p_obtido then 'PASSOU' else '>>> FALHOU' end);
$$;

-- ============ visibilidade por papel ============
select pg_temp.como('dono@franqueado.com.br');
set role authenticated;
select pg_temp.checar('franqueado ve todas as lojas', '9', (select count(*)::text from public.lojas));
reset role;

select pg_temp.como('diretor1@franqueado.com.br');
set role authenticated;
select pg_temp.checar('diretor 1 ve lojas 1-5', '5', (select count(*)::text from public.lojas));
reset role;

select pg_temp.como('diretor2@franqueado.com.br');
set role authenticated;
select pg_temp.checar('diretor 2 ve lojas 6-9', '4', (select count(*)::text from public.lojas));
reset role;

select pg_temp.como('agendador1.loja1@franqueado.com.br');
set role authenticated;
select pg_temp.checar('agendador ve so a propria loja', '1', (select count(*)::text from public.lojas));
-- A policy libera `id = usuario_franqueado_id()`: o proprio tenant, e so ele.
select pg_temp.checar('agendador ve so o proprio franqueado', '1', (select count(*)::text from public.franqueados));
select pg_temp.checar('agendador nao ve participacoes', '0', (select count(*)::text from public.participacoes_societarias));
reset role;

-- ============ ESCALADA DE PRIVILEGIO (migration 005) ============
select pg_temp.como('agendador1.loja1@franqueado.com.br');
set role authenticated;
do $$
declare v_erro text := 'nao barrou';
begin
  begin
    update public.usuarios set role = 'franqueado' where id = auth.uid();
    v_erro := 'nao barrou';
  exception when others then
    v_erro := 'barrou';
  end;
  perform pg_temp.checar('agendador NAO vira franqueado', 'barrou', v_erro);
end $$;

select pg_temp.checar('papel continua agendador', 'agendador',
  (select role::text from public.usuarios where id = auth.uid()));

do $$
declare v_erro text;
begin
  begin
    update public.usuarios set franqueado_id = gen_random_uuid() where id = auth.uid();
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('agendador NAO troca de tenant', 'barrou', v_erro);
end $$;

do $$
declare v_erro text;
begin
  begin
    update public.usuarios set status = 'inativo' where id = auth.uid();
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('agendador NAO mexe no proprio status', 'barrou', v_erro);
end $$;

do $$
declare v_erro text;
begin
  begin
    update public.usuarios set nome = nome || ' X' where id = auth.uid();
    update public.usuarios set nome = replace(nome, ' X', '') where id = auth.uid();
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('agendador AINDA edita o proprio nome', 'permitiu', v_erro);
end $$;
reset role;

-- ============ escrita de agendamento ============
select pg_temp.como('agendador1.loja1@franqueado.com.br');
set role authenticated;
do $$
declare v_loja_alheia uuid; v_erro text; v_franq uuid;
begin
  reset role;
  select id into v_loja_alheia from public.lojas where nome like '%Loja 9';
  select franqueado_id into v_franq from public.usuarios where id = auth.uid();
  set role authenticated;
  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
      cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja_alheia, auth.uid(), 'Teste', '529.982.247-25',
            '(61) 99999-0000', current_date, 'contatado');
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('agendador NAO cria em loja alheia', 'barrou', v_erro);
end $$;

do $$
declare v_id uuid; v_antes int; v_depois int;
begin
  select id into v_id from public.agendamentos limit 1;
  select count(*) into v_antes from public.agendamentos where id = v_id;
  delete from public.agendamentos where id = v_id;
  select count(*) into v_depois from public.agendamentos where id = v_id;
  perform pg_temp.checar('agendador NAO apaga agendamento',
    v_antes::text, v_depois::text);
end $$;
reset role;

-- ============ venda exige comparecimento (migration 008) ============
select pg_temp.como('dono@franqueado.com.br');
set role authenticated;
do $$
declare v_id uuid; v_erro text;
begin
  select id into v_id from public.agendamentos where status <> 'compareceu' limit 1;
  begin
    insert into public.vendas (agendamento_id, valor, data_venda, registrada_por)
    values (v_id, 100, current_date, auth.uid());
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('venda sem comparecimento e barrada', 'barrou', v_erro);
end $$;

-- As asserçoes precisam ser re-executaveis: `vendas` tem unique
-- (agendamento_id), entao sem a limpeza a segunda rodada acusaria falha onde
-- o comportamento esta correto.
do $$
declare v_id uuid; v_erro text;
begin
  select a.id into v_id
  from public.agendamentos a
  left join public.vendas v on v.agendamento_id = a.id
  where a.status = 'compareceu' and v.id is null
  limit 1;

  if v_id is null then
    perform pg_temp.checar('venda COM comparecimento e aceita', 'permitiu',
      'sem atendimento livre para testar');
    return;
  end if;

  begin
    insert into public.vendas (agendamento_id, valor, data_venda, registrada_por)
    values (v_id, 1500.50, current_date, auth.uid());
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('venda COM comparecimento e aceita', 'permitiu', v_erro);
end $$;

do $$
declare v_id uuid; v_erro text;
begin
  select agendamento_id into v_id from public.vendas limit 1;
  begin
    insert into public.vendas (agendamento_id, valor, data_venda, registrada_por)
    values (v_id, 200, current_date, auth.uid());
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('segunda venda no mesmo atendimento e barrada', 'barrou', v_erro);
end $$;
reset role;

-- Desfaz o que as asserçoes escreveram, para poderem rodar de novo.
reset role;
delete from public.vendas where valor in (1500.50, 200, 100);

\pset tuples_only off
select situacao, caso, esperado, obtido from resultado order by ordem;
select count(*) filter (where situacao = 'PASSOU') || ' passaram, ' ||
       count(*) filter (where situacao <> 'PASSOU') || ' falharam' as total
from resultado;

-- Levanta excecao quando ha falha, para o psql sair com codigo diferente de
-- zero e o script servir de portao no CI.
do $$
declare v_falhas int;
begin
  select count(*) into v_falhas from resultado where situacao <> 'PASSOU';
  if v_falhas > 0 then
    raise exception '% assercao(oes) de RLS falharam', v_falhas;
  end if;
end $$;
