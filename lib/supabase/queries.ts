import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL } from '@/lib/utils';
import { ticketMedio } from '@/lib/dinheiro';
import type {
  Agendamento,
  AgendamentoComRelacoes,
  AgendamentoStatus,
  Loja,
  Usuario,
} from '@/lib/types/database';
import type {
  DesempenhoAgendador,
  FatiaStatus,
  FiltroMetricas,
  Periodo,
  PontoDiario,
  ResumoMetricas,
} from '@/lib/types/metricas';

const DIAS_POR_PERIODO: Record<Exclude<Periodo, 'personalizado'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Converte o filtro de periodo em um intervalo de datas ISO (YYYY-MM-DD). */
export function resolverIntervalo(filtros: FiltroMetricas): { inicio: string; fim: string } {
  const hoje = new Date();

  if (filtros.periodo === 'personalizado' && filtros.dataInicio && filtros.dataFim) {
    return { inicio: filtros.dataInicio, fim: filtros.dataFim };
  }

  const dias = DIAS_POR_PERIODO[(filtros.periodo as '7d' | '30d' | '90d') ?? '30d'] ?? 30;
  return {
    inicio: format(subDays(hoje, dias - 1), 'yyyy-MM-dd'),
    fim: format(hoje, 'yyyy-MM-dd'),
  };
}

/**
 * Lojas visiveis para o usuario logado.
 * Nao ha filtro por franqueado/diretor aqui de proposito: o RLS
 * (funcao lojas_permitidas) ja restringe o resultado. Duplicar a regra
 * no cliente e a maneira mais facil de as duas versoes divergirem.
 */
export async function buscarLojasDoUsuario(): Promise<
  Pick<Loja, 'id' | 'nome' | 'codigo_loja' | 'cidade' | 'estado'>[]
> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('lojas')
    .select('id, nome, codigo_loja, cidade, estado')
    .eq('status', 'ativo')
    .order('nome', { ascending: true });

  if (error) throw new Error(`Nao foi possivel carregar as lojas: ${error.message}`);
  return data ?? [];
}

/** Agendadores visiveis (para popular o filtro da tabela). */
export async function buscarAgendadoresDoUsuario(): Promise<Pick<Usuario, 'id' | 'nome'>[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome')
    .eq('role', 'agendador')
    .order('nome', { ascending: true });

  if (error) throw new Error(`Nao foi possivel carregar os agendadores: ${error.message}`);
  return data ?? [];
}

interface FiltroAgendamentos extends FiltroMetricas {
  agendadorId?: string;
  status?: AgendamentoStatus[];
  busca?: string;
  limite?: number;
}

