-- =====================================================================
-- APLICAR PENDENTES  ·  Casa do Celular
--
-- ARQUIVO GERADO. Nao edite a mao: rode `npm run consolidado:gerar`.
-- O conteudo sai de supabase/migrations, e o CI confere se esta em dia.
--
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e execute uma vez.
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Todo comando aqui e idempotente:
-- `create table if not exists`, `create index if not exists`,
-- `create or replace function`, e `drop ... if exists` antes de cada
-- `create policy` e `create trigger`. Se parte disso ja foi aplicada, os
-- trechos correspondentes apenas se repetem sem efeito — nenhum dado e
-- perdido e nenhuma permissao e afrouxada.
--
-- ORDEM IMPORTA. As migrations dependem umas das outras: a funcao do
-- lembrete referencia a coluna criada pela anonimizacao, e a de relatorio
-- referencia a tabela de vendas. Rodar fora de ordem faz a criacao da
-- funcao falhar.
--
-- AO FINAL ha um `notify pgrst` que recarrega o cache de schema do
-- PostgREST. Sem ele, funcoes recem-criadas ficam invisiveis para a API e
-- os scripts respondem "Could not find the function ... in the schema
-- cache" mesmo com a funcao existindo no banco.
--
-- Conteudo, na ordem de execucao:
--   004  STATUS DO USUARIO (desligamento)   (20250101000003_usuario_status.sql)
--   005  PROTECAO DOS CAMPOS SENSIVEIS DE public.usuarios (20250101000004_protege_campos_sensiveis.sql)
--   006  ANONIMIZACAO (LGPD)                (20250101000005_anonimizacao_lgpd.sql)
--   007  NOTIFICACOES (lembrete de vespera) (20250101000006_notificacoes.sql)
--   008  VENDAS (fecha o funil)             (20250101000007_vendas.sql)
--   009  METAS POR AGENDADOR                (20250101000008_metas.sql)
--   010  RELATORIO SEMANAL POR E-MAIL       (20250101000009_relatorio_semanal.sql)
--   011  VENDA TRAVA A MUDANCA DE STATUS    (20250101000010_venda_trava_status.sql)
--   012  VINCULO SO DENTRO DO PROPRIO TENANT (20250101000011_vinculo_mesmo_tenant.sql)
--   013  SO UM SUPER ADMIN CONCEDE O PAPEL DE SUPER ADMIN (20250101000012_super_admin_so_por_super_admin.sql)
--   014  METAS: O ESCOPO ESTAVA SO NA ESCRITA (20250101000013_metas_escopo_do_tenant.sql)
--   015  ASSINATURA: SUSPENDER A REDE, E SUSPENDER UMA LOJA (20250101000014_assinatura_rede_e_loja.sql)
--   016  CONVITE DE REDE                    (20250101000015_convites.sql)
-- =====================================================================


-- ---------------------------------------------------------------------
-- >>> 004 · STATUS DO USUARIO (desligamento)
-- ---------------------------------------------------------------------

-- =====================================================================
-- 004 - STATUS DO USUARIO (desligamento)
-- Execute depois de 003_seed.sql.
--
-- PROBLEMA QUE RESOLVE
-- Nao havia como revogar o acesso de alguem pela aplicacao. Apagar a linha
-- nao serve: `agendamentos.agendador_id` referencia o usuario, e o historico
-- de quem agendou o que e justamente o dado que o sistema existe para medir.
--
-- A saida e desligar sem apagar. O corte acontece nas funcoes de permissao,
-- nao em cada policy: `usuario_role()` devolve null para quem esta inativo, e
-- como `lojas_permitidas()` deriva dela, o acesso cai nas seis tabelas de uma
-- vez. Uma unica linha de defesa, no lugar onde ja mora a regra.
-- =====================================================================

alter table public.usuarios
  add column if not exists status text not null default 'ativo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_status_valido'
  ) then
    alter table public.usuarios
      add constraint usuarios_status_valido check (status in ('ativo', 'inativo'));
  end if;
end $$;

create index if not exists idx_usuarios_status on public.usuarios (status);

-- ---------------------------------------------------------------------
-- Helpers de permissao: passam a ignorar usuario inativo.
-- O corpo e identico ao de 002_rls.sql, com o filtro de status somado.
-- ---------------------------------------------------------------------
create or replace function public.usuario_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo';
$$;

create or replace function public.usuario_franqueado_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select u.franqueado_id from public.usuarios u where u.id = auth.uid() and u.status = 'ativo';
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo') = 'super_admin',
    false
  );
$$;

create or replace function public.pode_gerenciar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.role from public.usuarios u where u.id = auth.uid() and u.status = 'ativo')
      in ('super_admin', 'franqueado'),
    false
  );
$$;

-- `lojas_permitidas()` nao muda: ela comeca por `usuario_role()`, que agora
-- devolve null para o inativo e faz a funcao retornar conjunto vazio.

