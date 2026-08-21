import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL } from '@/lib/utils';
import { ticketMedio } from '@/lib/dinheiro';
import { competenciaDe, fimDaCompetencia } from '@/lib/metas';
import { FUSO_LOJA } from '@/lib/semana';
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
/**
 * Janela de datas do filtro, no fuso das lojas.
 *
 * `data_agendamento` e um `date` sem fuso, preenchido no horario de
 * Brasilia. O servidor da Vercel e da Netlify roda em UTC — as 22h de
 * Brasilia, o UTC ja virou o dia. Calcular "hoje" por UTC fazia a janela de
 * 30 dias escorregar: as 22h ela virava 23/07 a 21/08 em vez de 22/07 a
 * 20/08, descartando um dia real de dados e incluindo um que ainda nao
 * aconteceu. O mesmo usuario via totais diferentes as 20h e as 22h.
 */
export function resolverIntervalo(
  filtros: FiltroMetricas,
  agora = new Date()
): { inicio: string; fim: string } {
  if (filtros.periodo === 'personalizado' && filtros.dataInicio && filtros.dataFim) {
    return { inicio: filtros.dataInicio, fim: filtros.dataFim };
  }

  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_LOJA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);

  const dias = DIAS_POR_PERIODO[(filtros.periodo as '7d' | '30d' | '90d') ?? '30d'] ?? 30;

  // Meio-dia UTC evita que subtrair dias cruze fronteira de fuso.
  const base = new Date(`${hoje}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - (dias - 1));

  return { inicio: base.toISOString().slice(0, 10), fim: hoje };
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
const TAMANHO_PAGINA = 1000;

/**
 * Teto de seguranca da leitura completa. Acima disso, agregar no banco
 * deixa de ser otimizacao e vira necessidade — carregar centenas de
 * milhares de linhas para somar quatro numeros derrubaria a pagina.
 *
 * Estourar o teto levanta erro de proposito. A alternativa seria devolver
 * um recorte, que e como o defeito abaixo existia: numero errado sem aviso.
 */
const TETO_LEITURA = 50_000;

export async function buscarAgendamentos(
  filtros: FiltroAgendamentos = {}
): Promise<AgendamentoComRelacoes[]> {
  const supabase = createClient();
  const { inicio, fim } = resolverIntervalo(filtros);

  function montarConsulta() {
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
      // Desempate estavel: sem ele, duas linhas da mesma data podem trocar
      // de pagina entre requisicoes e aparecer duas vezes ou nenhuma.
      .order('id', { ascending: false });

    if (filtros.lojaId) query = query.eq('loja_id', filtros.lojaId);
    if (filtros.agendadorId) query = query.eq('agendador_id', filtros.agendadorId);
    if (filtros.status?.length) query = query.in('status', filtros.status);
    if (filtros.busca) {
      // O termo vai para dentro de uma expressao do PostgREST, onde virgula
      // separa condicoes e ponto separa coluna de operador. Interpolar cru
      // deixava o texto do usuario acrescentar condicoes a consulta —
      // buscar por "a,cliente_cpf.eq.529.982.247-25" viraria um filtro que
      // ninguem escreveu. Aspas delimitam o valor; a barra invertida e as
      // proprias aspas precisam ser escapadas antes.
      const termo = filtros.busca.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(
        `cliente_nome.ilike."%${termo}%",cliente_telefone.ilike."%${termo}%"`
      );
    }
    return query;
  }

  // Com `limite`, le so o pedido — e o caso da tabela, que pagina no
  // cliente. Sem `limite`, le TUDO, paginando.
  //
  // DEFEITO QUE ISTO CORRIGE
  // As metricas pediam `limite: 10_000` e o `.limit()` cortava em silencio.
  // Com 18 agendadores a 10 atendimentos por dia, o filtro de 90 dias passa
  // de 16 mil registros: o dashboard mostraria a conta de 10 mil deles, sem
  // nenhum sinal de que faltava dado. Numero errado que parece certo e pior
  // que erro visivel.
  if (filtros.limite !== undefined) {
    const { data, error } = await montarConsulta().limit(filtros.limite);
    if (error) throw new Error(`Nao foi possivel carregar os agendamentos: ${error.message}`);
    return (data ?? []) as unknown as AgendamentoComRelacoes[];
  }

  const linhas: unknown[] = [];

  for (let inicioPagina = 0; ; inicioPagina += TAMANHO_PAGINA) {
    const { data, error } = await montarConsulta().range(
      inicioPagina,
      inicioPagina + TAMANHO_PAGINA - 1
    );

    if (error) throw new Error(`Nao foi possivel carregar os agendamentos: ${error.message}`);

    const pagina = data ?? [];
    linhas.push(...pagina);

    if (pagina.length < TAMANHO_PAGINA) break;

    if (linhas.length >= TETO_LEITURA) {
      throw new Error(
        `O periodo selecionado tem mais de ${TETO_LEITURA.toLocaleString('pt-BR')} atendimentos. ` +
          'Escolha um intervalo menor ou filtre por loja.'
      );
    }
  }

  return linhas as AgendamentoComRelacoes[];
}

/* ------------------------------------------------------------------ */
/* Agregacoes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Quem chegou a ter visita marcada — o segundo degrau do funil.
 *
 * `nao_compareceu` PRECISA estar aqui: a pessoa marcou, e o fato de nao ter
 * ido nao desfaz o agendamento. Sem ela, quem faltou sumia do numerador e do
 * denominador da taxa de comparecimento, que virava cega justamente ao
 * numero que o sistema existe para combater — com 10 comparecimentos e 90
 * faltas, a tela exibia 100%.
 */
const STATUS_AGENDADOS: AgendamentoStatus[] = ['agendado', 'compareceu', 'nao_compareceu'];

/** Visitas cujo desfecho ja se sabe. Quem ainda vai acontecer nao entra. */
const STATUS_CONCLUIDOS: AgendamentoStatus[] = ['compareceu', 'nao_compareceu'];

/** Proximo dia em AAAA-MM-DD, sem passar por fuso nenhum. */
function proximoDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function agruparPorDia(
  registros: Pick<Agendamento, 'data_agendamento' | 'status'>[],
  inicio: string,
  fim: string
): PontoDiario[] {
  const mapa = new Map<string, PontoDiario>();

  // Preenche todos os dias do intervalo para o grafico nao ter buracos.
  //
  // A serie e montada com aritmetica de STRING, nao somando 86.400.000 ms a
  // um Date local. Somar milissegundos atravessando o inicio ou o fim do
  // horario de verao desloca a hora local e faz `format` repetir ou pular um
  // dia. Nem Brasilia nem UTC tem horario de verao hoje, entao a versao
  // anterior funcionava — por coincidencia, e so ate alguem rodar isto numa
  // maquina em outro fuso.
  for (let dia = inicio; dia <= fim; dia = proximoDia(dia)) {
    const [, mes, diaDoMes] = dia.split('-');
    mapa.set(dia, {
      data: dia,
      label: `${diaDoMes}/${mes}`,
      contatos: 0,
      agendados: 0,
      compareceram: 0,
    });

    // Guarda contra intervalo absurdo vindo da query string: sem ela, um
    // `?inicio=1900-01-01` montaria uma serie de 45 mil pontos.
    if (mapa.size >= 1000) break;
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

export function agruparPorAgendador(registros: AgendamentoComRelacoes[]): DesempenhoAgendador[] {
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

export function distribuirStatus(registros: Pick<Agendamento, 'status'>[]): FatiaStatus[] {
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
/**
 * Agrega os numeros a partir de dados JA LIDOS.
 *
 * Separada da leitura de proposito. Alem de permitir teste sem banco — esta
 * e a conta que o produto inteiro existe para fazer —, e o que evita ler o
 * mesmo periodo duas vezes: `desempenhoNaCompetencia` precisava das metricas
 * E dos registros crus, e antes chamava as duas funcoes, cada uma com sua
 * propria leitura completa.
 */
export function agregarMetricas(
  registros: AgendamentoComRelacoes[],
  vendas: Map<string, number>,
  inicio: string,
  fim: string
): ResumoMetricas {
  const totalContatos = registros.length;
  const totalAgendados = registros.filter((r) => STATUS_AGENDADOS.includes(r.status)).length;
  const totalCompareceram = registros.filter((r) => r.status === 'compareceu').length;

  const taxaConversao = totalContatos > 0 ? (totalAgendados / totalContatos) * 100 : 0;

  // Denominador e a visita com desfecho conhecido, nao toda visita marcada.
  // Incluir o que ainda vai acontecer diluiria a taxa e faria o numero cair
  // sozinho toda vez que alguem agendasse para a semana seguinte.
  const totalConcluidos = registros.filter((r) => STATUS_CONCLUIDOS.includes(r.status)).length;
  const taxaComparecimento = totalConcluidos > 0 ? (totalCompareceram / totalConcluidos) * 100 : 0;

  // Soma so as vendas dos registros recebidos: o mapa pode trazer chave de
  // agendamento fora do recorte se o chamador reaproveitar a leitura.
  let receita = 0;
  let totalVendas = 0;
  for (const registro of registros) {
    const valor = vendas.get(registro.id);
    if (valor === undefined) continue;
    receita += valor;
    totalVendas++;
  }

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

export async function calcularMetricas(filtros: FiltroMetricas = {}): Promise<ResumoMetricas> {
  const { inicio, fim } = resolverIntervalo(filtros);
  const registros = await buscarAgendamentos(filtros);
  const vendas = await buscarVendasDosAgendamentos(registros.map((r) => r.id));

  return agregarMetricas(registros, vendas, inicio, fim);
}

/**
 * Agrega por loja a partir de dados JA LIDOS. Pura, pelo mesmo motivo de
 * `agregarMetricas`: e o numero que o franqueado leva para a reuniao, e o
 * que nao e testavel acaba nao sendo verificado.
 */
export function agregarPorLoja(registros: AgendamentoComRelacoes[], vendas: Map<string, number>) {
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

export async function calcularMetricasPorLoja(filtros: FiltroMetricas = {}) {
  const registros = await buscarAgendamentos(filtros);
  const vendas = await buscarVendasDosAgendamentos(registros.map((r) => r.id));
  return agregarPorLoja(registros, vendas);
}



/**
 * Realizado de cada agendador na competencia, para confrontar com a meta.
 *
 * Usa o intervalo fechado do mes em vez do filtro de periodo da tela: meta
 * e mensal, e comparar 7 dias com um alvo de 30 daria um numero enganoso.
 */
export async function desempenhoNaCompetencia(competencia: string) {
  const intervalo = {
    periodo: 'personalizado' as const,
    dataInicio: competencia,
    dataFim: fimDaCompetencia(competencia),
  };

  // UMA leitura. A versao anterior chamava calcularMetricas e
  // buscarAgendamentos, cada uma varrendo o mesmo periodo por completo — o
  // dobro do custo, e o dobro de novo nas vendas.
  const registros = await buscarAgendamentos(intervalo);
  const vendas = await buscarVendasDosAgendamentos(registros.map((r) => r.id));
  const metricas = agregarMetricas(registros, vendas, competencia, fimDaCompetencia(competencia));

  // As vendas sao atribuidas ao agendador do ATENDIMENTO, nao a quem lancou:
  // quem trouxe o cliente e que fez o resultado.
  const porAgendador = new Map<string, { vendas: number; receita: number }>();
  for (const registro of registros) {
    const valor = vendas.get(registro.id);
    if (valor === undefined) continue;

    const atual = porAgendador.get(registro.agendador_id) ?? { vendas: 0, receita: 0 };
    atual.vendas++;
    atual.receita += valor;
    porAgendador.set(registro.agendador_id, atual);
  }

  return metricas.dadosPorAgendador.map((linha) => {
    const venda = porAgendador.get(linha.agendadorId) ?? { vendas: 0, receita: 0 };
    return {
      agendadorId: linha.agendadorId,
      nome: linha.nome,
      agendamentos: linha.agendados,
      taxaConversao: linha.taxaConversao,
      vendas: venda.vendas,
      receita: Math.round(venda.receita * 100) / 100,
    };
  });
}


/**
 * Meta e realizado do proprio usuario na competencia corrente.
 *
 * Sempre pelo cliente normal, sob RLS: `metas_select` ja garante que cada um
 * so alcanca a propria meta, e repetir a regra aqui criaria uma segunda
 * fonte de verdade que pode divergir da primeira.
 */
export async function minhaMetaDoMes(usuarioId: string) {
  const competencia = competenciaDe();
  const supabase = createClient();

  const { data: meta } = await supabase
    .from('metas')
    .select('meta_agendamentos, meta_taxa_conversao, meta_vendas, meta_receita')
    .eq('usuario_id', usuarioId)
    .eq('competencia', competencia)
    .maybeSingle();

  if (!meta) return null;

  // Reaproveita `desempenhoNaCompetencia` em vez de somar aqui: e o mesmo
  // calculo que a tela de Metas mostra ao gestor, e duas contas paralelas
  // acabariam divergindo. O custo extra e aceitavel porque o agendador
  // enxerga uma loja so — e o bloco fica em Suspense proprio no dashboard.
  const desempenho = await desempenhoNaCompetencia(competencia);
  const meu = desempenho.find((linha) => linha.agendadorId === usuarioId);

  return {
    competencia,
    meta: {
      meta_agendamentos: meta.meta_agendamentos,
      meta_taxa_conversao: meta.meta_taxa_conversao === null ? null : Number(meta.meta_taxa_conversao),
      meta_vendas: meta.meta_vendas,
      meta_receita: meta.meta_receita === null ? null : Number(meta.meta_receita),
    },
    // Sem movimento no mes o desempenho nao traz linha para a pessoa; zerar
    // e o certo, senao a meta desapareceria justamente de quem nao comecou.
    realizado: {
      agendamentos: meu?.agendamentos ?? 0,
      taxaConversao: meu?.taxaConversao ?? 0,
      vendas: meu?.vendas ?? 0,
      receita: meu?.receita ?? 0,
    },
  };
}

/**
 * Agendadores com lotacao ATIVA no escopo do usuario.
 *
 * Diferente de `buscarAgendadoresDoUsuario`, que serve ao filtro da tabela e
 * lista quem aparece nos agendamentos: aqui interessa quem pode RECEBER
 * meta. A policy `metas_write` exige lotacao ativa, entao listar alguem sem
 * ela levaria a um erro de RLS que o gestor nao teria como interpretar.
 */
export async function buscarAgendadoresAtivos(): Promise<Pick<Usuario, 'id' | 'nome'>[]> {
  const supabase = createClient();

  // Duas consultas em vez de join embutido: o tipo Database declara
  // `Relationships: []`, entao o join do PostgREST nao chega tipado e
  // exigiria `as unknown as` — que esconderia erro de shape em vez de pegar.
  const { data: vinculos, error: erroVinculos } = await supabase
    .from('agendadores_lojas')
    .select('usuario_id')
    .is('data_fim', null);

  if (erroVinculos) {
    throw new Error(`Nao foi possivel carregar as lotacoes: ${erroVinculos.message}`);
  }

  const ids = Array.from(new Set((vinculos ?? []).map((linha) => linha.usuario_id)));
  if (ids.length === 0) return [];

  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('id, nome')
    .in('id', ids)
    .eq('status', 'ativo')
    .order('nome');

  if (error) throw new Error(`Nao foi possivel carregar os agendadores: ${error.message}`);
  return usuarios ?? [];
}
