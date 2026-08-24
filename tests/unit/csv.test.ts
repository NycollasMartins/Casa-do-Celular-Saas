import { describe, expect, it } from 'vitest';
import { gerarCsv, nomeDoArquivo, type ColunaCsv } from '@/lib/csv';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

describe('nenhum CSV montado a mao', () => {
  /**
   * Havia DUAS geracoes de CSV no projeto. A da rota `/api/relatorios/export`
   * usa este modulo; a da tabela de agendamentos montava o arquivo na mao e
   * escapava apenas aspas.
   *
   * Aspas resolvem a ANALISE do arquivo, nao a avaliacao da formula: uma
   * celula que comeca com = + - ou @ e executada pelo Excel ao abrir, mesmo
   * entre aspas. E a exportacao da tabela leva `cliente_nome` e
   * `observacoes`, que sao digitados por quem atende.
   *
   * O teste procura quem cria um arquivo CSV sem passar por aqui.
   */
  const arquivos = execSync(
    "grep -rl \"text/csv\" app components lib --include='*.ts' --include='*.tsx' || true",
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  it('encontrou quem gera CSV', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  /**
   * Compara a QUANTIDADE de arquivos CSV criados com a de chamadas ao modulo.
   *
   * A primeira versao so exigia que `gerarCsv` aparecesse em algum lugar do
   * arquivo — uma segunda geracao montada a mao, ao lado da correta, passava
   * batido. E foi exatamente uma segunda geracao esquecida que executava
   * formula na maquina de quem abrisse a planilha.
   *
   * Tentei antes uma janela de linhas em volta, e ela acusou o codigo certo:
   * a lista de colunas e longa, e a chamada fica dezenas de linhas acima do
   * `new Blob`. Contar nao depende de distancia.
   */
  it.each(arquivos)('%s: um gerarCsv para cada CSV criado', (caminho) => {
    const fonte = readFileSync(caminho, 'utf8');

    const criados = (fonte.match(/text\/csv/g) ?? []).length;
    const pelaBiblioteca = (fonte.match(/gerarCsv[<(]/g) ?? []).length;

    expect(pelaBiblioteca).toBeGreaterThanOrEqual(criados);
  });
});

describe('a neutralizacao cobre o que o Excel executa', () => {
  const gatilhos = ['=', '+', '-', '@'];

  it.each(gatilhos)('prefixo %s vira texto', (gatilho) => {
    const linha = gerarCsv([{ cabecalho: 'Cliente', valor: (l: { n: string }) => l.n }], [
      { n: `${gatilho}HYPERLINK("http://x","y")` },
    ]).split('\r\n')[1];

    // O apostrofo antes do gatilho e o que faz o Excel ler como texto.
    expect(linha.replace(/^"/, '')).toMatch(/^'/);
  });

  it('nome comum nao ganha apostrofo', () => {
    const linha = gerarCsv([{ cabecalho: 'Cliente', valor: (l: { n: string }) => l.n }], [
      { n: 'Ana Maria' },
    ]).split('\r\n')[1];

    expect(linha).toBe('Ana Maria');
  });
});