-- ---------------------------------------------------------------------
-- Um usuario inativo continua lendo a PROPRIA linha (policy usuarios_select
-- permite `id = auth.uid()`). Isso e proposital: a aplicacao precisa ler o
-- status para deslogar a pessoa com uma mensagem, em vez de mostrar uma tela
-- vazia sem explicacao.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- >>> 005 · PROTECAO DOS CAMPOS SENSIVEIS DE public.usuarios
-- ---------------------------------------------------------------------

-- =====================================================================
-- 005 - PROTECAO DOS CAMPOS SENSIVEIS DE public.usuarios
-- Execute depois de 004_usuario_status.sql.
--
-- FALHA QUE ESTA MIGRATION CORRIGE  (escalada de privilegio)
--
-- A policy `usuarios_update` (002_rls.sql) libera a edicao quando
-- `id = auth.uid()`, tanto no USING quanto no WITH CHECK, sem restringir
-- coluna alguma. Na pratica, qualquer usuario autenticado podia rodar:
--
--     update public.usuarios set role = 'franqueado' where id = auth.uid();
--
-- As duas clausulas passam — a linha e dele — e `usuario_role()` passa a
-- devolver 'franqueado'. Como TODA a visibilidade do sistema deriva dessa
-- funcao, um agendador se promovia sozinho e enxergava o tenant inteiro.
-- A mesma brecha permitia trocar o proprio `franqueado_id` (pular para
-- outro tenant) e reativar o proprio `status` depois de desligado,
-- desfazendo o encerramento de acesso feito pelo franqueado.
--
-- POR QUE TRIGGER, E NAO POLICY
-- Uma policy WITH CHECK enxerga apenas a linha NOVA; ela nao sabe qual era
-- o papel antes e por isso nao consegue exigir "role nao mudou". O trigger
-- BEFORE UPDATE recebe OLD e NEW e compara os dois, que e exatamente o que
-- a regra precisa. A policy continua valendo para o resto — a edicao do
-- proprio nome segue liberada.
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

drop trigger if exists trg_usuarios_campos_sensiveis on public.usuarios;
create trigger trg_usuarios_campos_sensiveis
  before update on public.usuarios
  for each row execute function public.protege_campos_sensiveis_usuario();

-- Sobra ao usuario comum o que faz sentido editar na propria linha: `nome`.
-- `email` acompanha auth.users e tem fluxo proprio de reconfirmacao.


-- ---------------------------------------------------------------------
-- >>> 006 · ANONIMIZACAO (LGPD)
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- >>> 007 · NOTIFICACOES (lembrete de vespera)
-- ---------------------------------------------------------------------

-- =====================================================================
-- 007 - NOTIFICACOES (lembrete de vespera)
-- Execute depois de 006_anonimizacao_lgpd.sql.
--
-- O nao comparecimento e o numero que o franqueado acompanha, e o lembrete
-- de vespera ataca exatamente ele. Esta tabela existe para uma unica coisa:
-- garantir que a rotina diaria nao mande a mesma mensagem duas vezes.
--
-- O QUE ELA NAO GUARDA
-- Nem telefone, nem e-mail, nem nome. O destino ja esta em `agendamentos` e
-- copiar para ca criaria uma segunda base de dados pessoais — que teria de
-- ser anonimizada junto, e que alguem esqueceria. Aqui fica so a referencia.
-- =====================================================================

create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  tipo           text not null check (tipo in ('vespera')),
  canal          text not null check (canal in ('email', 'whatsapp', 'sms', 'registro')),
  status         text not null check (status in ('enviada', 'falhou')),
  -- Mensagem tecnica do provedor quando falha. Nunca o conteudo enviado.
  detalhe        text,
  criada_em      timestamptz not null default now()
);

-- Idempotencia no banco, nao no codigo: uma tentativa BEM SUCEDIDA e unica
-- por agendamento e tipo. O indice e parcial de proposito — falhas podem se
-- repetir, e precisam poder, senao uma indisponibilidade do provedor
-- impediria a reentrega para sempre.
create unique index if not exists notificacoes_enviada_unica
  on public.notificacoes (agendamento_id, tipo)
  where status = 'enviada';

create index if not exists idx_notificacoes_agendamento
  on public.notificacoes (agendamento_id);

-- ---------------------------------------------------------------------
-- RLS: quem enxerga o agendamento enxerga as notificacoes dele.
-- A escrita fica com a rotina (service role), que ignora RLS — nenhuma
-- policy de insert e criada, entao usuario autenticado nao registra envio
-- a mao.
-- ---------------------------------------------------------------------
alter table public.notificacoes enable row level security;

drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes for select to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = notificacoes.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

