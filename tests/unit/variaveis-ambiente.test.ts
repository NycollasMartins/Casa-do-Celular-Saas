import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Tres listas descrevem as mesmas variaveis de ambiente: o que o codigo LE, o
 * que o .env.example DOCUMENTA e o que lib/ambiente.ts CONFERE no deploy.
 *
 * Variavel lida e nao documentada e a pior das combinacoes: quem publica nao
 * sabe que precisa dela, e a falta quase nunca quebra de forma visivel — o
 * lembrete opera em modo registro, o link de recuperacao aponta para o lugar
 * errado, o rate limit cai para memoria. Tudo silencioso.
 *
 * Foi assim que SEED_PASSWORD passou despercebida: sem ela, o seed usava uma
 * senha embutida no repositorio, e nada no .env.example dizia que existia.
 */

const lidas = new Set(
  execSync(
    "grep -rhoE 'process\\.env\\.[A-Z_][A-Z0-9_]*' app lib scripts middleware.ts next.config.js sentry.*.ts instrumentation.ts 2>/dev/null || true",
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .map((linha) => linha.replace('process.env.', ''))
);

const documentadas = new Set(
  (readFileSync('.env.example', 'utf8').match(/^[A-Z_][A-Z0-9_]*(?==)/gm) ?? [])
);

/** Fora do .env.example de proposito, cada uma com o motivo. */
const NAO_SE_DOCUMENTA: Record<string, string> = {
  NODE_ENV: 'definida pelo Next, nao por quem publica',
  NEXT_RUNTIME: 'definida pelo Next para distinguir edge de node',
  CI: 'definida pelo proprio runner',
  VERIFICAR_DB: 'so troca o nome do banco descartavel local; documentada no script',
};

describe('variaveis de ambiente', () => {
  it('encontrou variaveis para conferir', () => {
    expect(lidas.size).toBeGreaterThan(10);
  });

  it('toda variavel lida esta documentada ou isenta', () => {
    const ausentes = [...lidas].filter((v) => !documentadas.has(v) && !(v in NAO_SE_DOCUMENTA));

    expect(ausentes.sort()).toEqual([]);
  });

  it('nao documenta variavel que ninguem le', () => {
    // Variavel morta no .env.example manda preencher algo sem efeito, e faz
    // duvidar do resto do arquivo.
    const mortas = [...documentadas].filter((v) => !lidas.has(v));

    expect(mortas.sort()).toEqual([]);
  });

  it('nao ha isencao orfa', () => {
    const orfas = Object.keys(NAO_SE_DOCUMENTA).filter((v) => !lidas.has(v));

    expect(orfas).toEqual([]);
  });
});

describe('conferencia de ambiente do deploy', () => {
  it('tudo que lib/ambiente.ts confere existe no .env.example', () => {
    const conferidas = [
      ...readFileSync('lib/ambiente.ts', 'utf8').matchAll(/variavel: '([A-Z_]+)'/g),
    ].map((m) => m[1]);

    expect(conferidas.filter((v) => !documentadas.has(v))).toEqual([]);
  });
});
