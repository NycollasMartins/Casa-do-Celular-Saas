import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Toda rota que espera o banco precisa mostrar alguma coisa enquanto espera.
 *
 * POR QUE
 * Em Server Component sem `loading.tsx`, clicar num link deixa a tela PARADA
 * na pagina anterior ate o Supabase responder — nenhum sinal de que algo
 * acontece. Quem esta numa rede ruim toca de novo, e de novo.
 *
 * Quinze rotas estavam assim. Conferido no servidor de desenvolvimento: um
 * `loading.tsx` no segmento PAI atende as rotas filhas, e o esqueleto chega em
 * ~36ms enquanto a pagina leva segundos. Por isso dois arquivos bastam —
 * app/dashboard e app/admin — em vez de um por rota.
 */

const paginas = execSync('find app -name page.tsx', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

/** Isentas, com motivo — nao esquecidas. */
const ISENTAS: Record<string, string> = {
  'app/page.tsx': 'so redireciona; nao ha espera para sinalizar',
  'app/privacidade/page.tsx': 'texto estatico, nao consulta o banco',
  'app/auth/login/page.tsx': 'ja tem Suspense proprio no bloco que espera',
  'app/auth/register/page.tsx': 'formulario, sem consulta',
  'app/auth/forgot-password/page.tsx': 'formulario, sem consulta',
  'app/auth/nova-senha/page.tsx': 'formulario; o cliente e usado no submit, nao no render',
};

/** Sobe de app/<rota> ate app/ procurando um loading.tsx que a cubra. */
function temEsqueletoAcima(pagina: string): boolean {
  let dir = dirname(pagina);
  while (dir.startsWith('app')) {
    if (existsSync(join(dir, 'loading.tsx'))) return true;
    if (dir === 'app') break;
    dir = dirname(dir);
  }
  return false;
}

describe('sinal de carregamento por rota', () => {
  it('encontrou as paginas', () => {
    expect(paginas.length).toBeGreaterThan(10);
  });

  it.each(paginas)('%s sinaliza a espera', (pagina) => {
    if (pagina in ISENTAS) return;

    const fonte = readFileSync(pagina, 'utf8');
    const cobre = temEsqueletoAcima(pagina) || fonte.includes('<Suspense');

    expect(cobre).toBe(true);
  });

  it('nao ha isencao orfa', () => {
    const orfas = Object.keys(ISENTAS).filter((p) => !paginas.includes(p));

    expect(orfas).toEqual([]);
  });
});
