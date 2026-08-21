import { MetricsCards } from '@/components/dashboard/metrics-cards';
import { ChartsContainer } from '@/components/dashboard/charts-container';
import { PeriodoSelector } from '@/components/dashboard/periodo-selector';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calcularMetricas, calcularMetricasPorLoja } from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { formatarNumero, formatarPercentual } from '@/lib/utils';
import { LinhaVazia } from '@/components/ui/linha-vazia';

export const metadata = { title: 'Metricas da rede · Admin' };

/** Visao consolidada de todos os franqueados (RLS libera tudo ao super admin). */
export default async function MetricasGeraisPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const filtros = lerFiltros(searchParams);
  const [metricas, porLoja] = await Promise.all([
    calcularMetricas(filtros),
    calcularMetricasPorLoja(filtros),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Metricas da rede</h1>
          <p className="mt-1 text-sm text-slate-500">Consolidado de todos os franqueados.</p>
        </div>
        <PeriodoSelector
          periodo={filtros.periodo ?? '30d'}
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
        />
      </div>

      <MetricsCards metricas={metricas} />
      <ChartsContainer metricas={metricas} />

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Agendados</TableHead>
                <TableHead>Conversao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porLoja.length === 0 ? (
                <LinhaVazia colunas={4}>
                  Nenhuma loja com movimento no periodo. Ajuste o intervalo ou confira se ha agendamentos.
                </LinhaVazia>
              ) : (
                porLoja.map((linha) => (
                  <TableRow key={linha.lojaId}>
                    <TableCell className="font-medium">{linha.nome}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.contatos)}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.agendados)}</TableCell>
                    <TableCell className="tabular-nums">{formatarPercentual(linha.taxaConversao)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
