import { describe, expect, it } from 'vitest';
import {
  expiraEm,
  gerarToken,
  hashDoToken,
  hashesIguais,
  linkDoConvite,
  pareceToken,
} from '@/lib/convites';

/**
 * O token de convite.
 *
 * O QUE ESTE TESTE PROTEGE
 * O token e a unica coisa entre um estranho e uma rede nova no sistema. Tres
 * propriedades sustentam isso, e as tres sao faceis de quebrar sem perceber:
 * ele nao pode se repetir, o banco nao pode guardar o valor que abre a porta,
 * e a rota publica nao pode virar um caminho barato de sondagem.
 */

describe('token de convite', () => {
  it('nunca repete', () => {
    const tokens = new Set(Array.from({ length: 500 }, gerarToken));

    expect(tokens.size).toBe(500);
  });

  it('cabe na URL sem escapar nada', () => {
    for (let i = 0; i < 50; i++) {
      const token = gerarToken();
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it('o hash nao carrega o token dentro', () => {
    // Se o hash contivesse o token, guardar o hash nao protegeria nada.
    const token = gerarToken();
    const hash = hashDoToken(token);

    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });

  it('o mesmo token da sempre o mesmo hash, e tokens diferentes nao colidem', () => {
    const a = gerarToken();
    const b = gerarToken();

    expect(hashDoToken(a)).toBe(hashDoToken(a));
    expect(hashDoToken(a)).not.toBe(hashDoToken(b));
  });

  it('a comparacao em tempo constante nao estoura com tamanhos diferentes', () => {
    // `timingSafeEqual` LANCA quando os buffers tem tamanhos diferentes. Sem
    // o guard, um token torto derrubaria a rota em vez de recusar o convite.
    expect(hashesIguais('abc', 'abcd')).toBe(false);
    expect(hashesIguais('', 'a')).toBe(false);
    expect(hashesIguais('abc', 'abc')).toBe(true);
  });
});

describe('formato aceito na rota publica', () => {
  it('aceita o que gerarToken produz', () => {
    for (let i = 0; i < 50; i++) {
      expect(pareceToken(gerarToken())).toBe(true);
    }
  });

  it('recusa o que nao tem cara de token', () => {
    // Cada um destes chegaria ao banco como consulta se a rota nao filtrasse.
    const lixo = [
      '',
      'abc',
      'a'.repeat(42),
      'a'.repeat(44),
      "' or 1=1--",
      '../../etc/passwd',
      'a'.repeat(42) + '+', // '+' e base64 comum, nao base64url
      'a'.repeat(42) + '/',
      null,
      undefined,
      42,
      {},
    ];

    for (const valor of lixo) expect(pareceToken(valor)).toBe(false);
  });
});

describe('prazo e link', () => {
  it('expira trinta dias depois', () => {
    const agora = new Date('2026-03-01T12:00:00Z');

    expect(expiraEm(agora).toISOString()).toBe('2026-03-31T12:00:00.000Z');
  });

  it('o link nao duplica a barra quando a base ja termina com uma', () => {
    expect(linkDoConvite('https://x.com/', 'abc')).toBe('https://x.com/convite/abc');
    expect(linkDoConvite('https://x.com', 'abc')).toBe('https://x.com/convite/abc');
  });
});
