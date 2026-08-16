import { LojaSelector } from '@/components/dashboard/loja-selector';
import { PeriodoSelector } from '@/components/dashboard/periodo-selector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { exigirRole } from '@/lib/auth/session';
import { buscarLojasDoUsuario, calcularMetricas, calcularMetricasPorLoja } from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { formatarNumero, formatarPercentual } from '@/lib/utils';

export const metadata = { title: 'Relatorios · Casa do Celular' };

export default async function RelatoriosPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const usuario = await exigirRole(['super_admin', 'franqueado', 'diretor']);
  const filtros = lerFiltros(searchParams);

  const [lojas, porLoja, metricas] = await Promise.all([
    buscarLojasDoUsuario(),
    calcularMetricasPorLoja(filtros),
    calcularMetricas(filtros),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Relatorios</h1>
          <p className="mt-1 text-sm text-slate-500">Comparativo por loja e por agendador no periodo.</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Desempenho por loja</CardTitle>
          <CardDescription>Ordenado pelo volume de contatos</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Agendados</TableHead>
                <TableHead>Compareceram</TableHead>
                <TableHead>Conversao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porLoja.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                    Sem dados no periodo.
                  </TableCell>
                </TableRow>
              ) : (
                porLoja.map((linha) => (
                  <TableRow key={linha.lojaId}>
                    <TableCell className="font-medium">{linha.nome}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.contatos)}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.agendados)}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.compareceram)}</TableCell>
                    <TableCell>
                      <Badge variant={linha.taxaConversao >= 50 ? 'success' : 'neutral'}>
                        {formatarPercentual(linha.taxaConversao)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de agendadores</CardTitle>
          <CardDescription>Conversao de contato em visita agendada</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Agendador</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Agendados</TableHead>
                <TableHead>Compareceram</TableHead>
                <TableHead>Conversao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metricas.dadosPorAgendador.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Sem dados no periodo.
                  </TableCell>
                </TableRow>
              ) : (
                metricas.dadosPorAgendador.map((linha, indice) => (
                  <TableRow key={linha.agendadorId}>
                    <TableCell className="tabular-nums text-slate-400">{indice + 1}</TableCell>
                    <TableCell className="font-medium">{linha.nome}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.contatos)}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.agendados)}</TableCell>
                    <TableCell className="tabular-nums">{formatarNumero(linha.compareceram)}</TableCell>
                    <TableCell>
                      <Badge variant={linha.taxaConversao >= 50 ? 'success' : 'neutral'}>
                        {formatarPercentual(linha.taxaConversao)}
                      </Badge>
                    </TableCell>
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
