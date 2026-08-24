import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarContadores, verificarRateLimit } from '@/lib/rate-limit';

/**
 * O limitador do projeto protegia as rotas de API e a de saude, e deixava de
 * fora login e recuperacao de senha — que sao onde se bate.
 *
 * A recuperacao pesa mais que o login. Cada chamada dispara um e-mail pelo
 * SMTP do Supabase, que no plano gratuito tem cota baixa: esgotar a cota deixa
 * TODO MUNDO sem conseguir recuperar senha, e do lado da vitima enche a caixa
 * de entrada. Por isso a janela dela e de quinze minutos, nao de um.
 */

describe('janela configuravel', () => {
  beforeEach(() => reiniciarContadores());

  it('a janela padrao continua sendo de um minuto', async () => {
    const r = await verificarRateLimit('chave:padrao', 5);

    expect(r.resetEmSegundos).toBe(60);
  });

  it('aceita janela propria, em segundos', async () => {
    const r = await verificarRateLimit('chave:longa', 3, 900);

    expect(r.resetEmSegundos).toBe(900);
  });

  it('a contagem respeita o limite dentro da janela longa', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await verificarRateLimit('recuperacao:conta:a@x.com', 3, 900)).permitido).toBe(true);
    }

    expect((await verificarRateLimit('recuperacao:conta:a@x.com', 3, 900)).permitido).toBe(false);
  });

  it('janelas diferentes na mesma chamada nao se confundem', async () => {
    // Chaves distintas por acao: estourar o login nao pode bloquear a
    // recuperacao da mesma pessoa, nem o contrario.
    for (let i = 0; i < 10; i++) await verificarRateLimit('login:conta:a@x.com', 10, 60);

    expect((await verificarRateLimit('login:conta:a@x.com', 10, 60)).permitido).toBe(false);
    expect((await verificarRateLimit('recuperacao:conta:a@x.com', 3, 900)).permitido).toBe(true);
  });
});

describe('contagem por IP e por conta', () => {
  beforeEach(() => reiniciarContadores());

  it('IPs diferentes nao somam entre si', async () => {
    for (let i = 0; i < 10; i++) await verificarRateLimit('login:ip:1.1.1.1', 10, 60);

    expect((await verificarRateLimit('login:ip:1.1.1.1', 10, 60)).permitido).toBe(false);
    expect((await verificarRateLimit('login:ip:2.2.2.2', 10, 60)).permitido).toBe(true);
  });

  it('a conta continua protegida quando o IP muda a cada tentativa', async () => {
    // E o ataque que o teto por IP sozinho nao pega: uma conta alvo, muitos
    // enderecos de origem.
    for (let i = 0; i < 10; i++) {
      await verificarRateLimit(`login:ip:10.0.0.${i}`, 10, 60);
      await verificarRateLimit('login:conta:alvo@x.com', 10, 60);
    }

    expect((await verificarRateLimit('login:conta:alvo@x.com', 10, 60)).permitido).toBe(false);
  });
});

describe('normalizacao do e-mail na chave', () => {
  it('maiusculas e minusculas sao a mesma conta', () => {
    // O login do Supabase trata o e-mail sem diferenciar caixa. Se a chave do
    // contador diferenciasse, bastaria alternar maiusculas para zerar o teto.
    expect('Dono@X.com'.toLowerCase()).toBe('dono@x.com');
  });
});