-- ---------------------------------------------------------------------
-- Quem deve receber lembrete amanha.
--
-- `p_data` chega ja calculada pela aplicacao no fuso de Brasilia. Deixar o
-- banco resolver com current_date usaria UTC: as 21h em Brasilia o UTC ja
-- virou o dia, e a rotina notificaria a data errada.
--
-- Exclui anonimizados: nao ha para quem mandar, e insistir seria tratar
-- dado que o titular pediu para eliminar.
-- ---------------------------------------------------------------------
create or replace function public.agendamentos_para_lembrete(p_data date)
returns table (
  id               uuid,
  cliente_nome     text,
  cliente_email    text,
  cliente_telefone text,
  data_agendamento date,
  loja_nome        text
)
language sql stable security definer set search_path = public
as $$
  select a.id,
         a.cliente_nome,
         a.cliente_email,
         a.cliente_telefone,
         a.data_agendamento,
         l.nome
  from public.agendamentos a
  join public.lojas l on l.id = a.loja_id
  where a.data_agendamento = p_data
    and a.status = 'agendado'
    and a.anonimizado_em is null
    and not exists (
      select 1 from public.notificacoes n
      where n.agendamento_id = a.id
        and n.tipo = 'vespera'
        and n.status = 'enviada'
    )
  order by l.nome, a.cliente_nome;
$$;

comment on function public.agendamentos_para_lembrete(date) is
  'Agendamentos confirmados para a data informada que ainda nao receberam lembrete de vespera.';


-- ---------------------------------------------------------------------
-- >>> 008 · VENDAS (fecha o funil)
-- ---------------------------------------------------------------------

-- =====================================================================
-- 008 - VENDAS (fecha o funil)
-- Execute depois de 007_notificacoes.sql.
--
-- Ate aqui o funil parava no comparecimento: o sistema media quantas pessoas
-- apareceram, nao quantas compraram. Sem isso, um agendador que traz muita
-- gente que nao compra parece melhor que um que traz pouca gente que compra.
--
-- POR QUE TABELA SEPARADA, E NAO COLUNAS EM `agendamentos`
-- A maioria dos agendamentos nao vira venda, entao colunas de valor ficariam
-- nulas na maior parte das linhas. Separar tambem deixa registrar QUEM
-- lancou a venda e QUANDO, que e informacao de auditoria que nao pertence
-- ao agendamento.
-- =====================================================================

create table if not exists public.vendas (
  id             uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,

  -- numeric, nunca float: 0.1 + 0.2 em ponto flutuante nao da 0.3, e em
  -- dinheiro esse erro vira divergencia de fechamento.
  valor          numeric(12, 2) not null check (valor > 0),

  descricao      text,
  data_venda     date not null,

  -- Auditoria: quem lancou. `on delete restrict` porque apagar o usuario
  -- apagaria a autoria de um lancamento financeiro.
  registrada_por uuid not null references public.usuarios (id) on delete restrict,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Uma visita gera no maximo uma venda. Se a pessoa voltar e comprar de
  -- novo, isso e outro atendimento e outro agendamento.
  unique (agendamento_id)
);

create index if not exists idx_vendas_data on public.vendas (data_venda);
create index if not exists idx_vendas_agendamento on public.vendas (agendamento_id);

drop trigger if exists trg_vendas_updated_at on public.vendas;
create trigger trg_vendas_updated_at before update on public.vendas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Integridade: venda so existe onde houve comparecimento.
--
-- Isso e regra de negocio, mas fica no banco porque a alternativa — confiar
-- so na validacao da aplicacao — deixaria a porta aberta para qualquer
-- caminho que nao passe por ela (script, correcao manual, rota futura).
-- ---------------------------------------------------------------------
create or replace function public.venda_exige_comparecimento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.agendamentos a
  where a.id = new.agendamento_id;

  if v_status is distinct from 'compareceu' then
    raise exception 'Venda so pode ser registrada em agendamento com comparecimento confirmado'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vendas_exige_comparecimento on public.vendas;
create trigger trg_vendas_exige_comparecimento
  before insert or update of agendamento_id on public.vendas
  for each row execute function public.venda_exige_comparecimento();

-- ---------------------------------------------------------------------
-- RLS: venda segue o escopo do agendamento a que pertence.
-- Agendador registra a venda da propria loja; apagar fica com gestor, pela
-- mesma razao que ele nao apaga agendamento — e historico financeiro.
-- ---------------------------------------------------------------------
alter table public.vendas enable row level security;

drop policy if exists vendas_select on public.vendas;
create policy vendas_select on public.vendas for select to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_insert on public.vendas;
create policy vendas_insert on public.vendas for insert to authenticated
with check (
  registrada_por = auth.uid()
  and exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_update on public.vendas;
create policy vendas_update on public.vendas for update to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
)
with check (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);

drop policy if exists vendas_delete on public.vendas;
create policy vendas_delete on public.vendas for delete to authenticated
using (
  public.usuario_role() in ('super_admin', 'franqueado', 'diretor')
  and exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
  )
);


-- ---------------------------------------------------------------------
-- >>> 009 · METAS POR AGENDADOR
-- ---------------------------------------------------------------------

