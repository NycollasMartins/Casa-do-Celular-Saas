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
 */

const paginas = execSync('find app -name "*.tsx"', { encoding: 'utf8' })
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

  it('toda tela que consulta uma lista usa lerPaginado', () => {
    const culpadas = paginas.filter((caminho) => {
      const fonte = readFileSync(caminho, 'utf8');
      if (!fonte.includes('.select(')) return false;

      // `count: 'exact', head: true` nao traz linha nenhuma — nao ha o que
      // paginar. `single`/`maybeSingle` pedem uma linha so.
      const soContagem = /count: 'exact'/.test(fonte);
      const soUmaLinha = /\.single\(\)|\.maybeSingle\(\)/.test(fonte);
      if (soContagem || soUmaLinha) return false;

      return !fonte.includes('lerPaginado');
    });

    expect(culpadas).toEqual([]);
  });
});
