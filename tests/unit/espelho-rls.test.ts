import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Os testes em `tests/rls/` autenticam pelo PostgREST e dependem do seed —
 * na pratica, nunca rodaram. As asserçoes de `99-assercoes.sql` cobrem o
 * mesmo comportamento direto no Postgres, e rodam sempre, inclusive no CI.
 *
 * O README dizia que uma cobria a outra. Era prosa, e prosa nao segura nada:
 * comparando as duas listas apareceu que `super_admin` nao era mencionado em
 * assercao NENHUMA — e um franqueado conseguia se promover a ele.
 *
 * Agora cada teste de RLS declara, em comentario, qual assercao o espelha, e
 * este teste confere que a assercao citada existe. A correspondencia deixou
 * de ser promessa e virou verificacao.
 */

const arquivos = execSync("find tests/rls -name '*.test.ts'", { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const assercoes = new Set(
  [
    ...readFileSync('scripts/verificacao/99-assercoes.sql', 'utf8').matchAll(
      /pg_temp\.checar\('([^']+)'/g
    ),
  ].map((m) => m[1])
);

/** Cada `it(...)` com a linha imediatamente acima. */
function casosDe(caminho: string): Array<{ caso: string; espelho: string | null }> {
  const linhas = readFileSync(caminho, 'utf8').split('\n');

  return linhas
    .map((linha, indice) => ({ linha, anterior: linhas[indice - 1] ?? '' }))
    .filter(({ linha }) => /^\s*it\('/.test(linha))
    .map(({ linha, anterior }) => ({
      caso: linha.match(/it\('([^']+)'/)?.[1] ?? '?',
      espelho: anterior.match(/\/\/ espelho: (.+)$/)?.[1]?.trim() ?? null,
    }));
}

describe('espelho entre os testes de RLS e as asserçoes SQL', () => {
  it('encontrou os arquivos', () => {
    expect(arquivos.length).toBeGreaterThan(1);
    expect(assercoes.size).toBeGreaterThan(20);
  });

  it.each(arquivos)('%s: todo caso declara seu espelho', (caminho) => {
    const semEspelho = casosDe(caminho)
      .filter(({ espelho }) => espelho === null)
      .map(({ caso }) => caso);

    expect(semEspelho).toEqual([]);
  });

  it.each(arquivos)('%s: a assercao citada existe', (caminho) => {
    // Um nome que nao existe e pior que nenhum: parece cobertura e nao e.
    const inexistentes = casosDe(caminho)
      .filter(({ espelho }) => espelho !== null && !assercoes.has(espelho))
      .map(({ caso, espelho }) => `${caso} -> ${espelho}`);

    expect(inexistentes).toEqual([]);
  });

  it('os testes de RLS nao passam despercebidos quando pulam', () => {
    // `npm run test:rls` sem seed imprime "25 skipped" e sai com codigo zero.
    // Verde que nao testou nada e a pior forma de sinal.
    expect(readFileSync('tests/rls/cliente.ts', 'utf8')).toContain('TESTES DE RLS PULADOS');
  });
});
