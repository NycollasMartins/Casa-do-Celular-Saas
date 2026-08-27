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