-- =====================================================================
-- 009 - METAS POR AGENDADOR
-- Execute depois de 008_vendas.sql.
--
-- O sistema ja mede o desempenho de cada agendador. Faltava o outro lado da
-- conta: o que se esperava dele. Sem meta, "42 agendamentos no mes" nao diz
-- se foi bom ou ruim — e o franqueado precisa saber quem esta abaixo antes
-- do fim do mes, nao depois.
--
-- COMPETENCIA, NAO INTERVALO
-- A meta e mensal e `competencia` guarda sempre o dia 1 do mes. Uma meta com
-- inicio e fim livres pareceria mais flexivel, mas abriria espaco para
-- periodos sobrepostos e para a pergunta "qual meta vale hoje?" nao ter
-- resposta unica.
-- =====================================================================

create table if not exists public.metas (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuarios (id) on delete cascade,

  -- Sempre o dia 1. O check evita que alguem grave 15/03 e crie duas metas
  -- para o mesmo mes sem violar o unique.
  competencia  date not null check (extract(day from competencia) = 1),

  -- Todas opcionais: cada rede acompanha o que importa para ela. Uma meta
  -- sem nenhum alvo definido nao faz sentido, e o check abaixo barra isso.
  meta_agendamentos    int            check (meta_agendamentos is null or meta_agendamentos > 0),
  meta_taxa_conversao  numeric(5, 2)  check (meta_taxa_conversao is null or (meta_taxa_conversao > 0 and meta_taxa_conversao <= 100)),
  meta_vendas          int            check (meta_vendas is null or meta_vendas > 0),
  meta_receita         numeric(12, 2) check (meta_receita is null or meta_receita > 0),

  definida_por uuid not null references public.usuarios (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (usuario_id, competencia),

  constraint meta_precisa_de_alvo check (
    meta_agendamentos is not null
    or meta_taxa_conversao is not null
    or meta_vendas is not null
    or meta_receita is not null
  )
);

create index if not exists idx_metas_competencia on public.metas (competencia);

drop trigger if exists trg_metas_updated_at on public.metas;
create trigger trg_metas_updated_at before update on public.metas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
--
-- O agendador LE a propria meta: saber o alvo e parte de persegui-lo, e
-- esconder isso tornaria a meta um instrumento de cobranca em vez de
-- direcao. Escrever fica com quem gerencia.
-- ---------------------------------------------------------------------
alter table public.metas enable row level security;

drop policy if exists metas_select on public.metas;
create policy metas_select on public.metas for select to authenticated
using (
  usuario_id = auth.uid()
  or public.is_super_admin()
  or (
    public.usuario_role() in ('franqueado', 'diretor')
    and exists (
      select 1 from public.agendadores_lojas al
      where al.usuario_id = metas.usuario_id
        and al.data_fim is null
        and al.loja_id in (select public.lojas_permitidas())
    )
  )
);

drop policy if exists metas_write on public.metas;
create policy metas_write on public.metas for all to authenticated
using (public.pode_gerenciar())
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


-- ---------------------------------------------------------------------
-- >>> 010 · RELATORIO SEMANAL POR E-MAIL
-- ---------------------------------------------------------------------

-- =====================================================================
-- 010 - RELATORIO SEMANAL POR E-MAIL
-- Execute depois de 009_metas.sql.
--
-- O franqueado nao abre o sistema todo dia. O resumo semanal leva o numero
-- ate ele — e, quando algo destoa, ele entra para investigar.
--
-- POR QUE AGREGAR NO BANCO
-- As metricas da aplicacao sao calculadas em JavaScript, o que faz sentido
-- para uma tela que ja carregou os registros. Uma rotina em lote nao tem
-- essa leitura na mao, e trazer milhares de linhas para somar quatro
-- numeros seria desperdicio. Aqui a agregacao fica onde os dados estao.
-- =====================================================================

create table if not exists public.envios_relatorio (
  id            uuid primary key default gen_random_uuid(),
  franqueado_id uuid not null references public.franqueados (id) on delete cascade,

  -- Segunda-feira da semana coberta. O check evita gravar outro dia e criar
  -- duas linhas para a mesma semana sem violar o indice.
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),

  status        text not null check (status in ('enviado', 'falhou')),
  detalhe       text,
  criado_em     timestamptz not null default now()
);

-- Mesma ideia do lembrete de vespera: sucesso e unico, falha pode repetir.
-- Se o indice cobrisse todas as linhas, uma queda do provedor impediria a
-- reentrega para sempre.
create unique index if not exists envios_relatorio_unico
  on public.envios_relatorio (franqueado_id, semana_inicio)
  where status = 'enviado';

alter table public.envios_relatorio enable row level security;

drop policy if exists envios_relatorio_select on public.envios_relatorio;
create policy envios_relatorio_select on public.envios_relatorio for select to authenticated
using (public.is_super_admin() or franqueado_id = public.usuario_franqueado_id());

