-- =====================================================================
-- 003 - SEED DATA (MVP)
-- PRE-REQUISITO: rode antes `npm run seed:auth`, que cria os 21 usuarios
-- em auth.users via Admin API. Este script apenas espelha esses usuarios
-- em public.usuarios e monta a estrutura de negocio.
--
-- Ambiente de desenvolvimento/homologacao apenas.
-- =====================================================================

do $$
declare
  v_franqueado_id uuid;
  v_dono_id       uuid;
  v_diretor1_id   uuid;
  v_diretor2_id   uuid;
  v_loja_id       uuid;
  v_agendador_id  uuid;
  v_lojas         uuid[] := '{}';
  v_agendadores   uuid[] := '{}';
  i               int;
  j               int;
  v_status        text;
  v_status_ciclo  text[] := array['contatado', 'agendado', 'compareceu', 'nao_agendado', 'nao_compareceu'];
begin
  -- Guarda: os usuarios precisam existir em auth.users antes deste script.
  if (select count(*) from auth.users where email like '%@franqueado.com.br') < 21 then
    raise exception 'Usuarios de auth ausentes. Rode `npm run seed:auth` antes deste script.';
  end if;

  -- ---------------- Franqueado (tenant) ----------------
  insert into public.franqueados (nome, cnpj, email_contato, telefone_contato, status, data_contrato)
  values ('Franqueado Principal Ltda', '00.000.000/0001-00', 'contato@franqueado.com.br', '(61) 99999-9999', 'ativo', '2025-01-01')
  returning id into v_franqueado_id;

  -- ---------------- 9 lojas em Brasilia-DF ----------------
  for i in 1..9 loop
    insert into public.lojas (franqueado_id, nome, codigo_loja, estado, cidade, endereco, telefone, gerente_nome, status)
    values (
      v_franqueado_id,
      'Casa do Celular Loja ' || i,
      'LOJA-' || lpad(i::text, 3, '0'),
      'DF',
      'Brasilia',
      'SCN Quadra ' || i,
      '(61) 3333-' || lpad(i::text, 4, '0'),
      'Gerente Loja ' || i,
      'ativo'
    )
    returning id into v_loja_id;
    v_lojas := array_append(v_lojas, v_loja_id);
  end loop;

  -- ---------------- Usuarios (espelho de auth.users) ----------------
  -- Dono / franqueado
  insert into public.usuarios (id, email, nome, role, franqueado_id)
  select u.id, u.email, 'Nome do Dono', 'franqueado', v_franqueado_id
  from auth.users u where u.email = 'dono@franqueado.com.br'
  returning id into v_dono_id;

  -- Diretores
  insert into public.usuarios (id, email, nome, role, franqueado_id)
  select u.id, u.email, 'Diretor 1', 'diretor', v_franqueado_id
  from auth.users u where u.email = 'diretor1@franqueado.com.br'
  returning id into v_diretor1_id;

  insert into public.usuarios (id, email, nome, role, franqueado_id)
  select u.id, u.email, 'Diretor 2', 'diretor', v_franqueado_id
  from auth.users u where u.email = 'diretor2@franqueado.com.br'
  returning id into v_diretor2_id;

  -- 18 agendadores (2 por loja)
  for i in 1..9 loop
    for j in 1..2 loop
      insert into public.usuarios (id, email, nome, role, franqueado_id)
      select u.id, u.email, 'Agendador ' || j || ' Loja ' || i, 'agendador', v_franqueado_id
      from auth.users u
      where u.email = 'agendador' || j || '.loja' || i || '@franqueado.com.br'
      returning id into v_agendador_id;

      v_agendadores := array_append(v_agendadores, v_agendador_id);

      insert into public.agendadores_lojas (usuario_id, loja_id, data_inicio)
      values (v_agendador_id, v_lojas[i], '2025-01-01');
    end loop;
  end loop;

  -- ---------------- Participacoes societarias ----------------
  -- Dono: 100% nas 9 lojas
  for i in 1..9 loop
    insert into public.participacoes_societarias (usuario_id, loja_id, percentual_participacao, cargo, data_inicio)
    values (v_dono_id, v_lojas[i], 100.00, 'franqueado', '2025-01-01');
  end loop;

  -- Diretor 1: 30% nas lojas 1 a 5
  for i in 1..5 loop
    insert into public.participacoes_societarias (usuario_id, loja_id, percentual_participacao, cargo, data_inicio)
    values (v_diretor1_id, v_lojas[i], 30.00, 'diretor', '2025-01-01');
  end loop;

  -- Diretor 2: 30% nas lojas 6 a 9
  for i in 6..9 loop
    insert into public.participacoes_societarias (usuario_id, loja_id, percentual_participacao, cargo, data_inicio)
    values (v_diretor2_id, v_lojas[i], 30.00, 'diretor', '2025-01-01');
  end loop;

  -- ---------------- 50 agendamentos de exemplo ----------------
  for i in 1..50 loop
    v_status := v_status_ciclo[((i - 1) % 5) + 1];
    -- distribui entre as 9 lojas e alterna os 2 agendadores da loja
    v_loja_id := v_lojas[((i - 1) % 9) + 1];
    v_agendador_id := v_agendadores[(((i - 1) % 9) * 2) + ((i % 2) + 1)];

    insert into public.agendamentos (
      franqueado_id, loja_id, agendador_id,
      cliente_nome, cliente_email, cliente_cpf, cliente_telefone,
      data_agendamento, status, observacoes
    ) values (
      v_franqueado_id, v_loja_id, v_agendador_id,
      'Cliente Teste ' || i,
      'cliente' || i || '@teste.com',
      '123.456.789-' || lpad(i::text, 2, '0'),
      '(61) 9' || lpad(i::text, 4, '0') || '-0000',
      current_date - ((i % 30))::int,
      v_status,
      'Agendamento de teste ' || i
    );
  end loop;

  raise notice 'Seed concluido. Franqueado: %', v_franqueado_id;
end $$;
