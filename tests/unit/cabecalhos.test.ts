import { describe, expect, it } from 'vitest';

/**
 * Cabecalhos de seguranca da resposta.
 *
 * MEDIDO EM PRODUCAO, NAO SUPOSTO
 * A resposta do site publicado trazia apenas `strict-transport-security`, que
 * a Netlify acrescenta sozinha. Nem o Next nem a plataforma poem os demais.
 *
 * O que mais pesa e o enquadramento: sem `X-Frame-Options` e sem
 * `frame-ancestors`, qualquer site embute o dashboard num iframe invisivel e
 * captura cliques de quem esta autenticado. O alvo seria um franqueado na
 * tela de Equipe, onde clicar cria e desliga acesso.
 *
 * O teste chama a funcao de configuracao de verdade, em vez de procurar texto
 * no arquivo: assim ele acompanha se alguem trocar a forma de declarar.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('../../next.config.js') as {
  headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
};

const ESPERADOS: Record<string, RegExp> = {
  'X-Frame-Options': /^DENY$/,
  'Content-Security-Policy': /frame-ancestors 'none'/,
  'X-Content-Type-Options': /^nosniff$/,
  'Referrer-Policy': /^strict-origin-when-cross-origin$/,
  'Permissions-Policy': /camera=\(\)/,
};

describe('cabecalhos de seguranca', () => {
  it('a configuracao declara a funcao headers', () => {
    expect(typeof config.headers).toBe('function');
  });

  it('vale para todas as rotas, nao so para algumas', async () => {
    const regras = await config.headers();

    // Um `source` restrito deixaria justamente as telas autenticadas de fora,
    // que sao as que importam.
    expect(regras.some((regra) => regra.source === '/:caminho*')).toBe(true);
  });

  it.each(Object.entries(ESPERADOS))('define %s', async (chave, formato) => {
    const regras = await config.headers();
    const todos = regras.flatMap((regra) => regra.headers);
    const encontrado = todos.find((h) => h.key === chave);

    expect(encontrado, `${chave} nao esta declarado`).toBeDefined();
    expect(encontrado!.value).toMatch(formato);
  });

  it('a CSP se limita a frame-ancestors', async () => {
    // Deliberado. Uma politica completa precisaria liberar o inline que o
    // Next usa na hidratacao e os dominios de Supabase e Sentry; errar
    // qualquer um quebra a tela em producao, e CSP que quebra e revertida as
    // pressas — pior que nao ter. Este teste existe para a ampliacao ser uma
    // decisao, e nao um acrescimo distraido.
    const regras = await config.headers();
    const csp = regras.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy');

    expect(csp!.value.split(';').filter(Boolean)).toHaveLength(1);
  });
});
