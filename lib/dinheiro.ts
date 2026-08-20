/**
 * Valores monetarios em portugues do Brasil.
 *
 * O usuario digita "1.234,56": ponto de milhar e virgula decimal. Passar
 * isso direto para `Number` devolve NaN, e um `replace(',', '.')` ingenuo
 * transforma "1.234,56" em "1.234.56", que tambem e NaN. Pior: "1.234"
 * viraria 1,234 em vez de 1234 — um erro de mil vezes, silencioso, em
 * campo de dinheiro.
 */

/**
 * Interpreta o que o usuario digitou como valor em reais.
 * Devolve null quando nao ha numero valido — nunca NaN, para o chamador
 * nao precisar lembrar de checar.
 */
export function lerValorBrl(entrada: string): number | null {
  const texto = entrada.trim().replace(/^R\$\s*/i, '');
  if (!texto) return null;

  // Aceita apenas digitos, ponto, virgula e sinal negativo.
  if (!/^-?[\d.,]+$/.test(texto)) return null;

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  let normalizado: string;

  if (temVirgula && temPonto) {
    // Formato completo pt-BR: ponto e milhar, virgula e decimal.
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    // So virgula: e o separador decimal.
    normalizado = texto.replace(',', '.');
  } else if (temPonto) {
    // So ponto: ambiguo. "1.234" e mil duzentos e trinta e quatro em pt-BR,
    // mas "1.5" quase certamente e um e meio digitado em formato ingles.
    // O criterio: exatamente tres digitos depois do ponto, e sem outro
    // ponto antes, indica milhar.
    const partes = texto.split('.');
    const ultima = partes[partes.length - 1];
    normalizado = ultima.length === 3 ? texto.replace(/\./g, '') : texto;
  } else {
    normalizado = texto;
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;

  // Centavos: o banco guarda numeric(12,2) e arredondaria de todo jeito.
  return Math.round(numero * 100) / 100;
}

/** Formata para exibicao: R$ 1.234,56 */
export function formatarBrl(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/** Ticket medio, protegido contra divisao por zero. */
export function ticketMedio(receita: number, quantidade: number): number {
  if (quantidade <= 0) return 0;
  return Math.round((receita / quantidade) * 100) / 100;
}
