import { describe, expect, it } from 'vitest';
import { gerarCsv, nomeDoArquivo, type ColunaCsv } from '@/lib/csv';

interface Linha {
  nome: string;
  contatos: number;
  taxa: number;
}

const COLUNAS: ColunaCsv<Linha>[] = [
  { cabecalho: 'Loja', valor: (l) => l.nome },
  { cabecalho: 'Contatos', valor: (l) => l.contatos },
  { cabecalho: 'Conversao (%)', valor: (l) => l.taxa },
];

/** Descarta o BOM para as asseveracoes lerem so o conteudo. */
function semBom(csv: string): string {
  return csv.replace(/^﻿/, '');
}

describe('gerarCsv', () => {
  it('abre com BOM para o Excel ler os acentos', () => {
    const csv = gerarCsv(COLUNAS, []);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('separa por ponto e virgula, que e o que o Excel pt-BR espera', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja 1', contatos: 10, taxa: 50 }]));
    const [cabecalho, primeira] = csv.trim().split('\r\n');

    expect(cabecalho).toBe('Loja;Contatos;Conversao (%)');
    expect(primeira).toBe('Loja 1;10;50');
  });

  it('usa virgula como separador decimal', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja 1', contatos: 10, taxa: 33.75 }]));
    expect(csv).toContain('33,75');
    expect(csv).not.toContain('33.75');
  });

  it('termina as linhas com CRLF', () => {
    const csv = gerarCsv(COLUNAS, [{ nome: 'Loja 1', contatos: 1, taxa: 1 }]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3); // cabecalho, linha, vazio final
  });

  it('envolve em aspas o campo que contem o separador', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja 1; Filial', contatos: 1, taxa: 1 }]));
    expect(csv).toContain('"Loja 1; Filial"');
  });

  it('duplica aspas internas, como manda a especificacao', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja "Centro"', contatos: 1, taxa: 1 }]));
    expect(csv).toContain('"Loja ""Centro"""');
  });

  it('preserva quebra de linha dentro do campo, entre aspas', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja\nCentro', contatos: 1, taxa: 1 }]));
    expect(csv).toContain('"Loja\nCentro"');
  });

  /**
   * Injecao de formula: o Excel EXECUTA celula iniciada por = + - @ ao abrir
   * o arquivo. Como o nome do cliente vem de entrada do usuario, sem esta
   * protecao um cadastro malicioso viraria codigo rodando na maquina de quem
   * abrisse o relatorio.
   */
  it('neutraliza formula do Excel', () => {
    for (const perigoso of ['=1+1', '+SOMA(A1)', '-2+3', '@SUM(A1)']) {
      const csv = semBom(gerarCsv(COLUNAS, [{ nome: perigoso, contatos: 1, taxa: 1 }]));
      expect(csv).toContain(`'${perigoso}`);
    }
  });

  it('nao mexe em nome que apenas contem sinal no meio', () => {
    const csv = semBom(gerarCsv(COLUNAS, [{ nome: 'Loja A+B', contatos: 1, taxa: 1 }]));
    expect(csv).toContain('Loja A+B');
    expect(csv).not.toContain("'Loja A+B");
  });

  it('trata nulo e indefinido como celula vazia', () => {
    const colunas: ColunaCsv<{ a: null; b: undefined }>[] = [
      { cabecalho: 'A', valor: (l) => l.a },
      { cabecalho: 'B', valor: (l) => l.b },
    ];
    const csv = semBom(gerarCsv(colunas, [{ a: null, b: undefined }]));
    expect(csv.trim().split('\r\n')[1]).toBe(';');
  });
});

describe('nomeDoArquivo', () => {
  it('carrega o periodo no nome, para nao virar "relatorio (3).csv"', () => {
    expect(nomeDoArquivo('lojas', '2026-08-01', '2026-08-20')).toBe('lojas_2026-08-01_a_2026-08-20.csv');
  });
});
