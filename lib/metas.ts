/**
 * Metas mensais por agendador.
 *
 * O sistema ja media o desempenho; faltava o outro lado da conta. "42
 * agendamentos no mes" nao diz se foi bom ou ruim — e o franqueado precisa
 * saber quem esta abaixo ANTES do fim do mes, nao depois.
 */

import { hojeNaLoja } from '@/lib/semana';

export type SituacaoMeta = 'sem_meta' | 'abaixo' | 'atencao' | 'no_alvo';

export interface Meta {
  meta_agendamentos: number | null;
  meta_taxa_conversao: number | null;
  meta_vendas: number | null;
  meta_receita: number | null;
}

export interface Realizado {
  agendamentos: number;
  taxaConversao: number;
  vendas: number;
  receita: number;
}

export interface Atingimento {
  chave: 'agendamentos' | 'taxaConversao' | 'vendas' | 'receita';
  rotulo: string;
  meta: number;
  realizado: number;
  /** Percentual do alvo alcancado. Pode passar de 100. */
  percentual: number;
  situacao: Exclude<SituacaoMeta, 'sem_meta'>;
}

const ROTULOS: Record<Atingimento['chave'], string> = {
  agendamentos: 'Agendamentos',
  taxaConversao: 'Taxa de conversao',
  vendas: 'Vendas',
  receita: 'Faturamento',
};

/**
 * Fracao do mes ja decorrida, entre 0 e 1.
 *
 * E o que torna a meta util durante o mes em vez de so no fim. No dia 10 de
 * um mes de 30 dias, quem fez 33% do alvo esta EM DIA, nao com 33% de
 * atraso. Comparar o realizado parcial com a meta cheia acusaria todo mundo
 * de atrasado ate o ultimo dia.
 */
export function fracaoDoMesDecorrida(competencia: string, hoje = new Date()): number {
  const [ano, mes] = competencia.slice(0, 7).split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  // Fuso das lojas, nao UTC: as 22h de 31/08 o UTC ja e setembro, e a meta
  // de agosto seria cobrada pelo alvo cheio uma noite antes da hora.
  const [anoHoje, mesHoje, diaHoje] = hojeNaLoja(hoje).split('-').map(Number);

  // Mes ja fechado: cobranca e sobre o alvo cheio.
  if (anoHoje > ano || (anoHoje === ano && mesHoje > mes)) return 1;
  // Mes ainda nao comecou: nada a cobrar.
  if (anoHoje < ano || (anoHoje === ano && mesHoje < mes)) return 0;

  return diaHoje / diasNoMes;
}

/**
 * Classifica o andamento comparando com o ESPERADO ATE AQUI, nao com o alvo
 * cheio. As faixas sao deliberadamente tolerantes no comeco do mes, quando
 * poucos dias de variacao distorcem muito o ritmo.
 */
export function classificar(percentualDoEsperado: number): Exclude<SituacaoMeta, 'sem_meta'> {
  if (percentualDoEsperado >= 95) return 'no_alvo';
  if (percentualDoEsperado >= 80) return 'atencao';
  return 'abaixo';
}

/** Percentual com uma casa, protegido contra divisao por zero. */
function percentual(realizado: number, alvo: number): number {
  if (alvo <= 0) return 0;
  return Number(((realizado / alvo) * 100).toFixed(1));
}

export function calcularAtingimento(
  meta: Meta,
  realizado: Realizado,
  competencia: string,
  hoje = new Date()
): Atingimento[] {
  const fracao = fracaoDoMesDecorrida(competencia, hoje);
  const itens: Atingimento[] = [];

  function adicionar(chave: Atingimento['chave'], alvo: number | null, feito: number, proporcional: boolean) {
    if (alvo === null || alvo <= 0) return;

    // Taxa de conversao nao se acumula ao longo do mes: 60% no dia 5 ja e
    // 60%. Proporcionalizar o alvo dela nao faria sentido.
    const esperadoAteAqui = proporcional ? alvo * fracao : alvo;

    itens.push({
      chave,
      rotulo: ROTULOS[chave],
      meta: alvo,
      realizado: feito,
      percentual: percentual(feito, alvo),
      situacao:
        esperadoAteAqui <= 0 ? 'no_alvo' : classificar(percentual(feito, esperadoAteAqui)),
    });
  }

  adicionar('agendamentos', meta.meta_agendamentos, realizado.agendamentos, true);
  adicionar('taxaConversao', meta.meta_taxa_conversao, realizado.taxaConversao, false);
  adicionar('vendas', meta.meta_vendas, realizado.vendas, true);
  adicionar('receita', meta.meta_receita, realizado.receita, true);

  return itens;
}

/** A pior situacao entre os alvos: e ela que o franqueado precisa ver na lista. */
export function situacaoGeral(itens: Atingimento[]): SituacaoMeta {
  if (itens.length === 0) return 'sem_meta';
  if (itens.some((item) => item.situacao === 'abaixo')) return 'abaixo';
  if (itens.some((item) => item.situacao === 'atencao')) return 'atencao';
  return 'no_alvo';
}

export const ROTULO_SITUACAO: Record<SituacaoMeta, string> = {
  sem_meta: 'Sem meta',
  abaixo: 'Abaixo',
  atencao: 'Atencao',
  no_alvo: 'No alvo',
};

/**
 * Primeiro dia do mes, no fuso das lojas.
 *
 * Usava getUTCMonth: em 31/08 as 22h de Brasilia o UTC ja e 01/09, e a tela
 * de Metas abriria a competencia de setembro na ultima noite de agosto —
 * justamente quando o gestor confere o fechamento do mes.
 */
export function competenciaDe(data = new Date()): string {
  return `${hojeNaLoja(data).slice(0, 7)}-01`;
}

/** Ultimo dia do mes da competencia, para fechar o intervalo de consulta. */
export function fimDaCompetencia(competencia: string): string {
  const [ano, mes] = competencia.slice(0, 7).split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${competencia.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`;
}
