import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Toda leitura de lista precisa ler a lista INTEIRA e nao engolir erro.
 *
 * DOIS DEFEITOS QUE MORAM NO MESMO IDIOMA
 * `const { data } = await supabase.from(...).select(...)` seguido de
 * `data ?? []` erra de duas formas ao mesmo tempo:
 *
 *  - O PostgREST corta a resposta em `db-max-rows` (padrao 1000 no Supabase).
 *    A consulta nao falha: devolve menos linhas, calada.
 *  - Se a consulta falhar de verdade, `data` vem nulo e a tela renderiza como
 *    se nao houvesse nada.
 *
 * O segundo ficou PIOR quando as tabelas ganharam estado vazio: antes uma
 * falha mostrava tabela em branco, que ao menos parecia quebrada. Depois
 * passou a mostrar "Nenhuma loja na rede ainda. Cadastre a primeira" — uma
 * afirmacao confiante e falsa.
 *
 * `lerPaginado` resolve os dois: pagina ate o fim e levanta o erro.
 *
 * A PRIMEIRA VERSAO DESTE TESTE OLHAVA SO AS TELAS
 * Varria `app/**\/*.tsx` e deixava as Server Action de fora — que e onde
 * mora a leitura mais delicada do sistema: a que junta os registros de um
 * CPF para anonimizar. Cortada, ela anonimizaria parte, responderia "pronto"
 * e deixaria dado pessoal para tras, num pedido que a LGPD obriga a atender
 * por inteiro.
 */

const paginas = execSync('find app -name "*.tsx" -o -name "*.ts" -path "*/actions/*"', {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);

describe('leitura de lista nas telas', () => {
  it('encontrou telas para conferir', () => {
    expect(paginas.length).toBeGreaterThan(10);
  });

  it('nenhuma tela usa `data ?? []`', () => {
    const culpadas = paginas.filter((p) => readFileSync(p, 'utf8').includes('data ?? []'));

    expect(culpadas).toEqual([]);
  });

  /**
   * Confere CADA `.select(`, nao o arquivo inteiro.
   *
   * A primeira versao isentava o arquivo todo quando encontrava um
   * `.maybeSingle()` em qualquer lugar dele. Quatro arquivos caiam nessa
   * isencao sem ninguem notar — entre eles as duas Server Action de LGPD,
   * que sao a leitura mais delicada do sistema. A trava existia e nao
   * travava nada ali.
   *
   * A janela de linhas em volta e uma aproximacao, mas erra para o lado
   * seguro: encadeamento espalhado por mais linhas do que ela alcanca vira
   * uma reprovacao a investigar, nao uma isencao silenciosa.
   */
  const JANELA = 8;

  it.each(paginas)('%s pagina toda leitura de lista', (caminho) => {
    const linhas = readFileSync(caminho, 'utf8').split('\n');

    const desprotegidas = linhas
      .map((linha, indice) => ({ linha, indice }))
      .filter(({ linha }) => linha.includes('.select('))
      .filter(({ indice }) => {
        const volta = linhas.slice(Math.max(0, indice - JANELA), indice + JANELA).join('\n');

        // Contagem pura nao traz linha; `single` pede uma so. Nos dois casos
        // nao ha o que paginar.
        if (/count: 'exact'/.test(volta)) return false;
        if (/\.single\(\)|\.maybeSingle\(\)/.test(volta)) return false;

        return !/lerPaginado|\.range\(/.test(volta);
      })
      .map(({ indice }) => `linha ${indice + 1}`);

    expect(desprotegidas).toEqual([]);
  });
});
