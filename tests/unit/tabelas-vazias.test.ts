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

  /**
   * Confere DENTRO do bloco de cada `<TableBody>`.
   *
   * Duas tentativas anteriores falharam, e vale registrar por que:
   *
   *  - Procurar `length === 0` no arquivo inteiro passava quando UMA das duas
   *    tabelas tratava o vazio. Verificado: removendo o tratamento da
   *    primeira tabela de participacoes, o teste continuava verde.
   *  - Contar ocorrencias tambem passava: aquele arquivo usa `length` para
   *    outras coisas, e a contagem nunca caia abaixo do numero de tabelas.
   *
   * Dentro do bloco o sinal e inequivoco: o idioma do vazio e uma linha com
   * `colSpan`, seja via <LinhaVazia> ou escrita a mao.
   *
   * Sobra um caso legitimo sem sinal nenhum: a tabela que nao chega a ser
   * renderizada porque o card inteiro esta dentro de uma condicao. Esse vira
   * isencao declarada, com o motivo — nao um vazamento do criterio.
   */
  const ESCONDIDAS_POR_FORA: Record<string, string> = {
    'app/dashboard/participacoes/page.tsx':
      'a tabela de encerradas vive dentro de `encerradas.length > 0`: some inteira',
  };

  it.each(arquivos)('%s trata o vazio dentro de cada tabela', (caminho) => {
    const fonte = readFileSync(caminho, 'utf8');
    const blocos = fonte.split('<TableBody>').slice(1);

    const semTratamento = blocos
      .map((bloco, indice) => ({ corpo: bloco.split('</TableBody>')[0], indice }))
      .filter(({ corpo }) => !/LinhaVazia|colSpan/.test(corpo))
      .map(({ indice }) => `tabela ${indice + 1}`);

    const permitidas = caminho in ESCONDIDAS_POR_FORA ? 1 : 0;

    expect(semTratamento.length).toBeLessThanOrEqual(permitidas);
  });

  it('nao ha isencao orfa', () => {
    const orfas = Object.keys(ESCONDIDAS_POR_FORA).filter((c) => !arquivos.includes(c));

    expect(orfas).toEqual([]);
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