-- ---------------------------------------------------------------------
-- Resumo do periodo para um franqueado.
--
-- Os nomes espelham os da aplicacao (contatos, agendados, compareceram) para
-- quem ler os dois lados reconhecer o mesmo vocabulario.
-- ---------------------------------------------------------------------
create or replace function public.resumo_do_periodo(
  p_franqueado_id uuid,
  p_inicio date,
  p_fim date
)
returns table (
  contatos      bigint,
  agendados     bigint,
  compareceram  bigint,
  nao_compareceram bigint,
  vendas        bigint,
  receita       numeric,
  melhor_loja   text
)
language sql stable security definer set search_path = public
as $$
  with periodo as (
    select a.id, a.loja_id, a.status
    from public.agendamentos a
    where a.franqueado_id = p_franqueado_id
      and a.data_agendamento between p_inicio and p_fim
  ),
  vendas_periodo as (
    select v.agendamento_id, v.valor
    from public.vendas v
    join periodo p on p.id = v.agendamento_id
  ),
  ranking as (
    select l.nome
    from periodo p
    join public.lojas l on l.id = p.loja_id
    where p.status = 'compareceu'
    group by l.nome
    order by count(*) desc, l.nome
    limit 1
  )
  select
    (select count(*) from periodo),
    (select count(*) from periodo where status in ('agendado', 'compareceu', 'nao_compareceu')),
    (select count(*) from periodo where status = 'compareceu'),
    (select count(*) from periodo where status = 'nao_compareceu'),
    (select count(*) from vendas_periodo),
    (select coalesce(sum(valor), 0) from vendas_periodo),
    (select nome from ranking);
$$;

comment on function public.resumo_do_periodo(uuid, date, date) is
  'Agregados de um franqueado no periodo. Usado pelo relatorio semanal por e-mail.';


-- ---------------------------------------------------------------------
-- >>> 011 · VENDA TRAVA A MUDANCA DE STATUS
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- >>> 012 · VINCULO SO DENTRO DO PROPRIO TENANT
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- >>> 013 · SO UM SUPER ADMIN CONCEDE O PAPEL DE SUPER ADMIN
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- >>> 014 · METAS: O ESCOPO ESTAVA SO NA ESCRITA
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- >>> 015 · ASSINATURA: SUSPENDER A REDE, E SUSPENDER UMA LOJA
-- ---------------------------------------------------------------------

-- =====================================================================
-- 015 - ASSINATURA: SUSPENDER A REDE, E SUSPENDER UMA LOJA
-- Execute depois de 013_metas_escopo_do_tenant.sql.
--
-- O QUE FALTAVA
-- `franqueados.status` aceita 'ativo', 'inativo' e 'pendente' desde o
-- primeiro dia, e NUNCA foi conferido — nem numa policy, nem no codigo.
-- Marcar uma rede como inativa nao tirava o acesso de ninguem: a coluna era
-- decoracao. Para cortar um cliente que parou de pagar era preciso desligar
-- as contas dele uma a uma, e refazer tudo na volta.
--
-- `lojas.status` estava no mesmo estado, com um agravante: a lista de lojas
-- da aplicacao ja filtrava por `status = 'ativo'`, entao a loja sumia do
-- seletor e PARECIA desligada — enquanto continuava aceitando escrita por
-- qualquer caminho que nao passasse por aquele seletor.
--
-- AS DUAS REGRAS SAO DIFERENTES, DE PROPOSITO
--
-- Rede suspensa CORTA TUDO. Ninguem daquele tenant le nem escreve. E o caso
-- do cliente que parou de pagar: manter os relatorios de pe seria entregar o
-- produto de graca.
--
-- Loja suspensa BLOQUEIA A ESCRITA E PRESERVA A LEITURA. E o caso do
-- franqueado que cancela UMA unidade e segue cliente nas outras. Esconder o
-- historico dela seria apagar meses de medicao de quem continua pagando — o
-- que ele perdeu foi o direito de registrar ali, nao o passado.
--
-- Super admin fica de fora das duas: e ele quem reativa, e quem nao enxerga
-- o que suspendeu nao tem como desfazer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A rede precisa estar ativa
--
-- A checagem entra em `usuario_role()` e nao em cada policy porque TUDO
-- comeca por ela: `lojas_permitidas()` sai vazia quando o papel e nulo, e
-- `is_super_admin()` e `pode_gerenciar()` derivam dela. Uma linha aqui vale
-- por trinta espalhadas.
--
-- As tres funcoes abaixo passam a DERIVAR de `usuario_role()` em vez de
-- repetir a consulta. Antes eram quatro copias do mesmo `where`, e este
-- projeto ja perdeu tempo com duas listas da mesma verdade divergindo.
-- ---------------------------------------------------------------------
create or replace function public.usuario_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select u.role
  from public.usuarios u
  -- `left join`: super admin nao tem franqueado_id, e um `join` comum o
  -- deixaria de fora — trancando para fora justamente quem reativa.
  left join public.franqueados f on f.id = u.franqueado_id
  where u.id = auth.uid()
    and u.status = 'ativo'
    and (u.role = 'super_admin' or f.status = 'ativo');
