import { describe, expect, it } from 'vitest';
import { destinoSeguro, ipDoCliente } from '@/lib/rede';

/**
 * A rota aberta de saude limita por IP. Se o identificador vier de um
 * cabecalho que o proprio cliente escreve, o limite nao limita nada: basta
 * mandar um valor diferente a cada chamada.
 *
 * O efeito colateral e pior que a falta do teto — o contador em memoria guarda
 * uma entrada por chave, entao cada valor inventado vira memoria ocupada.
 */

const cabecalhos = (pares: Record<string, string>) => new Headers(pares);

describe('ipDoCliente', () => {
  it('prefere o cabecalho da plataforma ao que o cliente mandou', () => {
    const ip = ipDoCliente(
      cabecalhos({
        'x-forwarded-for': '1.2.3.4',
        'x-nf-client-connection-ip': '203.0.113.7',
      })
    );

    expect(ip).toBe('203.0.113.7');
  });

  it('nao se deixa enganar por lista forjada antes do IP real', () => {
    // O cliente manda "1.2.3.4" e a borda acrescenta o IP verdadeiro. Ler o
    // primeiro da lista devolveria o valor inventado.
    const ip = ipDoCliente(
      cabecalhos({
        'x-forwarded-for': '1.2.3.4, 203.0.113.7',
        'cf-connecting-ip': '203.0.113.7',
      })
    );

    expect(ip).toBe('203.0.113.7');
  });

  it('cai para x-forwarded-for quando nao ha cabecalho de borda', () => {
    // Melhor um identificador fraco que um unico identificador para todos —
    // com um so, uma pessoa esgotaria o teto de todo mundo.
    expect(ipDoCliente(cabecalhos({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe(
      '198.51.100.9'
    );
  });

  it('devolve um valor mesmo sem cabecalho nenhum', () => {
    expect(ipDoCliente(cabecalhos({}))).toBe('desconhecido');
  });

  it('ignora cabecalho vazio em vez de aceitar string em branco', () => {
    // Cabecalho presente e vazio existe; aceitar '' juntaria todo mundo numa
    // chave so, que e o mesmo que nao ter limite por IP.
    expect(ipDoCliente(cabecalhos({ 'x-nf-client-connection-ip': '  ', 'x-real-ip': '203.0.113.1' }))).toBe(
      '203.0.113.1'
    );
  });
});

describe('destinoSeguro', () => {
  /**
   * Cada um destes ja foi confirmado saindo do site com `new URL`, que e a
   * mesma resolucao que o navegador faz.
   */
  const FUGAS = [
    ['//evil.com', 'protocolo-relativo: vira https://evil.com'],
    ['/\\evil.com', 'o navegador normaliza a barra invertida'],
    ['/\\/evil.com', 'variacao da mesma normalizacao'],
    ['https://evil.com', 'URL absoluta'],
    ['http://evil.com/x', 'absoluta sem TLS'],
    ['//evil.com/dashboard', 'disfarcada de caminho interno'],
    ['///evil.com', 'tres barras tambem resolvem para fora'],
  ] as const;

  it.each(FUGAS)('recusa %s (%s)', (valor) => {
    expect(destinoSeguro(valor)).toBe('/dashboard');
  });

  it('recusa o valor ja decodificado pelo searchParams', () => {
    // `?redirect=%2F%2Fevil.com` chega no codigo como '//evil.com': a
    // conferencia acontece DEPOIS da decodificacao, nao antes.
    expect(destinoSeguro(decodeURIComponent('%2F%2Fevil.com'))).toBe('/dashboard');
  });

  it.each([
    '/dashboard',
    '/dashboard/metas',
    '/dashboard/agendamentos?loja=abc&periodo=30d',
    '/dashboard/agendamentos/123',
  ])('preserva o destino interno %s', (valor) => {
    expect(destinoSeguro(valor)).toBe(valor);
  });

  it('cai no padrao quando nao ha parametro', () => {
    expect(destinoSeguro(null)).toBe('/dashboard');
    expect(destinoSeguro(undefined)).toBe('/dashboard');
    expect(destinoSeguro('')).toBe('/dashboard');
  });

  it('aceita padrao proprio', () => {
    expect(destinoSeguro('//evil.com', '/auth/login')).toBe('/auth/login');
  });

  it('devolve caminho relativo mesmo recebendo caminho sem barra inicial', () => {
    // 'dashboard' resolve para '/dashboard' na base — mesma origem, entao
    // passa, e o retorno sai normalizado com a barra.
    expect(destinoSeguro('dashboard')).toBe('/dashboard');
  });
});

describe('destinoSeguro concatenado a uma origem', () => {
  const ORIGEM = 'https://casadocelular.netlify.app';

  /**
   * A rota de callback montava o destino com `${origin}${next}`. Concatenar
   * host com texto de fora protege menos do que parece: `//evil.com` fica no
   * dominio, mas `@evil.com` vira userinfo e `.evil.com` vira subdominio de
   * quem atacou.
   */
  it.each(['@evil.com', '.evil.com', '//evil.com', 'https://evil.com', '.evil.com/roubar'])(
    'com %s o host final continua sendo o nosso',
    (valor) => {
      const destino = new URL(destinoSeguro(valor), ORIGEM);

      expect(destino.host).toBe('casadocelular.netlify.app');
    }
  );

  it('sem a conferencia, @ e . escapariam — e o teste acima nao seria trivial', () => {
    expect(new URL(`${ORIGEM}@evil.com`).host).toBe('evil.com');
    expect(new URL(`${ORIGEM}.evil.com`).host).toBe('casadocelular.netlify.app.evil.com');
  });
});
