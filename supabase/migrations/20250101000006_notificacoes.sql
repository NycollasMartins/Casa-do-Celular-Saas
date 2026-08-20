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
