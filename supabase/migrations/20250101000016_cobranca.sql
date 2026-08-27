-- =====================================================================
-- 017 - CICLO DE COBRANCA DA ASSINATURA
-- Execute depois de 016_convites.sql.
--
-- O QUE ISTO FAZ
-- Cada rede tem um vencimento. No dia dele, sai um aviso por e-mail. A
-- partir do aviso comecam tres dias de carencia; passados eles sem
-- pagamento, a rede e suspensa sozinha — o mesmo efeito de 015, agora sem
-- ninguem precisar lembrar.
--
-- DURANTE A CARENCIA O ACESSO CONTINUA
-- O cliente foi AVISADO, nao cortado. Suspender no mesmo dia do vencimento
-- transformaria um atraso de banco em interrupcao de operacao, e quem paga
-- no dia 5 todo mes viraria um chamado de suporte por mes.
--
-- VENCIMENTO NULO = REDE NAO COBRADA
-- Serve para a rede do proprio dono do produto e para cortesia. Sem isso, a
-- primeira coisa que a rotina faria seria avisar voce mesmo, e depois se
-- cortar. O default cobre quem nasce daqui para frente; quem ja existia fica
-- nulo ate alguem definir.
--
-- POR QUE O AVISO NAO E APENAS UMA DATA CALCULADA
-- Daria para deduzir "avisado" de `vence_em + N`, sem coluna nova. Mas a
-- carencia precisa comecar quando a mensagem SAIU, nao quando deveria ter
-- saido: se o provedor de e-mail estiver fora do ar por dois dias, o cliente
-- perderia dois tercos do prazo sem nunca ter sido avisado.
-- =====================================================================

alter table public.franqueados
  add column if not exists assinatura_vence_em date default (current_date + 30);

alter table public.franqueados
  add column if not exists assinatura_avisado_em date;

comment on column public.franqueados.assinatura_vence_em is
  'Proximo vencimento da assinatura. Nulo = rede nao cobrada (propria, cortesia).';
comment on column public.franqueados.assinatura_avisado_em is
  'Quando o aviso de vencimento SAIU. Nulo = ciclo em dia ou ainda nao avisado. A carencia conta daqui.';

create index if not exists idx_franqueados_vencimento
  on public.franqueados (assinatura_vence_em)
  where assinatura_vence_em is not null;

-- ---------------------------------------------------------------------
-- Registro do que a rotina fez.
--
-- Mesmo desenho de `notificacoes` e `envios_relatorio`: o indice unico e
-- PARCIAL, cobrindo so o que deu certo. Sucesso e unico por vencimento;
-- falha pode repetir, e precisa poder — senao uma indisponibilidade do
-- provedor impediria a reentrega para sempre, e o cliente seria suspenso
-- sem nunca ter recebido aviso nenhum.
-- ---------------------------------------------------------------------
create table if not exists public.cobrancas (
  id            uuid primary key default gen_random_uuid(),
  franqueado_id uuid not null references public.franqueados (id) on delete cascade,

  -- O vencimento a que este evento se refere. Guardado, e nao lido da rede,
  -- porque a rede segue em frente: depois do pagamento `vence_em` avanca, e
  -- o historico precisa continuar dizendo de qual ciclo se tratava.
  vencimento    date not null,

  tipo          text not null check (tipo in ('aviso', 'suspensao', 'pagamento')),
  status        text not null check (status in ('enviado', 'falhou', 'registrado')),
  detalhe       text,
  criado_em     timestamptz not null default now()
);

create unique index if not exists cobrancas_evento_unico
  on public.cobrancas (franqueado_id, vencimento, tipo)
  where status in ('enviado', 'registrado');

create index if not exists idx_cobrancas_franqueado
  on public.cobrancas (franqueado_id, criado_em desc);

alter table public.cobrancas enable row level security;

-- ---------------------------------------------------------------------
-- O franqueado LE a propria cobranca.
--
-- Esconder seria estranho: e sobre a conta dele, e ele recebeu o e-mail. A
-- escrita fica com a rotina (service role) e com o painel do super admin.
--
-- A condicao repete a de `franqueados_select` (015) em vez de usar
-- `usuario_franqueado_id()`: aquela funcao devolve nulo justamente quando a
-- rede esta suspensa, que e quando o cliente mais quer entender o motivo.
-- ---------------------------------------------------------------------
drop policy if exists cobrancas_select on public.cobrancas;
create policy cobrancas_select on public.cobrancas for select to authenticated
using (
  public.is_super_admin()
  or franqueado_id = (
    select u.franqueado_id from public.usuarios u
    where u.id = auth.uid() and u.status = 'ativo'
  )
);

