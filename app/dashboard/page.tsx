import { Suspense } from 'react';
import { LojaSelector } from '@/components/dashboard/loja-selector';
import { PeriodoSelector } from '@/components/dashboard/periodo-selector';
import { MetricsCards, MetricsCardsSkeleton } from '@/components/dashboard/metrics-cards';
import { ChartsSkeleton } from '@/components/dashboard/charts-skeleton';
import { ChartsLazy } from '@/components/dashboard/charts-lazy';
import { AgendamentosTable, AgendamentosTableSkeleton } from '@/components/dashboard/agendamentos-table';
import { MinhaMeta } from '@/components/dashboard/minha-meta';
import { exigirUsuario } from '@/lib/auth/session';
import {
  buscarAgendadoresDoUsuario,
  buscarAgendamentos,
  buscarLojasDoUsuario,
  calcularMetricas,
  minhaMetaDoMes,
} from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { ROLE_LABEL } from '@/lib/utils';
import { PrimeirosPassos } from '@/components/dashboard/primeiros-passos';

export const metadata = { title: 'Visao geral · Casa do Celular' };

/**
 * O conteudo fica em componentes async separados para o Suspense
 * mostrar skeleton por bloco em vez de travar a pagina inteira.
 */
async function Indicadores({ filtros }: { filtros: ReturnType<typeof lerFiltros> }) {
  const metricas = await calcularMetricas(filtros);
  return (
    <>
      <MetricsCards metricas={metricas} />
      <ChartsLazy metricas={metricas} />
    </>
  );
}

/**
 * So aparece para quem tem meta definida no mes. Fica em Suspense proprio
 * para nao atrasar o resto do dashboard: sao duas consultas a mais.
 */
async function BlocoMinhaMeta({ usuarioId }: { usuarioId: string }) {
  const dados = await minhaMetaDoMes(usuarioId);
  if (!dados) return null;

  return (
    <MinhaMeta meta={dados.meta} realizado={dados.realizado} competencia={dados.competencia} />
  );
}

async function Tabela({
  filtros,
  role,
}: {
  filtros: ReturnType<typeof lerFiltros>;
  role: Awaited<ReturnType<typeof exigirUsuario>>['role'];
}) {
  const [agendamentos, lojas, agendadores] = await Promise.all([
    buscarAgendamentos({ ...filtros, limite: 500 }),
    buscarLojasDoUsuario(),
    buscarAgendadoresDoUsuario(),
  ]);

  return (
    <AgendamentosTable
      agendamentos={agendamentos}
      role={role}
      lojas={lojas}
      agendadores={agendadores}
      statusInicial={filtros.status}
    />
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const usuario = await exigirUsuario();
  const filtros = lerFiltros(searchParams);
  const lojas = await buscarLojasDoUsuario();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Ola, {usuario.nome.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ROLE_LABEL[usuario.role]} ·{' '}
            {filtros.lojaId
              ? lojas.find((loja) => loja.id === filtros.lojaId)?.nome ?? 'Loja'
              : lojas.length === 0
                ? 'nenhuma loja ainda'
                : `${lojas.length} ${lojas.length === 1 ? 'loja' : 'lojas'}`}
          </p>
        </div>

        {/* Filtro sobre nada e ruido: sem loja, o dropdown abre vazio e o
            periodo recorta um conjunto que nao existe. */}
        {lojas.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <LojaSelector lojas={lojas} role={usuario.role} lojaSelecionada={filtros.lojaId} />
            <PeriodoSelector
              periodo={filtros.periodo ?? '30d'}
              dataInicio={filtros.dataInicio}
              dataFim={filtros.dataFim}
            />
          </div>
        ) : null}
      </div>

      {/* A policy sempre permitiu o agendador ler a propria meta; faltava
          onde ele visse. Gestores acompanham a equipe inteira em /metas. */}
      {usuario.role === 'agendador' ? (
        <Suspense fallback={null}>
          <BlocoMinhaMeta usuarioId={usuario.id} />
        </Suspense>
      ) : null}

      {/* Sem loja alcancavel nao ha o que indicar. Antes esta area exibia
          zeros e a tabela sugeria "ajuste o periodo" — que aponta para o lugar
          errado: o que falta e o primeiro cadastro, e sem loja nem da para
          registrar atendimento. */}
      {lojas.length === 0 ? (
        <PrimeirosPassos role={usuario.role} />
      ) : (
        <>
          <Suspense
            key={JSON.stringify(filtros)}
            fallback={
              <>
                <MetricsCardsSkeleton />
                <ChartsSkeleton />
              </>
            }
          >
            <Indicadores filtros={filtros} />
          </Suspense>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">Agendamentos do periodo</h2>
            <Suspense key={`tabela-${JSON.stringify(filtros)}`} fallback={<AgendamentosTableSkeleton />}>
              <Tabela filtros={filtros} role={usuario.role} />
            </Suspense>
          </section>
        </>
      )}
    </div>
  );
}
