\set QUIET on
\pset tuples_only off

create or replace function pg_temp.como(p_email text) returns void
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v_id::text, false);
end $$;

-- Sai da impersonacao. `pg_temp.como` deixa a claim setada, e ela vaza para
-- o bloco seguinte: um preparo feito depois disso roda COMO a ultima pessoa
-- impersonada, e as travas que olham `auth.uid()` disparam contra ele. Em
-- Supabase de verdade esse caminho e o service role, que nao tem claim.
create or replace function pg_temp.como_sistema() returns void
language sql as $$ select set_config('request.jwt.claim.sub', '', false)::void $$;

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

-- ---------------------------------------------------------------------
-- Espelho das afirmacoes de tests/rls/*.test.ts
--
-- Aquelas suites dependem de PostgREST e GoTrue e nunca rodaram. Uma delas
-- ja se mostrou ERRADA — afirmava que o agendador nao alcanca a tabela de
-- franqueados, quando a policy libera o proprio tenant de proposito. Se uma
-- estava errada, as outras merecem a mesma conferencia: aqui elas sao
-- exercitadas em SQL, para nao custarem uma sessao de depuracao quando
-- finalmente rodarem contra o Supabase.
-- ---------------------------------------------------------------------

-- visibilidade.test.ts: "agendadores de lojas diferentes nao se cruzam"
do $$
declare v_um uuid; v_nove uuid; v_cruzamento int;
begin
  select id into v_um from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';
  select id into v_nove from public.usuarios where email = 'agendador1.loja9@franqueado.com.br';

  perform set_config('request.jwt.claim.sub', v_um::text, false);
  set local role authenticated;
  create temp table if not exists lojas_do_um as select id from public.lojas;
  reset role;

  perform set_config('request.jwt.claim.sub', v_nove::text, false);
  set local role authenticated;
  select count(*) into v_cruzamento
  from public.lojas l where l.id in (select id from lojas_do_um);
  reset role;

  perform pg_temp.checar('agendadores de lojas diferentes nao se cruzam', '0', v_cruzamento::text);
  drop table if exists lojas_do_um;
end $$;

-- visibilidade.test.ts: "agendador so alcanca agendamentos da propria loja"
do $$
declare v_id uuid; v_lojas int;
begin
  select id into v_id from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';
  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  select count(distinct loja_id) into v_lojas from public.agendamentos;
  reset role;

  perform pg_temp.checar('agendamentos do agendador vem de uma loja so',
    'no maximo 1', case when v_lojas <= 1 then 'no maximo 1' else v_lojas::text end);
end $$;

-- visibilidade.test.ts: "filtrar por loja alheia devolve vazio, nao erro"
do $$
declare v_id uuid; v_loja9 uuid; v_total int;
begin
  select id into v_loja9 from public.lojas where nome like '%Loja 9';
  select id into v_id from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  select count(*) into v_total from public.agendamentos where loja_id = v_loja9;
  reset role;

  perform pg_temp.checar('pedir loja alheia devolve vazio, nao erro', '0', v_total::text);
end $$;

-- visibilidade.test.ts: quem o franqueado e o agendador enxergam em `usuarios`
do $$
declare v_franq uuid; v_agend uuid; v_do_franq int; v_do_agend int;
begin
  select id into v_franq from public.usuarios where email = 'dono@franqueado.com.br';
  select id into v_agend from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';

  perform set_config('request.jwt.claim.sub', v_franq::text, false);
  set local role authenticated;
  select count(*) into v_do_franq from public.usuarios;
  reset role;

  perform set_config('request.jwt.claim.sub', v_agend::text, false);
  set local role authenticated;
  select count(*) into v_do_agend from public.usuarios;
  reset role;

  perform pg_temp.checar('franqueado enxerga os 21 do tenant',
    'pelo menos 21', case when v_do_franq >= 21 then 'pelo menos 21' else v_do_franq::text end);

  -- O agendador ve a si e aos colegas da propria loja — nao o tenant todo.
  perform pg_temp.checar('agendador ve colegas da loja, nao o tenant inteiro',
    'entre 1 e 20',
    case when v_do_agend between 1 and 20 then 'entre 1 e 20' else v_do_agend::text end);
end $$;

-- escrita.test.ts: "agendador cria agendamento na propria loja em nome proprio"
do $$
declare v_id uuid; v_loja uuid; v_franq uuid; v_erro text; v_novo uuid;
begin
  select id into v_id from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';
  select franqueado_id into v_franq from public.usuarios where id = v_id;
  select loja_id into v_loja from public.agendadores_lojas
    where usuario_id = v_id and data_fim is null limit 1;

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
      cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja, v_id, '__assercao_rls__', '529.982.247-25',
            '(61) 99999-0000', current_date, 'contatado')
    returning id into v_novo;
    v_erro := 'permitiu';
  exception when others then v_erro := 'barrou';
  end;
  reset role;

  perform pg_temp.checar('agendador cria na propria loja em nome proprio', 'permitiu', v_erro);
  delete from public.agendamentos where cliente_nome = '__assercao_rls__';
end $$;

-- escrita.test.ts: "agendador NAO lanca agendamento em nome de outra pessoa"
do $$
declare v_id uuid; v_colega uuid; v_loja uuid; v_franq uuid; v_erro text;
begin
  select id into v_id from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';
  select id into v_colega from public.usuarios where email = 'agendador2.loja1@franqueado.com.br';
  select franqueado_id into v_franq from public.usuarios where id = v_id;
  select loja_id into v_loja from public.agendadores_lojas
    where usuario_id = v_id and data_fim is null limit 1;

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
      cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja, v_colega, '__assercao_rls__', '529.982.247-25',
            '(61) 99999-0000', current_date, 'contatado');
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  reset role;

  perform pg_temp.checar('agendador NAO lanca em nome de colega', 'barrou', v_erro);
  delete from public.agendamentos where cliente_nome = '__assercao_rls__';
end $$;

-- escrita.test.ts: "franqueado apaga agendamento de qualquer loja do tenant"
do $$
declare v_franq_user uuid; v_alvo uuid; v_sobrou int; v_loja uuid; v_franq uuid; v_agendador uuid;
begin
  select id into v_franq_user from public.usuarios where email = 'dono@franqueado.com.br';

  -- Cria a vitima em vez de apagar linha do seed: apagar uma real esvaziaria
  -- o seed a cada execucao e faria as contagens divergirem.
  select id into v_loja from public.lojas where nome like '%Loja 9';
  select franqueado_id into v_franq from public.lojas where id = v_loja;
  select usuario_id into v_agendador from public.agendadores_lojas
    where loja_id = v_loja and data_fim is null limit 1;

  insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
    cliente_cpf, cliente_telefone, data_agendamento, status)
  values (v_franq, v_loja, v_agendador, '__descartavel__', '529.982.247-25',
          '(61) 99999-0000', current_date, 'contatado')
  returning id into v_alvo;

  perform set_config('request.jwt.claim.sub', v_franq_user::text, false);
  set local role authenticated;
  delete from public.agendamentos where id = v_alvo;
  select count(*) into v_sobrou from public.agendamentos where id = v_alvo;
  reset role;

  perform pg_temp.checar('franqueado apaga agendamento de qualquer loja', '0', v_sobrou::text);
  delete from public.agendamentos where cliente_nome = '__descartavel__';
end $$;

-- escrita.test.ts: "agendador NAO cria loja"
do $$
declare v_id uuid; v_franq uuid; v_erro text;
begin
  select id into v_id from public.usuarios where email = 'agendador1.loja1@franqueado.com.br';
  select franqueado_id into v_franq from public.usuarios where id = v_id;

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  begin
    insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade)
    values (v_franq, '__assercao_rls__', 'TESTE-999', 'DF', 'Brasilia');
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  reset role;

  perform pg_temp.checar('agendador NAO cria loja', 'barrou', v_erro);
  delete from public.lojas where nome = '__assercao_rls__';
end $$;

-- ============ desligamento: o acesso morre com o status ============
--
-- O produto promete que desligar alguem tira o acesso. Quem cumpre a promessa
-- sao as quatro helpers reescritas pela migration 004, que somaram
-- `and u.status = 'ativo'` ao corpo herdado da 002.
--
-- POR QUE ISTO PRECISA DE ASSERCAO
-- As mesmas quatro funcoes existem nos DOIS arquivos. Reaplicar a 002 sozinha
-- — ou colar o trecho antigo — devolve a versao sem o filtro, e o desligamento
-- vira enfeite: a pessoa continua enxergando o tenant inteiro. Nada no schema
-- denuncia, porque a funcao continua existindo com o mesmo nome e a mesma
-- assinatura. So o comportamento denuncia.
--
-- A revogacao de sessao da aplicacao (admin.signOut global) nao cobre este
-- caso: o access token ja emitido vale ate expirar. Quem fecha essa janela e
-- o RLS, e e ele que esta sendo medido aqui.
do $$
declare
  v_id uuid;
  v_dono uuid;
  v_loja uuid;
  v_franq uuid;
  v_lojas_antes text;
  v_erro text;
begin
  select id into v_id   from auth.users where email = 'agendador1.loja1@franqueado.com.br';
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set role authenticated;
  v_lojas_antes := (select count(*)::text from public.lojas);
  -- Guarda a loja AGORA, enquanto ele ainda a enxerga. Usar
  -- `(select id from lojas limit 1)` depois de desligado traria null, e o
  -- insert seria barrado por NOT NULL em vez de por RLS: a assercao passaria
  -- sem provar nada sobre permissao.
  select id into v_loja from public.lojas limit 1;
  select franqueado_id into v_franq from public.usuarios where id = v_id;
  reset role;

  perform pg_temp.checar('linha de base: ativo ve 1 loja', '1', v_lojas_antes);

  -- O desligamento parte do franqueado, como na aplicacao. Fazer direto como
  -- dono do banco pularia a policy e o trigger de campos sensiveis — que e
  -- justamente quem impede o proprio agendador de se reativar depois.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  update public.usuarios set status = 'inativo' where id = v_id;
  reset role;

  perform pg_temp.checar('franqueado consegue desligar', 'inativo',
    (select status from public.usuarios where id = v_id));

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set role authenticated;

  perform pg_temp.checar('inativo nao ve loja nenhuma', '0',
    (select count(*)::text from public.lojas));
  perform pg_temp.checar('inativo nao ve o franqueado', '0',
    (select count(*)::text from public.franqueados));
  perform pg_temp.checar('inativo nao ve agendamento', '0',
    (select count(*)::text from public.agendamentos));
  perform pg_temp.checar('inativo nao ve colega', '0',
    (select count(*)::text from public.usuarios where id <> v_id));
  -- Direto na helper. `pode_gerenciar()` nao serve aqui: ja e falso para
  -- agendador ativo, entao passaria mesmo com o filtro de status removido —
  -- assercao que nao carrega peso da falsa seguranca.
  perform pg_temp.checar('usuario_role() nao reconhece o inativo', 'nulo',
    (select coalesce(public.usuario_role()::text, 'nulo')));

  -- Proposital e documentado na migration 004: a propria linha continua
  -- legivel, para a aplicacao dizer "seu acesso foi encerrado" em vez de
  -- quebrar numa tela vazia.
  perform pg_temp.checar('inativo AINDA le a propria linha', '1',
    (select count(*)::text from public.usuarios where id = v_id));

  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
                                     cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja, v_id, '__inativo__', '00000000000', '11999999999',
            current_date, 'agendado');
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('inativo NAO cria agendamento', 'barrou', v_erro);

  -- Nem se reativa sozinho: sem isto, o desligamento duraria um clique.
  begin
    update public.usuarios set status = 'ativo' where id = v_id;
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('inativo NAO se reativa sozinho', 'barrou', v_erro);

  reset role;
  delete from public.agendamentos where cliente_nome = '__inativo__';

  -- Devolve o seed ao estado original: as asserçoes precisam rodar de novo, e
  -- tudo depois desta linha conta com o usuario ativo.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  update public.usuarios set status = 'ativo' where id = v_id;
  reset role;

  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set role authenticated;
  perform pg_temp.checar('reativado volta a ver a loja', v_lojas_antes,
    (select count(*)::text from public.lojas));
  reset role;
end $$;

-- ============ primeiro dia: tenant sem nada dentro ============
--
-- POR QUE ISTO FALTAVA
-- As asserçoes cobrem bem o que e PROIBIDO — escalada de papel, loja alheia,
-- tenant cruzado, agendamento em nome de colega. O caminho que a pessoa
-- percorre no primeiro dia nunca foi exercitado: franqueado sem loja nenhuma
-- cadastra a primeira, depois a equipe, depois o primeiro atendimento.
--
-- Uma policy escrita apertada demais barra esse caminho e ninguem descobre
-- ate alguem tentar usar o sistema pela primeira vez — quando nao ha dado
-- nenhum na tela para sugerir o que deu errado.
--
-- Roda num franqueado NOVO, criado aqui, para nao mexer nas contagens de que
-- as outras asserçoes dependem.
do $$
declare
  v_franq uuid;
  v_dono  uuid;
  v_loja  uuid;
  v_agend uuid;
  v_erro  text;
begin
  -- Montagem feita como dono do banco: e o equivalente ao que o painel do
  -- Supabase e o script de seed fazem. O que esta sob teste comeca depois.
  insert into public.franqueados (nome, cnpj) values ('Tenant Novo', '99999999999999')
  returning id into v_franq;

  insert into auth.users (email) values ('primeiro.dia@tenantnovo.com.br') returning id into v_dono;
  insert into public.usuarios (id, email, nome, role, franqueado_id)
  values (v_dono, 'primeiro.dia@tenantnovo.com.br', 'Dono Novo', 'franqueado', v_franq);

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  perform pg_temp.checar('tenant novo comeca sem loja', '0',
    (select count(*)::text from public.lojas));

  -- 1. A primeira loja.
  --
  -- SEM `returning`, e a razao merece registro. Sob RLS, o RETURNING de um
  -- INSERT passa TAMBEM pela policy de SELECT, e `lojas_permitidas()` e
  -- `stable`: dentro da mesma instrucao ela nao enxerga a linha que acabou de
  -- ser inserida. O insert e aceito e o comando falha assim mesmo, com
  -- "new row violates row-level security policy" — mensagem que aponta para
  -- permissao quando o problema e visibilidade.
  --
  -- A aplicacao escapa por nao encadear `.select()` depois de `.insert()`. No
  -- dia em que alguem fizer isso para pegar o id da loja nova, cadastrar loja
  -- quebra em producao. A assercao logo abaixo existe para esse dia.
  begin
    insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade)
    values (v_franq, 'Primeira Loja', 'NOVA-001', 'DF', 'Brasilia');
    v_erro := 'criou';
  exception when others then v_erro := 'barrou: ' || sqlerrm;
  end;
  perform pg_temp.checar('franqueado cria a PRIMEIRA loja', 'criou', v_erro);

  -- Instrucao nova, snapshot novo: agora a linha aparece.
  select id into v_loja from public.lojas where codigo_loja = 'NOVA-001';

  -- A armadilha, registrada como comportamento conhecido em vez de surpresa.
  begin
    insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade)
    values (v_franq, 'Segunda', 'NOVA-002', 'DF', 'Brasilia')
    returning id into v_erro;
    v_erro := 'passou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('RETURNING e barrado quando a linha nova E o escopo', 'barrou', v_erro);


  perform pg_temp.checar('e passa a enxerga-la', '1',
    (select count(*)::text from public.lojas));

  reset role;

  -- 2. A equipe. A aplicacao cria usuario com service role, porque a Admin API
  -- precisa disso para gravar em auth.users — entao esta parte nao passa pelo
  -- RLS. O vinculo passa, e e ele que decide o que a pessoa enxerga.
  insert into auth.users (email) values ('agendador@tenantnovo.com.br') returning id into v_agend;
  insert into public.usuarios (id, email, nome, role, franqueado_id)
  values (v_agend, 'agendador@tenantnovo.com.br', 'Agendador Novo', 'agendador', v_franq);

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  begin
    insert into public.agendadores_lojas (usuario_id, loja_id, data_inicio)
    values (v_agend, v_loja, current_date);
    v_erro := 'criou';
  exception when others then v_erro := 'barrou: ' || sqlerrm;
  end;
  perform pg_temp.checar('franqueado lota o agendador na loja nova', 'criou', v_erro);

  reset role;

  -- 3. O primeiro atendimento, lancado pelo proprio agendador.
  perform set_config('request.jwt.claim.sub', v_agend::text, false);
  set role authenticated;

  perform pg_temp.checar('agendador ja enxerga a loja em que foi lotado', '1',
    (select count(*)::text from public.lojas));

  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
                                     cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja, v_agend, 'Primeiro Cliente', '52998224725', '61999999999',
            current_date, 'agendado');
    v_erro := 'criou';
  exception when others then v_erro := 'barrou: ' || sqlerrm;
  end;
  perform pg_temp.checar('agendador lanca o PRIMEIRO atendimento', 'criou', v_erro);

  reset role;

  -- 4. O tenant novo continua isolado: nada dele aparece para o outro.
  perform set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = 'dono@franqueado.com.br'), false);
  set role authenticated;
  perform pg_temp.checar('o tenant antigo nao enxerga a loja nova', '9',
    (select count(*)::text from public.lojas));
  reset role;

  -- Limpeza: as asserçoes precisam poder rodar de novo.
  delete from public.agendamentos where franqueado_id = v_franq;
  delete from public.agendadores_lojas where usuario_id = v_agend;
  delete from public.usuarios where franqueado_id = v_franq;
  delete from public.lojas where franqueado_id = v_franq;
  delete from public.franqueados where id = v_franq;
  delete from auth.users where email like '%@tenantnovo.com.br';
end $$;

-- ============ super admin so nasce de outro super admin ============
--
-- POR QUE ISTO FALTAVA
-- Nenhuma assercao mencionava `super_admin`. As escaladas testadas eram
-- todas do agendador para cima, e o papel mais alto do sistema nunca entrou
-- em nenhuma delas.
--
-- Foi ai que estava a falha: a policy de INSERT proibia um franqueado de
-- criar conta com esse papel, e a de UPDATE nao ganhou o equivalente. O
-- trigger de campos sensiveis devolve `new` para quem passa em
-- `pode_gerenciar()`, e franqueado passa.
--
-- Um UPDATE e a rede inteira fica visivel. Estas asserçoes medem o EFEITO —
-- o papel gravado — e nao a ausencia de excecao: um UPDATE que o RLS filtra
-- afeta zero linhas e nao levanta erro nenhum. Foi o que quase me fez
-- relatar uma escalada de diretor que nao existe.
do $$
declare
  v_dono  uuid;
  v_ag    uuid;
  v_dir   uuid;
  v_papel text;
begin
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';
  select id into v_ag   from auth.users where email = 'agendador1.loja1@franqueado.com.br';
  select id into v_dir  from auth.users where email = 'diretor1@franqueado.com.br';

  -- 1. Franqueado promovendo alguem do proprio tenant.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    update public.usuarios set role = 'super_admin' where id = v_ag;
  exception when others then null;
  end;
  reset role;
  select role::text into v_papel from public.usuarios where id = v_ag;
  perform pg_temp.checar('franqueado NAO cria super admin', 'agendador', v_papel);
  update public.usuarios set role = 'agendador' where id = v_ag;

  -- 2. Franqueado promovendo a si mesmo — o caminho mais direto.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    update public.usuarios set role = 'super_admin' where id = v_dono;
  exception when others then null;
  end;
  reset role;
  select role::text into v_papel from public.usuarios where id = v_dono;
  perform pg_temp.checar('franqueado NAO se promove a super admin', 'franqueado', v_papel);
  update public.usuarios set role = 'franqueado' where id = v_dono;

  -- 3. Diretor nao alcanca nem a linha: a policy de update ja o filtra.
  perform set_config('request.jwt.claim.sub', v_dir::text, false);
  set role authenticated;
  begin
    update public.usuarios set role = 'super_admin' where id = v_ag;
  exception when others then null;
  end;
  reset role;
  select role::text into v_papel from public.usuarios where id = v_ag;
  perform pg_temp.checar('diretor NAO cria super admin', 'agendador', v_papel);
  update public.usuarios set role = 'agendador' where id = v_ag;

  -- 4. O que continua funcionando: gerenciar papel dentro do tenant.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    update public.usuarios set role = 'diretor' where id = v_ag;
  exception when others then null;
  end;
  reset role;
  select role::text into v_papel from public.usuarios where id = v_ag;
  perform pg_temp.checar('franqueado AINDA promove a diretor', 'diretor', v_papel);
  update public.usuarios set role = 'agendador' where id = v_ag;

  -- 5. O agendador tentando o mesmo. Ele ja e barrado pela regra geral de
  -- "papel nao muda", mas o papel mais alto do sistema merece assercao
  -- propria: uma flexibilizacao futura poderia liberar algum papel e deixar
  -- este junto por descuido.
  perform set_config('request.jwt.claim.sub', v_ag::text, false);
  set role authenticated;
  begin
    update public.usuarios set role = 'super_admin' where id = v_ag;
  exception when others then null;
  end;
  reset role;
  select role::text into v_papel from public.usuarios where id = v_ag;
  perform pg_temp.checar('agendador NAO vira super admin', 'agendador', v_papel);
  update public.usuarios set role = 'agendador' where id = v_ag;

  -- 6. E o insert, que ja era barrado antes desta migration.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  declare v_erro text;
  begin
    begin
      insert into public.usuarios (id, email, nome, role, franqueado_id)
      values (gen_random_uuid(), 'probe@x.com', 'Probe', 'super_admin',
              (select franqueado_id from public.usuarios where id = v_dono));
      v_erro := 'nao barrou';
    exception when others then v_erro := 'barrou';
    end;
    perform pg_temp.checar('insert de super admin continua barrado', 'barrou', v_erro);
  end;
  reset role;
  delete from public.usuarios where email = 'probe@x.com';
end $$;

-- ============ metas nao atravessam a fronteira do tenant ============
--
-- POR QUE ISTO FALTAVA
-- Todas as assercoes de isolamento usavam UM tenant: o do seed. Um vazamento
-- entre tenants nao aparece com um tenant so — nao ha para onde vazar.
--
-- `metas_write` era `for all` com `using (pode_gerenciar())`, sem escopo. O
-- `with check` dela e restrito, e e o que se ve ao ler a migration; mas
-- `using` decide QUAIS LINHAS a pessoa alcanca, e `for all` cobre SELECT e
-- DELETE — o primeiro somando-se ao metas_select por OU, o segundo sem
-- `with check` nenhum para corrigir.
do $$
declare
  v_dono uuid; v_f2 uuid; v_dono2 uuid; v_ag2 uuid; v_loja2 uuid; v_meta uuid;
  v_n int;
begin
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';

  -- Segundo tenant, montado como dono do banco: e o equivalente ao que o
  -- painel do Supabase faz.
  insert into public.franqueados (nome, cnpj) values ('Outro Tenant','12312312312312')
    returning id into v_f2;
  insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade)
    values (v_f2,'Loja do Outro','OUT-1','RJ','Rio') returning id into v_loja2;
  insert into auth.users (email) values ('dono2@outro.com') returning id into v_dono2;
  insert into public.usuarios (id,email,nome,role,franqueado_id)
    values (v_dono2,'dono2@outro.com','Dono2','franqueado',v_f2);
  insert into auth.users (email) values ('ag2@outro.com') returning id into v_ag2;
  insert into public.usuarios (id,email,nome,role,franqueado_id)
    values (v_ag2,'ag2@outro.com','Ag2','agendador',v_f2);
  insert into public.agendadores_lojas (usuario_id,loja_id,data_inicio)
    values (v_ag2,v_loja2,current_date);
  insert into public.metas (usuario_id,competencia,meta_agendamentos,definida_por)
    values (v_ag2, date_trunc('month',current_date)::date, 50, v_dono2)
    returning id into v_meta;

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  perform pg_temp.checar('franqueado NAO ve meta de outro tenant', '0',
    (select count(*)::text from public.metas where id = v_meta));

  -- Mede o EFEITO. Um DELETE que o RLS filtra afeta zero linhas e nao
  -- levanta erro: contar a excecao nao provaria nada.
  begin
    delete from public.metas where id = v_meta;
  exception when others then null;
  end;
  reset role;

  select count(*) into v_n from public.metas where id = v_meta;
  perform pg_temp.checar('franqueado NAO apaga meta de outro tenant', '1', v_n::text);

  -- O que continua valendo: o dono do tenant B alcanca a propria meta.
  perform set_config('request.jwt.claim.sub', v_dono2::text, false);
  set role authenticated;
  perform pg_temp.checar('o dono do tenant B AINDA ve a propria meta', '1',
    (select count(*)::text from public.metas where id = v_meta));
  reset role;

  delete from public.metas where usuario_id = v_ag2;
  delete from public.agendadores_lojas where usuario_id = v_ag2;
  delete from public.usuarios where franqueado_id = v_f2;
  delete from public.lojas where franqueado_id = v_f2;
  delete from public.franqueados where id = v_f2;
  delete from auth.users where email in ('dono2@outro.com','ag2@outro.com');
end $$;

-- ============ isolamento entre tenants, tabela por tabela ============
--
-- POR QUE ISTO PRECISA EXISTIR
-- As demais assercoes usam um tenant so — o do seed. Vazamento entre tenants
-- nao aparece com um tenant: nao ha para onde vazar. Foi assim que
-- `metas_write` ficou com `using (pode_gerenciar())` sem escopo, deixando um
-- franqueado ver e APAGAR metas de outra rede, sem que nada acusasse.
--
-- Isolamento e a promessa central de um sistema multiempresa. Ele merece uma
-- assercao por tabela, e nao a confianca de que cada policy foi escrita com
-- cuidado.
do $$
declare
  v_dono uuid; v_f2 uuid; v_dono2 uuid; v_ag2 uuid; v_loja2 uuid; v_agd2 uuid;
  v_erro text;
begin
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';

  -- Tenant B completo, montado como dono do banco.
  insert into public.franqueados (nome, cnpj) values ('Tenant B','98798798798798')
    returning id into v_f2;
  insert into public.lojas (franqueado_id,nome,codigo_loja,estado,cidade)
    values (v_f2,'Loja B','TB-1','RJ','Rio') returning id into v_loja2;
  insert into auth.users (email) values ('donoB@b.com') returning id into v_dono2;
  insert into public.usuarios (id,email,nome,role,franqueado_id)
    values (v_dono2,'donoB@b.com','DonoB','franqueado',v_f2);
  insert into auth.users (email) values ('agB@b.com') returning id into v_ag2;
  insert into public.usuarios (id,email,nome,role,franqueado_id)
    values (v_ag2,'agB@b.com','AgB','agendador',v_f2);
  insert into public.agendadores_lojas (usuario_id,loja_id,data_inicio)
    values (v_ag2,v_loja2,current_date);
  insert into public.participacoes_societarias (usuario_id,loja_id,percentual_participacao,cargo,data_inicio)
    values (v_dono2,v_loja2,100,'franqueado',current_date);
  insert into public.agendamentos (franqueado_id,loja_id,agendador_id,cliente_nome,
                                   cliente_cpf,cliente_telefone,data_agendamento,status)
    values (v_f2,v_loja2,v_ag2,'Cliente B','52998224725','21999999999',current_date,'compareceu')
    returning id into v_agd2;
  insert into public.vendas (agendamento_id,valor,data_venda,registrada_por)
    values (v_agd2,999,current_date,v_ag2);
  insert into public.metas (usuario_id,competencia,meta_agendamentos,definida_por)
    values (v_ag2,date_trunc('month',current_date)::date,50,v_dono2);
  insert into public.notificacoes (agendamento_id,tipo,canal,status)
    values (v_agd2,'vespera','email','enviada');
  insert into public.envios_relatorio (franqueado_id,semana_inicio,status)
    values (v_f2,(date_trunc('week',current_date))::date,'enviado');

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  -- Uma por tabela. Nenhuma linha do tenant B pode ser alcancada.
  perform pg_temp.checar('tenant: nao ve franqueados alheios', '0',
    (select count(*)::text from public.franqueados where id = v_f2));
  perform pg_temp.checar('tenant: nao ve lojas alheias', '0',
    (select count(*)::text from public.lojas where franqueado_id = v_f2));
  perform pg_temp.checar('tenant: nao ve usuarios alheios', '0',
    (select count(*)::text from public.usuarios where franqueado_id = v_f2));
  perform pg_temp.checar('tenant: nao ve agendamentos alheios', '0',
    (select count(*)::text from public.agendamentos where franqueado_id = v_f2));
  perform pg_temp.checar('tenant: nao ve lotacoes alheias', '0',
    (select count(*)::text from public.agendadores_lojas where loja_id = v_loja2));
  perform pg_temp.checar('tenant: nao ve participacoes alheias', '0',
    (select count(*)::text from public.participacoes_societarias where loja_id = v_loja2));
  perform pg_temp.checar('tenant: nao ve vendas alheias', '0',
    (select count(*)::text from public.vendas where agendamento_id = v_agd2));
  perform pg_temp.checar('tenant: nao ve metas alheias', '0',
    (select count(*)::text from public.metas where usuario_id = v_ag2));
  perform pg_temp.checar('tenant: nao ve notificacoes alheias', '0',
    (select count(*)::text from public.notificacoes where agendamento_id = v_agd2));
  perform pg_temp.checar('tenant: nao ve envios de relatorio alheios', '0',
    (select count(*)::text from public.envios_relatorio where franqueado_id = v_f2));

  -- E nao escreve na rede alheia. O trigger de tenant cobre o vinculo; aqui
  -- o alvo e o agendamento, que passa pelo validar_tenant_agendamento.
  begin
    insert into public.agendamentos (franqueado_id,loja_id,agendador_id,cliente_nome,
                                     cliente_cpf,cliente_telefone,data_agendamento,status)
    values (v_f2,v_loja2,v_ag2,'Invasor','52998224725','11999999999',current_date,'agendado');
    v_erro := 'nao barrou';
  exception when others then v_erro := 'barrou';
  end;
  perform pg_temp.checar('tenant: NAO cria agendamento na rede alheia', 'barrou', v_erro);

  -- Update em loja alheia: o RLS filtra a linha, entao o efeito e zero.
  begin
    update public.lojas set nome = 'Tomada' where id = v_loja2;
  exception when others then null;
  end;
  reset role;
  perform pg_temp.checar('tenant: NAO renomeia loja alheia', 'Loja B',
    (select nome from public.lojas where id = v_loja2));

  delete from public.envios_relatorio where franqueado_id=v_f2;
  delete from public.notificacoes where agendamento_id=v_agd2;
  delete from public.metas where usuario_id=v_ag2;
  delete from public.vendas where agendamento_id=v_agd2;
  delete from public.agendamentos where franqueado_id=v_f2;
  delete from public.participacoes_societarias where loja_id=v_loja2;
  delete from public.agendadores_lojas where loja_id=v_loja2;
  delete from public.usuarios where franqueado_id=v_f2;
  delete from public.lojas where franqueado_id=v_f2;
  delete from public.franqueados where id=v_f2;
  delete from auth.users where email in ('donoB@b.com','agB@b.com');
end $$;

-- ============ o ciclo de escrita de meta continua inteiro ============
--
-- POR QUE ISTO ENTROU JUNTO COM A 014
-- Aquela migration estreitou o `using` de `metas_write` para fechar o
-- vazamento entre tenants. Estreitar policy de escrita e o tipo de mudanca
-- que conserta um lado e quebra o outro sem avisar: o vazamento fecha, e de
-- repente ninguem mais consegue salvar meta nenhuma.
--
-- A aplicacao grava com UPSERT. O caminho de conflito e um UPDATE, e UPDATE
-- consulta o `using` — exatamente a clausula que mudou. Criar meta pela
-- primeira vez nao passaria por ali; editar, sim.
do $$
declare
  v_dono uuid; v_ag uuid; v_dir uuid; v_comp date; v_erro text; v_valor int;
begin
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';
  select id into v_ag   from auth.users where email = 'agendador1.loja1@franqueado.com.br';
  select id into v_dir  from auth.users where email = 'diretor1@franqueado.com.br';
  v_comp := date_trunc('month', current_date)::date;

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  -- 1. Criar.
  begin
    insert into public.metas (usuario_id, competencia, meta_agendamentos, definida_por)
    values (v_ag, v_comp, 40, v_dono);
    v_erro := 'criou';
  exception when others then v_erro := 'barrou: ' || sqlerrm;
  end;
  perform pg_temp.checar('franqueado cria meta do proprio time', 'criou', v_erro);

  -- 2. Editar pelo mesmo caminho da aplicacao: upsert que cai em conflito.
  begin
    insert into public.metas (usuario_id, competencia, meta_agendamentos, definida_por)
    values (v_ag, v_comp, 55, v_dono)
    on conflict (usuario_id, competencia) do update set meta_agendamentos = excluded.meta_agendamentos;
    v_erro := 'atualizou';
  exception when others then v_erro := 'barrou: ' || sqlerrm;
  end;
  perform pg_temp.checar('upsert de meta atualiza a existente', 'atualizou', v_erro);

  select meta_agendamentos into v_valor from public.metas
   where usuario_id = v_ag and competencia = v_comp;
  perform pg_temp.checar('e o valor novo ficou gravado', '55', v_valor::text);

  reset role;

  -- 3. Diretor nao escreve meta: `pode_gerenciar()` nao o inclui.
  perform set_config('request.jwt.claim.sub', v_dir::text, false);
  set role authenticated;
  begin
    update public.metas set meta_agendamentos = 999
     where usuario_id = v_ag and competencia = v_comp;
  exception when others then null;
  end;
  reset role;
  select meta_agendamentos into v_valor from public.metas
   where usuario_id = v_ag and competencia = v_comp;
  perform pg_temp.checar('diretor NAO altera meta', '55', v_valor::text);

  -- 4. A meta de quem foi DESLIGADO continua removivel.
  --
  -- E o caso que decidiu o escopo da migration 014. Escopar o `using` por
  -- vinculo ATIVO — copiando a condicao do `with check`, que e o caminho
  -- obvio — deixaria essa meta sem dono: o desligamento encerra o vinculo, e
  -- ninguem mais a alcancaria. Medido antes de escolher: com escopo por
  -- vinculo a linha sobrevive ao delete; com escopo por tenant, sai.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    insert into public.metas (usuario_id, competencia, meta_agendamentos, definida_por)
    values (v_ag, v_comp + interval '1 month', 30, v_dono);
  exception when others then null;
  end;
  reset role;

  update public.agendadores_lojas set data_fim = current_date
   where usuario_id = v_ag and data_fim is null;

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    delete from public.metas where usuario_id = v_ag and competencia = (v_comp + interval '1 month')::date;
  exception when others then null;
  end;
  reset role;

  perform pg_temp.checar('meta de quem foi desligado ainda e removivel', '0',
    (select count(*)::text from public.metas
      where usuario_id = v_ag and competencia = (v_comp + interval '1 month')::date));

  -- Reabre o vinculo: as assercoes seguintes contam com ele.
  update public.agendadores_lojas set data_fim = null where usuario_id = v_ag;

  -- 5. Apagar, que e so `using` — nao ha `with check` no delete.
  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;
  begin
    delete from public.metas where usuario_id = v_ag and competencia = v_comp;
  exception when others then null;
  end;
  reset role;
  perform pg_temp.checar('franqueado apaga meta do proprio time', '0',
    (select count(*)::text from public.metas where usuario_id = v_ag and competencia = v_comp));
end $$;

-- ============ o outro lado do RETURNING ============
--
-- A assercao "RETURNING e barrado quando a linha nova E o escopo", sozinha,
-- sugere que `RETURNING` nunca funciona sob RLS. Nao e isso — e a leitura
-- errada custaria caro: `transferirParticipacao` faz
-- `.insert(...).select('id').single()` para saber o que desfazer se o
-- encerramento da origem falhar. Quem lesse so a de cima "consertaria" um
-- codigo que esta certo, e tiraria o rollback junto.
--
-- A regra de verdade e mais estreita: falha quando a linha inserida e a
-- PROPRIA coisa que define o escopo — uma loja nova, que `lojas_permitidas()`
-- ainda nao enxerga. Com o escopo ja existente, funciona.
do $$
declare v_dono uuid; v_dir uuid; v_loja uuid; v_nova uuid; v_erro text;
begin
  select id into v_dono from auth.users where email = 'dono@franqueado.com.br';
  select id into v_dir  from auth.users where email = 'diretor1@franqueado.com.br';

  -- Uma loja do tenant onde o diretor ainda NAO participa.
  select l.id into v_loja from public.lojas l
   where not exists (
     select 1 from public.participacoes_societarias p
      where p.loja_id = l.id and p.usuario_id = v_dir and p.data_fim is null)
   limit 1;

  perform set_config('request.jwt.claim.sub', v_dono::text, false);
  set role authenticated;

  begin
    insert into public.participacoes_societarias
      (usuario_id, loja_id, percentual_participacao, cargo, data_inicio)
    values (v_dir, v_loja, 25, 'diretor', current_date)
    returning id into v_nova;
    v_erro := 'devolveu';
  exception when others then v_erro := 'barrou';
  end;

  perform pg_temp.checar('RETURNING funciona quando o escopo ja existe', 'devolveu', v_erro);

  reset role;
  delete from public.participacoes_societarias where id = v_nova;
end $$;

-- ============ ASSINATURA: REDE E LOJA (migration 015) ============
--
-- As duas colunas de status existiam desde o primeiro dia e nunca foram
-- conferidas. O que se mede aqui e o EFEITO — quantas linhas o papel enxerga
-- e se a escrita passa — e nao a presenca da regra: policy escrita e policy
-- aplicada ja divergiram neste banco.

-- ---- rede suspensa corta LEITURA e ESCRITA ----
do $$
declare
  v_franq uuid;
  v_lojas_antes int; v_lojas_durante int; v_lojas_depois int;
  v_escreveu text;
  v_loja uuid; v_agendador uuid;
begin
  perform pg_temp.como_sistema();
  select franqueado_id into v_franq from public.lojas limit 1;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  select count(*) into v_lojas_antes from public.lojas;
  reset role;

  perform pg_temp.como_sistema();
  update public.franqueados set status = 'inativo' where id = v_franq;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  select count(*) into v_lojas_durante from public.lojas;
  reset role;
  perform pg_temp.como_sistema();

  -- O agendador do mesmo tenant cai junto: a rede e a fronteira, nao o cargo.
  perform pg_temp.como('agendador1.loja1@franqueado.com.br');
  set role authenticated;
  begin
    select id into v_loja from public.lojas limit 1;
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
      cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, coalesce(v_loja, gen_random_uuid()), auth.uid(), 'Rede Suspensa',
            '529.982.247-25', '(61) 90000-0000', current_date + 1, 'agendado');
    v_escreveu := 'escreveu';
  exception when others then
    v_escreveu := 'barrou';
  end;
  reset role;
  perform pg_temp.como_sistema();

  update public.franqueados set status = 'ativo' where id = v_franq;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  select count(*) into v_lojas_depois from public.lojas;
  reset role;

  perform pg_temp.checar('rede ativa: franqueado ve as lojas', '9', v_lojas_antes::text);
  perform pg_temp.checar('rede suspensa: franqueado nao ve nada', '0', v_lojas_durante::text);
  perform pg_temp.checar('rede suspensa: agendador nao escreve', 'barrou', v_escreveu);
  perform pg_temp.checar('reativar devolve tudo', '9', v_lojas_depois::text);
end $$;

-- ---- rede suspensa continua legivel pelo proprio dono ----
do $$
declare v_franq uuid; v_le int; v_ve_loja int;
begin
  perform pg_temp.como_sistema();
  select franqueado_id into v_franq from public.lojas limit 1;
  update public.franqueados set status = 'inativo' where id = v_franq;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  -- Sem esta leitura a aplicacao nao distingue "suspenso" de "vazio", e a
  -- tela em branco parece defeito. Uma linha de nome e situacao, so.
  select count(*) into v_le from public.franqueados where id = v_franq;
  select count(*) into v_ve_loja from public.lojas;
  reset role;

  perform pg_temp.como_sistema();
  update public.franqueados set status = 'ativo' where id = v_franq;

  perform pg_temp.checar('rede suspensa: dono ainda le a propria rede', '1', v_le::text);
  perform pg_temp.checar('mas nao volta a ver o negocio', '0', v_ve_loja::text);
end $$;

-- ---- super admin continua enxergando a rede suspensa ----
do $$
declare v_franq uuid; v_ve int; v_super uuid;
begin
  perform pg_temp.como_sistema();
  select franqueado_id into v_franq from public.lojas limit 1;

  -- O seed nao tem super admin: ele nasce aqui e morre no fim do bloco. Usar
  -- um e-mail inexistente deixaria `auth.uid()` nulo, e a asserção passaria
  -- medindo a coisa errada.
  insert into auth.users (email) values ('super@rede.com.br') returning id into v_super;
  insert into public.usuarios (id, email, nome, role, franqueado_id)
  values (v_super, 'super@rede.com.br', 'Super da Rede', 'super_admin', null);

  update public.franqueados set status = 'inativo' where id = v_franq;

  -- Sem isto nao havia como desfazer: quem suspende precisa continuar vendo.
  perform set_config('request.jwt.claim.sub', v_super::text, false);
  set role authenticated;
  select count(*) into v_ve from public.franqueados where id = v_franq;
  reset role;
  perform pg_temp.como_sistema();

  update public.franqueados set status = 'ativo' where id = v_franq;
  delete from public.usuarios where id = v_super;
  delete from auth.users where id = v_super;

  perform pg_temp.checar('super admin ve a rede que suspendeu', '1', v_ve::text);
end $$;

-- ---- loja suspensa: bloqueia escrita, PRESERVA leitura ----
do $$
declare
  v_loja uuid; v_franq uuid; v_agendador uuid;
  v_historico_antes int; v_historico_durante int;
  v_escreveu text; v_editou text; v_id uuid;
begin
  perform pg_temp.como_sistema();
  select l.id, l.franqueado_id into v_loja, v_franq
  from public.lojas l join public.agendadores_lojas a on a.loja_id = l.id
  where a.data_fim is null order by l.nome limit 1;

  select usuario_id into v_agendador from public.agendadores_lojas
  where loja_id = v_loja and data_fim is null limit 1;

  insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
    cliente_cpf, cliente_telefone, data_agendamento, status)
  values (v_franq, v_loja, v_agendador, 'Historico da Loja', '529.982.247-25',
          '(61) 91111-0000', current_date - 5, 'compareceu')
  returning id into v_id;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  select count(*) into v_historico_antes from public.agendamentos where loja_id = v_loja;
  reset role;
  perform pg_temp.como_sistema();

  update public.lojas set status = 'inativo' where id = v_loja;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  -- O ponto da regra: quem segue pagando nao perde meses de medicao porque
  -- cancelou UMA unidade.
  select count(*) into v_historico_durante from public.agendamentos where loja_id = v_loja;

  begin
    update public.agendamentos set observacoes = 'tentativa' where id = v_id;
    get diagnostics v_editou = row_count;
    v_editou := case when v_editou::int > 0 then 'editou' else 'barrou' end;
  exception when others then
    v_editou := 'barrou';
  end;
  reset role;

  perform pg_temp.como('agendador1.loja1@franqueado.com.br');
  set role authenticated;
  begin
    insert into public.agendamentos (franqueado_id, loja_id, agendador_id, cliente_nome,
      cliente_cpf, cliente_telefone, data_agendamento, status)
    values (v_franq, v_loja, auth.uid(), 'Loja Cancelada', '529.982.247-25',
            '(61) 92222-0000', current_date + 1, 'agendado');
    v_escreveu := 'escreveu';
  exception when others then
    v_escreveu := 'barrou';
  end;
  reset role;
  perform pg_temp.como_sistema();

  update public.lojas set status = 'ativo' where id = v_loja;
  delete from public.agendamentos where id = v_id;

  perform pg_temp.checar('loja suspensa: historico continua visivel',
    v_historico_antes::text, v_historico_durante::text);
  perform pg_temp.checar('loja suspensa: nao aceita agendamento novo', 'barrou', v_escreveu);
  perform pg_temp.checar('loja suspensa: nao aceita edicao', 'barrou', v_editou);
end $$;

-- ---- franqueado nao se reativa sozinho ----
do $$
declare v_franq uuid; v_tentou text; v_status_final text;
begin
  perform pg_temp.como_sistema();
  select franqueado_id into v_franq from public.lojas limit 1;

  perform pg_temp.como('dono@franqueado.com.br');
  set role authenticated;
  begin
    update public.franqueados set status = 'inativo' where id = v_franq;
    v_tentou := 'passou';
  exception when others then
    v_tentou := 'barrou';
  end;
  reset role;

  select status into v_status_final from public.franqueados where id = v_franq;

  perform pg_temp.checar('franqueado nao muda a situacao da propria rede', 'barrou', v_tentou);
  perform pg_temp.checar('e a rede continua ativa', 'ativo', v_status_final);
end $$;

-- Desfaz o que as asserçoes escreveram, para poderem rodar de novo.
reset role;
select pg_temp.como_sistema();
delete from public.agendamentos where cliente_nome in
  ('Rede Suspensa', 'Loja Cancelada', 'Historico da Loja');
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
