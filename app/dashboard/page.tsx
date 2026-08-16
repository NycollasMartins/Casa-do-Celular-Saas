import { Suspense } from 'react';
import { LojaSelector } from '@/components/dashboard/loja-selector';
import { PeriodoSelector } from '@/components/dashboard/periodo-selector';
import { MetricsCards, MetricsCardsSkeleton } from '@/components/dashboard/metrics-cards';
import { ChartsContainer, ChartsSkeleton } from '@/components/dashboard/charts-container';
import { AgendamentosTable, AgendamentosTableSkeleton } from '@/components/dashboard/agendamentos-table';
import { exigirUsuario } from '@/lib/auth/session';
import {
  buscarAgendadoresDoUsuario,
  buscarAgendamentos,
  buscarLojasDoUsuario,
  calcularMetricas,
} from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { ROLE_LABEL } from '@/lib/utils';

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
      <ChartsContainer metricas={metricas} />
    </>
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
              : `${lojas.length} ${lojas.length === 1 ? 'loja' : 'lojas'}`}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <LojaSelector lojas={lojas} role={usuario.role} lojaSelecionada={filtros.lojaId} />
          <PeriodoSelector
            periodo={filtros.periodo ?? '30d'}
            dataInicio={filtros.dataInicio}
            dataFim={filtros.dataFim}
          />
        </div>
      </div>

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
    </div>
  );
}
