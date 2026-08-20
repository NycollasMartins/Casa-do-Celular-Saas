/**
 * Geracao de CSV para abrir no Excel em portugues do Brasil.
 *
 * Tres decisoes que parecem detalhe e decidem se o arquivo abre certo:
 *
 * 1. SEPARADOR PONTO E VIRGULA. O Excel em pt-BR usa a virgula como
 *    separador decimal, entao interpreta arquivo separado por virgula como
 *    uma coluna so. Ponto e virgula e o que ele espera.
 * 2. BOM UTF-8. Sem os tres bytes iniciais, o Excel le como Latin-1 e
 *    "Conversao" vira "ConversÃ£o".
 * 3. CRLF. E o que a especificacao do CSV pede e o que o Excel no Windows
 *    espera; o Numbers e o Sheets aceitam os dois.
 */

const SEPARADOR = ';';
const BOM = '﻿';

/**
 * Neutraliza formula. Uma celula iniciada por = + - @ e executada pelo Excel
 * ao abrir o arquivo; como `cliente_nome` vem de entrada do usuario, um nome
 * como `=HYPERLINK(...)` viraria codigo rodando na maquina de quem abriu.
 * O apostrofo forca leitura como texto.
 */
function neutralizarFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function escapar(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  if (typeof valor === 'number') {
    // Decimal com virgula, como o Excel pt-BR espera.
    return String(valor).replace('.', ',');
  }

  const texto = neutralizarFormula(String(valor));

  // Aspas duplas quando houver separador, aspas ou quebra de linha.
  if (texto.includes(SEPARADOR) || texto.includes('"') || /[\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export interface ColunaCsv<T> {
  cabecalho: string;
  valor: (linha: T) => string | number | null | undefined;
}

export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((coluna) => escapar(coluna.cabecalho)).join(SEPARADOR);
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => escapar(coluna.valor(linha))).join(SEPARADOR)
  );

  return BOM + [cabecalho, ...corpo].join('\r\n') + '\r\n';
}

/** Nome de arquivo com o periodo, para o usuario nao acumular "relatorio (3).csv". */
export function nomeDoArquivo(prefixo: string, inicio: string, fim: string): string {
  return `${prefixo}_${inicio}_a_${fim}.csv`;
}