-- ---------------------------------------------------------------------
-- Quem avisar hoje.
--
-- `p_hoje` chega calculada pela aplicacao no fuso de Brasilia. Deixar o
-- banco resolver com current_date usaria UTC, e as 21h em Brasilia o UTC ja
-- virou o dia — a rotina avisaria um dia antes.
--
-- So redes ATIVAS: uma ja suspensa nao precisa de aviso de vencimento, e uma
-- ja avisada esta com o relogio da carencia correndo.
-- ---------------------------------------------------------------------
create or replace function public.franqueados_a_avisar(p_hoje date)
returns table (
  id            uuid,
  nome          text,
  email_contato text,
  vencimento    date
)
language sql stable security definer set search_path = public
as $$
  select f.id, f.nome, f.email_contato, f.assinatura_vence_em
  from public.franqueados f
  where f.status = 'ativo'
    and f.assinatura_vence_em is not null
    and f.assinatura_avisado_em is null
    and p_hoje >= f.assinatura_vence_em
  order by f.assinatura_vence_em, f.nome;
$$;

comment on function public.franqueados_a_avisar(date) is
  'Redes ativas com vencimento chegado e aviso ainda nao enviado.';

-- ---------------------------------------------------------------------
-- Marca que o aviso SAIU. Chamada so depois do envio bem sucedido.
--
-- E aqui que a carencia comeca a contar. Marcar antes de enviar faria o
-- prazo correr para quem nunca foi avisado.
-- ---------------------------------------------------------------------
create or replace function public.marcar_aviso_enviado(p_id uuid, p_hoje date)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.franqueados set assinatura_avisado_em = p_hoje where id = p_id;
$$;

-- ---------------------------------------------------------------------
-- Quem suspender hoje.
--
-- A CONTA DA CARENCIA, explicita porque e a parte que gera discussao:
-- avisado no dia D, o cliente tem os dias D, D+1 e D+2 para pagar — tres
-- dias. A suspensao acontece em D+3, quando o prazo ja passou inteiro.
-- ---------------------------------------------------------------------
create or replace function public.franqueados_a_suspender(p_hoje date, p_carencia int default 3)
returns table (
  id          uuid,
  nome        text,
  vencimento  date,
  avisado_em  date
)
language sql stable security definer set search_path = public
as $$
  select f.id, f.nome, f.assinatura_vence_em, f.assinatura_avisado_em
  from public.franqueados f
  where f.status = 'ativo'
    and f.assinatura_avisado_em is not null
    and p_hoje >= f.assinatura_avisado_em + p_carencia
  order by f.assinatura_avisado_em, f.nome;
$$;

comment on function public.franqueados_a_suspender(date, int) is
  'Redes avisadas cuja carencia terminou sem pagamento. Avisado no dia D, suspende em D+carencia.';

-- ---------------------------------------------------------------------
-- Suspende. O trigger de 015 exige super admin para mexer em `status`, e
-- `auth.uid()` e nulo no service role — o mesmo caminho que a Admin API
-- usa, e a mesma isencao.
-- ---------------------------------------------------------------------
create or replace function public.suspender_por_inadimplencia(p_id uuid)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.franqueados set status = 'inativo' where id = p_id and status = 'ativo';
$$;

-- ---------------------------------------------------------------------
-- Pagamento registrado: avanca o ciclo e devolve o acesso.
--
-- O NOVO VENCIMENTO NAO E "hoje + 30" QUANDO O ATRASO E PEQUENO. Somar ao
-- vencimento antigo mantem a data do mes: quem vence dia 10 e paga dia 12
-- continua vencendo dia 10. Somar a hoje empurraria o vencimento alguns dias
-- a cada atraso, e em um ano o cliente teria ganhado um mes.
--
-- Mas isso so vale enquanto o vencimento novo cair no futuro. Numa rede
-- parada ha meses, somar 30 dias ao vencimento antigo produziria uma data
-- ainda vencida, e a rotina avisaria de novo no dia seguinte. Nesse caso o
-- ciclo recomeca de hoje.
-- ---------------------------------------------------------------------
create or replace function public.registrar_pagamento(p_id uuid, p_hoje date, p_dias int default 30)
returns date
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_atual date;
  v_novo  date;
begin
  select assinatura_vence_em into v_atual from public.franqueados where id = p_id;

  v_novo := coalesce(v_atual, p_hoje) + p_dias;
  if v_novo <= p_hoje then
    v_novo := p_hoje + p_dias;
  end if;

  update public.franqueados
  set assinatura_vence_em  = v_novo,
      assinatura_avisado_em = null,
      status = 'ativo'
  where id = p_id;

  insert into public.cobrancas (franqueado_id, vencimento, tipo, status, detalhe)
  values (p_id, coalesce(v_atual, p_hoje), 'pagamento', 'registrado',
          'Proximo vencimento: ' || v_novo)
  on conflict do nothing;

  return v_novo;
end;
$$;

comment on function public.registrar_pagamento(uuid, date, int) is
  'Avanca o vencimento, limpa o aviso e reativa a rede. Devolve o novo vencimento.';
