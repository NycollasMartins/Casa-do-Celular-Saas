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
