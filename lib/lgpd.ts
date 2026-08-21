/**
 * Anonimizacao de dados pessoais (LGPD).
 *
 * O titular pode pedir a eliminacao dos seus dados (art. 18, VI). Apagar a
 * linha do agendamento nao serve: ela e o fato que o sistema mede, e some
 * do historico da loja e do agendador. O art. 12 resolve — dado anonimizado
 * deixa de ser dado pessoal. Entao limpamos o que identifica a pessoa e
 * preservamos loja, agendador, data e status, que nao identificam ninguem.
 *
 * Os marcadores sao FIXOS e iguais para todos. Um marcador que variasse por
 * pessoa (um hash do CPF, por exemplo) permitiria reidentificar por
 * comparacao e nao seria anonimizacao de verdade — seria pseudonimizacao,
 * que a LGPD trata como dado pessoal.
 */

import { hojeNaLoja } from '@/lib/semana';

export const MARCADOR = {
  nome: 'Cliente anonimizado',
  cpf: '000.000.000-00',
  telefone: '(00) 00000-0000',
} as const;

export interface CamposAnonimizados {
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
  cliente_email: null;
  observacoes: null;
  anonimizado_em: string;
}

/**
 * `observacoes` tambem e limpo: e campo livre, onde na pratica acabam
 * anotacoes como "irma da Dona Maria, mora na quadra 12" — dado pessoal
 * que escaparia se olhassemos so para as colunas com nome de cliente.
 */
export function camposAnonimizados(agora = new Date()): CamposAnonimizados {
  return {
    cliente_nome: MARCADOR.nome,
    cliente_cpf: MARCADOR.cpf,
    cliente_telefone: MARCADOR.telefone,
    cliente_email: null,
    observacoes: null,
    anonimizado_em: agora.toISOString(),
  };
}

export function estaAnonimizado(agendamento: { anonimizado_em: string | null }): boolean {
  return agendamento.anonimizado_em !== null;
}

/** Normaliza CPF para busca: o banco guarda com mascara, o usuario digita como quiser. */
export function normalizarCpfParaBusca(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 11) return null;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

/**
 * Politica de retencao padrao. Vinte e quatro meses cobrem o ciclo de
 * analise de desempenho que o sistema serve; passado isso, o dado pessoal
 * nao tem mais finalidade e o art. 15, I manda eliminar.
 *
 * O numero e uma sugestao tecnica, nao uma definicao juridica — cabe ao
 * controlador confirmar com base na finalidade declarada.
 */
export const MESES_RETENCAO_PADRAO = 24;

/**
 * Subtrai meses grudando no ultimo dia quando o mes de destino e mais curto,
 * como o Postgres faz com `make_interval`.
 *
 * `setMonth` do JavaScript NAO faz isso — ele transborda:
 *
 *   2026-03-31 menos 1 mes -> 2026-03-03   (continua em marco)
 *   2026-05-31 menos 1 mes -> 2026-05-01   (continua em maio)
 *
 * A funcao de retencao no banco usa a aritmetica do Postgres. Com a do
 * JavaScript, num dia 31 a tela de Privacidade contava os vencidos por uma
 * data quase um mes diferente da que o script usa para anonimizar — e podia
 * exibir zero vencidos havendo muitos.
 */
export function subtrairMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);

  const totalMeses = ano * 12 + (mes - 1) - meses;
  const novoAno = Math.floor(totalMeses / 12);
  const novoMes = ((totalMeses % 12) + 12) % 12;

  // Dia 0 do mes seguinte e o ultimo dia do mes corrente.
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);

  const dois = (n: number) => String(n).padStart(2, '0');
  return `${novoAno}-${dois(novoMes + 1)}-${dois(diaFinal)}`;
}

export function dataLimiteRetencao(meses = MESES_RETENCAO_PADRAO, hoje = new Date()): string {
  return subtrairMeses(hojeNaLoja(hoje), meses);
}