$$;

create or replace function public.usuario_franqueado_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select u.franqueado_id
  from public.usuarios u
  where u.id = auth.uid() and public.usuario_role() is not null;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.usuario_role() = 'super_admin', false);
$$;

create or replace function public.pode_gerenciar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.usuario_role() in ('super_admin', 'franqueado'), false);
$$;

-- ---------------------------------------------------------------------
-- 2. A loja precisa estar ativa para RECEBER trabalho
--
-- Nao entra em `lojas_permitidas()` de proposito: aquela funcao alimenta as
-- policies de SELECT, e filtrar ali faria o historico da unidade cancelada
-- desaparecer dos relatorios de quem continua pagando.
-- ---------------------------------------------------------------------
create or replace function public.loja_ativa(p_loja_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lojas l where l.id = p_loja_id and l.status = 'ativo'
  );
$$;

drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos for insert to authenticated
with check (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
  and (public.is_super_admin() or public.loja_ativa(loja_id))
);

drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos for update to authenticated
using (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
  and (public.is_super_admin() or public.loja_ativa(loja_id))
)
with check (
  loja_id in (select public.lojas_permitidas())
  and (public.usuario_role() <> 'agendador' or agendador_id = auth.uid())
  and (public.is_super_admin() or public.loja_ativa(loja_id))
);

-- Venda nasce de um agendamento, entao a loja vem por ele.
drop policy if exists vendas_insert on public.vendas;
create policy vendas_insert on public.vendas for insert to authenticated
with check (
  registrada_por = auth.uid()
  and exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
      and (public.is_super_admin() or public.loja_ativa(a.loja_id))
  )
);

drop policy if exists vendas_update on public.vendas;
create policy vendas_update on public.vendas for update to authenticated
using (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
      and (public.is_super_admin() or public.loja_ativa(a.loja_id))
  )
)
with check (
  exists (
    select 1 from public.agendamentos a
    where a.id = vendas.agendamento_id
      and a.loja_id in (select public.lojas_permitidas())
      and (public.is_super_admin() or public.loja_ativa(a.loja_id))
  )
);

-- ---------------------------------------------------------------------
-- 3. Uma rede suspensa nao se reativa sozinha
--
-- `franqueados_update` deixava o proprio franqueado editar a rede dele, o
-- que inclui a coluna `status`. Sem esta trava, o cliente cortado por falta
-- de pagamento voltaria sozinho — bastaria o UPDATE.
--
-- Na pratica ele ja nao consegue: com a rede inativa `usuario_role()` volta
-- nulo e a policy inteira falha. Mas a regra fica escrita, para nao depender
-- de um efeito colateral que alguem pode remover sem perceber.
-- ---------------------------------------------------------------------
create or replace function public.protege_status_do_franqueado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- service role (Admin API, scripts) nao tem auth.uid(): mesma isencao das
  -- outras travas deste banco.
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status and not public.is_super_admin() then
    raise exception 'Apenas um super admin muda a situacao da rede'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_franqueados_status on public.franqueados;
create trigger trg_franqueados_status
  before update on public.franqueados
  for each row execute function public.protege_status_do_franqueado();

-- ---------------------------------------------------------------------
-- 4. A rede suspensa continua LEGIVEL para quem pertence a ela
--
-- Mesmo motivo pelo qual o usuario desligado le a propria linha (003): sem
-- isto, o cliente suspenso ve telas vazias e conclui que o sistema quebrou —
-- e liga para o suporte. Com isto, a aplicacao le a situacao da rede e diz
-- "assinatura suspensa" na tela de entrada.
--
-- A condicao NAO pode usar `usuario_franqueado_id()`: ela devolve nulo
-- justamente quando a rede esta suspensa, que e o caso que precisamos ler.
-- Ler UMA linha de nome e situacao nao devolve dado de negocio nenhum.
-- ---------------------------------------------------------------------
drop policy if exists franqueados_select on public.franqueados;
create policy franqueados_select on public.franqueados for select to authenticated
using (
  public.is_super_admin()
  or id = public.usuario_franqueado_id()
  or id = (
    select u.franqueado_id from public.usuarios u
    where u.id = auth.uid() and u.status = 'ativo'
  )
);


-- ---------------------------------------------------------------------
-- >>> 016 · CONVITE DE REDE
-- ---------------------------------------------------------------------

