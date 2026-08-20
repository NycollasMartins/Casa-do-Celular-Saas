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

export function dataLimiteRetencao(meses = MESES_RETENCAO_PADRAO, hoje = new Date()): string {
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - meses);
  return limite.toISOString().slice(0, 10);
}
