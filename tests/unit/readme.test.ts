import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O README afirma numeros: quantas migrations, quantas assercoes de banco.
 * Eles foram escritos ao longo de dezenas de commits e ja tinham divergido —
 * dizia 51 assercoes quando eram 54, e "13 migrations" quando sao 12 (o
 * decimo terceiro passo e um script, nao uma migration).
 *
 * Documentacao que mente e pior que documentacao ausente: quem confere um
 * numero errado e nao encontra a diferenca conclui que entendeu errado o
 * sistema.
 */

const readme = readFileSync('README.md', 'utf8');

function contarAssercoes(arquivo: string): number {
  return (readFileSync(`scripts/verificacao/${arquivo}`, 'utf8').match(/pg_temp\.checar\(/g) ?? [])
    .length;
}

const migrations = readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql')).length;
const rls = contarAssercoes('99-assercoes.sql');
const funcoes = contarAssercoes('98-funcoes.sql');

describe('numeros afirmados no README', () => {
  it('o total de asserçoes confere', () => {
    expect(readme).toContain(`**${rls + funcoes} asserções**`);
  });

  it('a divisao entre RLS e funcoes confere', () => {
    expect(readme).toContain(`**${rls} de RLS**`);
    expect(readme).toContain(`**${funcoes} das funções e triggers SQL**`);
  });

  it('a contagem de migrations confere', () => {
    expect(readme).toContain(`as ${migrations} migrations`);
  });

  it('nao sobrou contagem antiga', () => {
    // Se o numero mudar, a frase antiga precisa sair junto — senao o README
    // passa a afirmar duas coisas diferentes em paragrafos vizinhos.
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