-- =====================================================================
-- 016 - CONVITE DE REDE
-- Execute depois de 015_assinatura_rede_e_loja.sql.
--
-- O PROBLEMA
-- Nao ha auto-cadastro nesta aplicacao, de proposito. O efeito colateral e
-- que toda venda passava por uma acao manual do dono do produto: criar a
-- rede, criar o login do cliente, repassar a senha. O cliente esperava por
-- uma pessoa, e essa pessoa virava gargalo.
--
-- O convite resolve sem abrir a porta. O link e gerado quando der na
-- cabeca — dez de uma vez, antes de existir cliente — e vale por si. Quem
-- tem o link se cadastra; quem nao tem, continua sem caminho nenhum.
--
-- POR QUE GUARDAR O HASH, E NAO O TOKEN
-- O token e uma credencial: quem o tem cria uma rede. Guardar em texto puro
-- significa que qualquer vazamento desta tabela — um dump, um log de erro,
-- uma consulta compartilhada — entrega convites utilizaveis. O hash nao
-- volta a ser link, e conferir e barato: SHA-256 de 256 bits de entropia
-- nao precisa de fator de trabalho como senha precisa, porque nao ha o que
-- adivinhar.
--
-- A consequencia e deliberada: o link aparece UMA vez, na hora de gerar.
-- Perdeu, gera outro — nao ha como recuperar, nem por dentro do banco.
-- =====================================================================

create table if not exists public.convites (
  id            uuid primary key default gen_random_uuid(),

  -- SHA-256 do token, em hexadecimal. Nunca o token.
  token_hash    text not null unique,

  -- Para voce se achar na lista: "Casa do Celular Goiania", "lead da feira".
  -- Nao e mostrado a quem recebe o convite.
  observacao    text,

  criado_por    uuid not null references public.usuarios (id) on delete restrict,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,

  -- Uso unico. Marcar a data, e nao um booleano, responde "quando" de graca.
  usado_em      timestamptz,

  -- Preenchido no resgate: liga o convite a rede que nasceu dele.
  -- `set null` porque apagar a rede nao deve apagar o registro do convite.
  franqueado_id uuid references public.franqueados (id) on delete set null,

  constraint convite_prazo_valido check (expira_em > criado_em)
);

-- A busca do resgate e sempre por hash. O unique ja cria o indice.
create index if not exists idx_convites_criado_em on public.convites (criado_em desc);

-- ---------------------------------------------------------------------
-- RLS
--
-- So o super admin enxerga e cria. Nao ha policy para o franqueado: convidar
-- rede nova e vender o produto, e isso e do dono do produto.
--
-- O RESGATE nao passa por aqui. Ele acontece numa rota publica, sem sessao,
-- com service role — nao existe usuario autenticado para uma policy avaliar.
-- Por isso a validacao do prazo e do uso unico esta na funcao abaixo, e nao
-- numa policy que aquele caminho nunca consultaria.
-- ---------------------------------------------------------------------
alter table public.convites enable row level security;

drop policy if exists convites_select on public.convites;
create policy convites_select on public.convites for select to authenticated
using (public.is_super_admin());

drop policy if exists convites_insert on public.convites;
create policy convites_insert on public.convites for insert to authenticated
with check (public.is_super_admin() and criado_por = auth.uid());

drop policy if exists convites_delete on public.convites;
create policy convites_delete on public.convites for delete to authenticated
using (public.is_super_admin());

-- Nao ha policy de UPDATE de proposito: convite nao se edita. Ou se usa (o
-- resgate, por service role), ou se apaga.

-- ---------------------------------------------------------------------
-- Resgate: reserva o convite de forma ATOMICA.
--
-- POR QUE UMA FUNCAO, E NAO TRES CONSULTAS NA APLICACAO
-- Ler o convite, conferir se esta livre e depois marcar como usado sao tres
-- passos, e entre o segundo e o terceiro cabe outra requisicao. Dois cliques
-- no mesmo link, ou o mesmo link aberto em duas abas, criariam duas redes a
-- partir de um convite de uso unico.
--
-- Aqui a conferencia e a marcacao sao o MESMO update. O segundo a chegar
-- encontra `usado_em` preenchido, a clausula nao casa, e a funcao devolve
-- nulo — sem corrida possivel.
--
-- Devolve o id do convite reservado, ou nulo quando o token nao existe, ja
-- foi usado ou expirou. Os tres casos dao a mesma resposta: distinguir
-- ajudaria mais quem esta testando tokens do que quem tem um convite legitimo.
-- ---------------------------------------------------------------------
create or replace function public.reservar_convite(p_token_hash text)
returns uuid
language sql volatile security definer set search_path = public
as $$
  update public.convites
  set usado_em = now()
  where token_hash = p_token_hash
    and usado_em is null
    and expira_em > now()
  returning id;
$$;

comment on function public.reservar_convite(text) is
  'Marca o convite como usado e devolve o id, numa unica operacao. Nulo quando invalido, expirado ou ja usado.';

