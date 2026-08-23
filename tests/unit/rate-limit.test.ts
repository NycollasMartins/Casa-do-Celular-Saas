import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarContadores, verificarRateLimit, chavesEmMemoria } from '@/lib/rate-limit';

/**
 * Sem UPSTASH_* no ambiente, `verificarRateLimit` usa o contador em memoria.
 * E esse comportamento — o fallback — que estes testes cobrem; o caminho do
 * Redis depende de credencial e fica para o teste de integracao.
 */
describe('rate limit em memoria', () => {
  beforeEach(() => {
    reiniciarContadores();
  });

  it('permite ate o limite e barra a partir dele', async () => {
    for (let i = 1; i <= 3; i++) {
      const resultado = await verificarRateLimit('usuario:rota', 3);
      expect(resultado.permitido).toBe(true);
      expect(resultado.restante).toBe(3 - i);
    }

    const excedido = await verificarRateLimit('usuario:rota', 3);
    expect(excedido.permitido).toBe(false);
    expect(excedido.restante).toBe(0);
  });

  it('conta cada chave separadamente', async () => {
    await verificarRateLimit('usuario-a:rota', 1);
    const outro = await verificarRateLimit('usuario-b:rota', 1);
    expect(outro.permitido).toBe(true);
  });

  it('informa em quantos segundos a janela reabre', async () => {
    const resultado = await verificarRateLimit('usuario:rota', 10);
    expect(resultado.resetEmSegundos).toBeGreaterThan(0);
    expect(resultado.resetEmSegundos).toBeLessThanOrEqual(60);
  });

  it('identifica a origem, para o log distinguir fallback de Redis', async () => {
    const resultado = await verificarRateLimit('usuario:rota', 10);
    expect(resultado.origem).toBe(process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'memoria');
  });
});

describe('crescimento do contador em memoria', () => {
  beforeEach(() => reiniciarContadores());

  it('nao cresce sem limite com chaves sempre diferentes', async () => {
    // O cenario real: rota aberta com teto por IP, e um identificador que quem
    // chama consegue variar. Sem conter, cada chamada vira uma entrada que so
    // sai depois de um minuto — e dentro desse minuto nada impede o mapa de
    // crescer ate onde o atacante quiser.
    for (let i = 0; i < 12_000; i++) {
      await verificarRateLimit(`saude:forjado-${i}`, 12);
    }

    expect(chavesEmMemoria()).toBeLessThanOrEqual(10_000);
  });

  it('continua contando certo depois de conter o crescimento', async () => {
    for (let i = 0; i < 11_000; i++) await verificarRateLimit(`ruido-${i}`, 100);

    const primeira = await verificarRateLimit('usuario:real', 2);
    const segunda = await verificarRateLimit('usuario:real', 2);
    const terceira = await verificarRateLimit('usuario:real', 2);

    expect(primeira.permitido).toBe(true);
    expect(segunda.permitido).toBe(true);
    expect(terceira.permitido).toBe(false);
  });
});
