import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Toda tabela precisa dizer alguma coisa quando nao tem o que listar.
 *
 * POR QUE
 * Cabecalho flutuando sobre o nada e indistinguivel de erro de carregamento:
 * quem abre nao sabe se o sistema quebrou ou se ainda nao ha dados. Quatro
 * telas estavam assim — equipe, franqueados, lojas da rede e metricas gerais
 * —, e sao justamente as primeiras que alguem ve num sistema recem-instalado,
 * quando TODAS as listas estao vazias.
 *
 * O teste le os arquivos com <TableBody> e exige que cada um trate o vazio.
 * Nao valida o texto; valida que a decisao foi tomada.
 */

const arquivos = execSync('grep -rl "<TableBody>" app components --include=*.tsx', {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);

describe('estado vazio das tabelas', () => {
  it('encontrou tabelas para conferir', () => {
    // Se o grep parar de achar arquivos, o `it.each` abaixo vira zero casos e
    // o teste passa sem testar nada.
    expect(arquivos.length).toBeGreaterThan(5);
  });

  it.each(arquivos)('%s trata a lista vazia', (caminho) => {
    const fonte = readFileSync(caminho, 'utf8');

    // Vale tratar dentro da tabela (LinhaVazia) ou esconder a tabela inteira
    // por fora, como a de participacoes encerradas faz.
    const trata = /LinhaVazia|length === 0|length > 0|length !== 0/.test(fonte);

    expect(trata).toBe(true);
  });
});

describe('LinhaVazia', () => {
  const fontes = arquivos.map((c) => [c, readFileSync(c, 'utf8')] as const);

  // So da para contar colunas por arquivo quando ha UMA tabela nele. Num
  // arquivo com duas, o total de <TableHead> nao pertence a nenhuma das duas e
  // a conferencia acusaria erro onde nao ha.
  const conferiveis = fontes.filter(
    ([, f]) => f.includes('<LinhaVazia') && (f.match(/<Table>/g) ?? []).length === 1
  );

  it('ha arquivos conferiveis', () => {
    expect(conferiveis.length).toBeGreaterThan(0);
  });

  it.each(conferiveis)(
    '%s usa colSpan igual ao numero de colunas',
    (caminho, fonte) => {
      // colSpan menor que o numero de colunas nao quebra o build: a celula
      // apenas nao atravessa, e a linha desalinha em producao.
      const colunas = (fonte.match(/<TableHead[ >]/g) ?? []).length;
      const declarados = [...fonte.matchAll(/<LinhaVazia colunas=\{(\d+)\}/g)].map((m) =>
        Number(m[1])
      );

      expect(declarados.every((n) => n === colunas)).toBe(true);
      expect(caminho).toBeTruthy();
    }
  );
});
