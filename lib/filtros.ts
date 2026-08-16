import type { AgendamentoStatus } from '@/lib/types/database';
import type { FiltroMetricas, Periodo } from '@/lib/types/metricas';

export type ParametrosBusca = { [chave: string]: string | string[] | undefined };

const PERIODOS: Periodo[] = ['7d', '30d', '90d', 'personalizado'];

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Traduz a query string do dashboard em filtros de consulta. */
export function lerFiltros(searchParams: ParametrosBusca): FiltroMetricas & { status?: AgendamentoStatus[] } {
  const periodoBruto = primeiro(searchParams.periodo) as Periodo | undefined;
  const periodo = periodoBruto && PERIODOS.includes(periodoBruto) ? periodoBruto : '30d';
  const status = primeiro(searchParams.status) as AgendamentoStatus | undefined;

  return {
    lojaId: primeiro(searchParams.loja),
    periodo,
    dataInicio: primeiro(searchParams.inicio),
    dataFim: primeiro(searchParams.fim),
    status: status ? [status] : undefined,
  };
}