/** Lista de agendamentos com loja e agendador (um unico join, sem N+1). */
export async function buscarAgendamentos(
  filtros: FiltroAgendamentos = {}
): Promise<AgendamentoComRelacoes[]> {
  const supabase = createClient();
  const { inicio, fim } = resolverIntervalo(filtros);

  let query = supabase
    .from('agendamentos')
    .select(
      `*,
       loja:lojas!agendamentos_loja_id_fkey (id, nome, codigo_loja),
       agendador:usuarios!agendamentos_agendador_id_fkey (id, nome)`
    )
    .gte('data_agendamento', inicio)
    .lte('data_agendamento', fim)
    .order('data_agendamento', { ascending: false })
    .limit(filtros.limite ?? 1000);

  if (filtros.lojaId) query = query.eq('loja_id', filtros.lojaId);
  if (filtros.agendadorId) query = query.eq('agendador_id', filtros.agendadorId);
  if (filtros.status?.length) query = query.in('status', filtros.status);
  if (filtros.busca) {
    query = query.or(
      `cliente_nome.ilike.%${filtros.busca}%,cliente_telefone.ilike.%${filtros.busca}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`Nao foi possivel carregar os agendamentos: ${error.message}`);

  return (data ?? []) as unknown as AgendamentoComRelacoes[];
}

/* ------------------------------------------------------------------ */
/* Agregacoes                                                          */
/* ------------------------------------------------------------------ */

const STATUS_AGENDADOS: AgendamentoStatus[] = ['agendado', 'compareceu'];

function agruparPorDia(
  registros: Pick<Agendamento, 'data_agendamento' | 'status'>[],
  inicio: string,
  fim: string
): PontoDiario[] {
  const mapa = new Map<string, PontoDiario>();

  // Preenche todos os dias do intervalo para o grafico nao ter buracos.
  const dataFim = parseISO(fim);
  for (let d = parseISO(inicio); d <= dataFim; d = new Date(d.getTime() + 86_400_000)) {
    const chave = format(d, 'yyyy-MM-dd');
    mapa.set(chave, {
      data: chave,
      label: format(d, 'dd/MM', { locale: ptBR }),
      contatos: 0,
      agendados: 0,
      compareceram: 0,
    });
  }

  for (const registro of registros) {
    const ponto = mapa.get(registro.data_agendamento.slice(0, 10));
    if (!ponto) continue;
    ponto.contatos++;
    if (STATUS_AGENDADOS.includes(registro.status)) ponto.agendados++;
    if (registro.status === 'compareceu') ponto.compareceram++;
  }

  return Array.from(mapa.values());
}

function agruparPorAgendador(registros: AgendamentoComRelacoes[]): DesempenhoAgendador[] {
  const mapa = new Map<string, DesempenhoAgendador>();

  for (const registro of registros) {
    const id = registro.agendador_id;
    const atual = mapa.get(id) ?? {
      agendadorId: id,
      nome: registro.agendador?.nome ?? 'Sem nome',
      contatos: 0,
      agendados: 0,
      compareceram: 0,
      taxaConversao: 0,
    };

    atual.contatos++;
    if (STATUS_AGENDADOS.includes(registro.status)) atual.agendados++;
    if (registro.status === 'compareceu') atual.compareceram++;
    mapa.set(id, atual);
  }

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      taxaConversao: item.contatos > 0 ? Number(((item.agendados / item.contatos) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.taxaConversao - a.taxaConversao || b.agendados - a.agendados);
}

function distribuirStatus(registros: Pick<Agendamento, 'status'>[]): FatiaStatus[] {
  const contagem = new Map<AgendamentoStatus, number>();
  for (const registro of registros) {
    contagem.set(registro.status, (contagem.get(registro.status) ?? 0) + 1);
  }

  return (Object.keys(STATUS_LABEL) as AgendamentoStatus[])
    .map((status) => ({ status, label: STATUS_LABEL[status], total: contagem.get(status) ?? 0 }))
    .filter((fatia) => fatia.total > 0);
}

/**
 * Vendas dos agendamentos informados.
 *
 * Consulta separada de proposito: `buscarAgendamentos` ja e a leitura mais
 * pesada do sistema, e a maioria dos atendimentos nao tem venda. Um join
 * ali carregaria coluna nula na maior parte das linhas para alimentar
 * quatro numeros.
 *
 * O RLS de `vendas` deriva do agendamento, entao o escopo ja vem correto.
 */
async function buscarVendasDosAgendamentos(
  agendamentoIds: string[]
): Promise<Map<string, number>> {
  const porAgendamento = new Map<string, number>();
  if (agendamentoIds.length === 0) return porAgendamento;

  const supabase = createClient();

  // O `in` vai para a query string; lotes evitam estourar o limite de URL.
  const TAMANHO_LOTE = 200;
  for (let i = 0; i < agendamentoIds.length; i += TAMANHO_LOTE) {
    const lote = agendamentoIds.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await supabase
      .from('vendas')
      .select('agendamento_id, valor')
      .in('agendamento_id', lote);

    if (error) throw new Error(`Nao foi possivel carregar as vendas: ${error.message}`);

    for (const venda of data ?? []) {
      porAgendamento.set(venda.agendamento_id, Number(venda.valor));
    }
  }

  return porAgendamento;
}

/**
 * Metricas do dashboard.
 * Uma unica leitura alimenta os 4 cards e os 4 graficos: o volume por
 * franqueado (dezenas de milhares de linhas/mes) cabe em memoria e evita
 * seis roundtrips ao banco. Se o volume crescer, troque por uma view
 * materializada ou por RPC com agregacao no Postgres.
 */
export async function calcularMetricas(filtros: FiltroMetricas = {}): Promise<ResumoMetricas> {
  const { inicio, fim } = resolverIntervalo(filtros);
  const registros = await buscarAgendamentos({ ...filtros, limite: 10_000 });

  const totalContatos = registros.length;
  const totalAgendados = registros.filter((r) => STATUS_AGENDADOS.includes(r.status)).length;
  const totalCompareceram = registros.filter((r) => r.status === 'compareceu').length;

  const taxaConversao = totalContatos > 0 ? (totalAgendados / totalContatos) * 100 : 0;
  const taxaComparecimento = totalAgendados > 0 ? (totalCompareceram / totalAgendados) * 100 : 0;

  const vendas = await buscarVendasDosAgendamentos(registros.map((r) => r.id));
  const receita = Array.from(vendas.values()).reduce((soma, valor) => soma + valor, 0);
  const totalVendas = vendas.size;

  // Denominador e quem compareceu, nao quem foi contatado: fechamento mede
  // o desempenho da loja no balcao, nao a captacao do agendador.
  const taxaFechamento = totalCompareceram > 0 ? (totalVendas / totalCompareceram) * 100 : 0;

  return {
    totalContatos,
    totalAgendados,
    totalCompareceram,
    taxaConversao: Number(taxaConversao.toFixed(1)),
    taxaComparecimento: Number(taxaComparecimento.toFixed(1)),
    totalVendas,
    receita: Math.round(receita * 100) / 100,
    ticketMedio: ticketMedio(receita, totalVendas),
    taxaFechamento: Number(taxaFechamento.toFixed(1)),
    dadosDiarios: agruparPorDia(registros, inicio, fim),
    dadosPorAgendador: agruparPorAgendador(registros),
    distribuicaoStatus: distribuirStatus(registros),
  };
}

/** Metricas consolidadas por loja (usado em Relatorios e no super admin). */
export async function calcularMetricasPorLoja(filtros: FiltroMetricas = {}) {
  const registros = await buscarAgendamentos({ ...filtros, limite: 10_000 });
  const vendas = await buscarVendasDosAgendamentos(registros.map((r) => r.id));

  const mapa = new Map<
    string,
    {
      lojaId: string;
      nome: string;
      contatos: number;
      agendados: number;
      compareceram: number;
      vendas: number;
      receita: number;
    }
  >();

  for (const registro of registros) {
    const id = registro.loja_id;
    const atual = mapa.get(id) ?? {
      lojaId: id,
      nome: registro.loja?.nome ?? 'Loja',
      contatos: 0,
      agendados: 0,
      compareceram: 0,
      vendas: 0,
      receita: 0,
    };
    atual.contatos++;
    if (STATUS_AGENDADOS.includes(registro.status)) atual.agendados++;
    if (registro.status === 'compareceu') atual.compareceram++;

    const valor = vendas.get(registro.id);
    if (valor !== undefined) {
      atual.vendas++;
      atual.receita += valor;
    }

    mapa.set(id, atual);
  }

  return Array.from(mapa.values())
    .map((item) => ({
      ...item,
      receita: Math.round(item.receita * 100) / 100,
      ticketMedio: ticketMedio(item.receita, item.vendas),
      taxaConversao: item.contatos > 0 ? Number(((item.agendados / item.contatos) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.contatos - a.contatos);
}
