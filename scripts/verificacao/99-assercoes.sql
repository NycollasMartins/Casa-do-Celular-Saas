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
