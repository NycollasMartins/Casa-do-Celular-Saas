import type { AgendamentoStatus } from '@/lib/types/database';
import type { FiltroMetricas, Periodo } from '@/lib/types/metricas';
import { ehDataIso } from '@/lib/semana';

export type ParametrosBusca = { [chave: string]: string | string[] | undefined };

const PERIODOS: Periodo[] = ['7d', '30d', '90d', 'personalizado'];

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Data em AAAA-MM-DD que existe de verdade no calendario.
 *
 * O valor vem da query string, entao chega como o usuario — ou um link
 * quebrado — quiser. Sem esta checagem, `?inicio=abc` ia direto para o
 * `gte` da consulta e derrubava a pagina; `?inicio=2026-02-31` passaria no
 * formato e falharia no banco.
 */
function dataValida(valor: string | undefined): string | undefined {
  return ehDataIso(valor) ? valor : undefined;
}

/** Traduz a query string do dashboard em filtros de consulta. */
export function lerFiltros(searchParams: ParametrosBusca): FiltroMetricas & { status?: AgendamentoStatus[] } {
  const periodoBruto = primeiro(searchParams.periodo) as Periodo | undefined;
  const periodo = periodoBruto && PERIODOS.includes(periodoBruto) ? periodoBruto : '30d';
  const status = primeiro(searchParams.status) as AgendamentoStatus | undefined;

  const dataInicio = dataValida(primeiro(searchParams.inicio));
  const dataFim = dataValida(primeiro(searchParams.fim));

  // Intervalo invertido devolveria lista vazia sem explicar por que. Cair
  // no periodo padrao mostra dado e deixa o usuario corrigir o filtro.
  const intervaloCoerente = dataInicio && dataFim && dataInicio <= dataFim;

  return {
    lojaId: primeiro(searchParams.loja),
    // Sem par de datas valido, 'personalizado' nao tem o que significar.
    periodo: periodo === 'personalizado' && !intervaloCoerente ? '30d' : periodo,
    dataInicio: intervaloCoerente ? dataInicio : undefined,
    dataFim: intervaloCoerente ? dataFim : undefined,
    status: status ? [status] : undefined,
  };
}
