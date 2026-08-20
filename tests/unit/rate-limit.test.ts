import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarContadores, verificarRateLimit } from '@/lib/rate-limit';

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