-- ---------------------------------------------------------------------
-- Devolve o convite ao estado livre.
--
-- Existe porque a reserva acontece ANTES de criar a rede e a conta: se a
-- criacao falhar no meio, o convite ficaria queimado sem nada ter nascido, e
-- o cliente veria "este link ja foi usado" na primeira tentativa dele.
-- ---------------------------------------------------------------------
create or replace function public.liberar_convite(p_id uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.convites set usado_em = null where id = p_id and franqueado_id is null;
$$;


-- =====================================================================
-- RECARGA DO CACHE DE SCHEMA
--
-- O PostgREST guarda em memoria a lista de tabelas e funcoes expostas.
-- Sem esta recarga, uma funcao recem-criada existe no banco mas responde
-- "Could not find the function ... in the schema cache" quando chamada
-- pela API — o que faz parecer que a migration nao rodou.
-- =====================================================================
notify pgrst, 'reload schema';


-- =====================================================================
-- CONFERENCIA
--
-- Roda depois de tudo e devolve uma linha por item esperado, com OK ou
-- FALTANDO. Se alguma linha vier FALTANDO, o trecho correspondente acima
-- nao foi aplicado — copie a mensagem de erro que o editor mostrou.
--
-- Usa to_regclass em vez do cast ::regclass: o cast levanta erro quando a
-- tabela nao existe e derrubaria a consulta inteira, justamente no caso em
-- que ela precisa reportar.
-- =====================================================================
with esperado(item, tipo, presente) as (
  values
    ('usuarios.status',                 'coluna',
      (select count(*) > 0 from information_schema.columns
        where table_schema = 'public' and table_name = 'usuarios' and column_name = 'status')),
    ('agendamentos.anonimizado_em',     'coluna',
      (select count(*) > 0 from information_schema.columns
        where table_schema = 'public' and table_name = 'agendamentos' and column_name = 'anonimizado_em')),
    ('notificacoes',                    'tabela', (select to_regclass('public.notificacoes') is not null)),
    ('vendas',                          'tabela', (select to_regclass('public.vendas') is not null)),
    ('metas',                           'tabela', (select to_regclass('public.metas') is not null)),
    ('envios_relatorio',                'tabela', (select to_regclass('public.envios_relatorio') is not null)),
    ('trg_usuarios_campos_sensiveis',   'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.usuarios') and tgname = 'trg_usuarios_campos_sensiveis')),
    ('trg_agendadores_lojas_tenant',    'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.agendadores_lojas') and tgname = 'trg_agendadores_lojas_tenant')),
    ('trg_participacoes_tenant',        'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.participacoes_societarias') and tgname = 'trg_participacoes_tenant')),
    ('trg_vendas_updated_at',           'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.vendas') and tgname = 'trg_vendas_updated_at')),
    ('trg_metas_updated_at',            'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.metas') and tgname = 'trg_metas_updated_at')),
    ('trg_agendamentos_status_venda',   'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.agendamentos') and tgname = 'trg_agendamentos_status_venda')),
    ('trg_vendas_exige_comparecimento', 'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.vendas') and tgname = 'trg_vendas_exige_comparecimento')),
    ('anonimizar_agendamentos_antigos', 'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'anonimizar_agendamentos_antigos')),
    ('agendamentos_para_lembrete',      'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'agendamentos_para_lembrete')),
    ('resumo_do_periodo',               'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'resumo_do_periodo')),

    -- As duas ultimas migrations nao criam objeto novo: uma troca o CORPO de
    -- um trigger que ja existia, a outra troca uma policy. Conferir presenca
    -- diria OK sem elas terem rodado — e sao justamente as duas que fecham
    -- escalada de privilegio. Por isso aqui se olha o conteudo.
    ('013 · super admin so por super admin', 'regra',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'protege_campos_sensiveis_usuario'
          and pg_get_functiondef(p.oid) like '%Apenas um super admin%')),
    ('014 · metas escopadas pelo tenant',    'regra',
      (select count(*) > 0 from pg_policies
        where schemaname = 'public' and policyname = 'metas_write'
          and qual like '%franqueado_id%')),

    -- 015 troca corpo de funcao e de policy, alem de criar duas funcoes e um
    -- trigger. As duas primeiras linhas olham CONTEUDO: sem elas, suspender
    -- assinatura nao suspende nada — e a tela nao acusa, porque as colunas de
    -- status sempre existiram.
    ('015 · rede suspensa corta o acesso',   'regra',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'usuario_role'
          and pg_get_functiondef(p.oid) like '%franqueados%')),
    ('015 · loja suspensa barra escrita',    'regra',
      (select count(*) > 0 from pg_policies
        where schemaname = 'public' and policyname = 'agendamentos_insert'
          and with_check like '%loja_ativa%')),
    ('loja_ativa',                           'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'loja_ativa')),
    ('protege_status_do_franqueado',         'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'protege_status_do_franqueado')),
    ('trg_franqueados_status',               'trigger',
      (select count(*) > 0 from pg_trigger
        where tgrelid = to_regclass('public.franqueados') and tgname = 'trg_franqueados_status')),
    ('convites',                             'tabela', (select to_regclass('public.convites') is not null)),
    ('reservar_convite',                     'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'reservar_convite')),
    ('liberar_convite',                      'funcao',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'liberar_convite'))
)
select
  case when presente then 'OK' else 'FALTANDO' end as situacao,
  tipo,
  item
from esperado
order by presente, item;
