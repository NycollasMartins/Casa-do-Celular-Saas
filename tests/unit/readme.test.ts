import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O README afirma numeros: quantas migrations, quantas assercoes de banco.
 * Eles foram escritos ao longo de dezenas de commits e ja tinham divergido —
 * dizia 51 assercoes quando eram outras tantas, e "13 migrations" quando sao
 * 12 (o decimo terceiro passo e um script, nao uma migration).
 *
 * Documentacao que mente e pior que documentacao ausente: quem confere um
 * numero errado e nao encontra a diferenca conclui que entendeu errado o
 * sistema.
 */

const readme = readFileSync('README.md', 'utf8');

const migrations = readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql')).length;

describe('numeros afirmados no README', () => {
  it('a contagem de migrations confere', () => {
    expect(readme).toContain(`as ${migrations} migrations`);
  });

  it('nao ha duas contagens de assercao no texto', () => {
    // O TOTAL de asserçoes nao e conferido aqui: nao da para saber lendo o
    // arquivo. A contagem ingenua erra por dois motivos — a linha que DEFINE
    // pg_temp.checar tambem casa, e ha desvio de guarda com duas chamadas das
    // quais so uma executa. Quem confere e scripts/verificar-banco.sh, DEPOIS
    // de rodar. O que sobra para ca e garantir que o texto nao afirme dois
    // numeros diferentes em paragrafos vizinhos.
    const totais = readme.match(/\*\*(\d+) asserções\*\*/g) ?? [];

    expect(new Set(totais).size).toBe(1);
  });
});

describe('comandos citados no README', () => {
  const pacote = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('todo `npm run` citado existe no package.json', () => {
    const citados = [...readme.matchAll(/npm run ([a-z0-9:]+)/g)].map((m) => m[1]);
    const inexistentes = [...new Set(citados)].filter((c) => !(c in pacote.scripts));

    expect(inexistentes).toEqual([]);
  });
});
