import { describe, expect, it } from 'vitest';
import { ambienteSaudavel, conferirAmbiente } from '@/lib/ambiente';
import { conferirSchema, limparCacheDeSchema } from '@/lib/prontidao';

const COMPLETO = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chave',
  SUPABASE_SERVICE_ROLE_KEY: 'segredo',
  NEXT_PUBLIC_SITE_URL: 'https://casa.example.com',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
  NEXT_PUBLIC_SENTRY_DSN: 'https://sentry.example.com/1',
};

describe('conferirAmbiente', () => {
  it('nao reclama de ambiente completo', () => {
    expect(conferirAmbiente(COMPLETO, true)).toEqual([]);
  });

  it('aponta o que falta, com a consequencia', () => {
    const problemas = conferirAmbiente({ ...COMPLETO, SUPABASE_SERVICE_ROLE_KEY: '' }, true);

    expect(problemas).toHaveLength(1);
    expect(problemas[0].variavel).toBe('SUPABASE_SERVICE_ROLE_KEY');
    expect(problemas[0].gravidade).toBe('impede');
    expect(problemas[0].consequencia).toMatch(/Admin API/);
  });

  it('trata espaco em branco como ausencia', () => {
    const problemas = conferirAmbiente({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: '   ' }, true);
    expect(problemas.map((p) => p.variavel)).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  /**
   * O erro classico do primeiro deploy: publica com o valor de
   * desenvolvimento, o e-mail de recuperacao chega e o link manda o usuario
   * para a maquina dele. Nada falha visivelmente.
   */
  it('acusa SITE_URL apontando para localhost em producao', () => {
    const problemas = conferirAmbiente(
      { ...COMPLETO, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
      true
    );

    expect(problemas.map((p) => p.variavel)).toContain('NEXT_PUBLIC_SITE_URL');
    expect(problemas[0].consequencia).toMatch(/localhost/);
  });

  it('nao acusa localhost fora de producao', () => {
    const problemas = conferirAmbiente(
      { ...COMPLETO, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
      false
    );

    expect(problemas).toEqual([]);
  });

  it('exige esquema na URL do site', () => {
    const problemas = conferirAmbiente({ ...COMPLETO, NEXT_PUBLIC_SITE_URL: 'casa.example.com' }, true);
    expect(problemas[0].consequencia).toMatch(/http/);
  });

  it('separa o que degrada do que impede', () => {
    const problemas = conferirAmbiente(
      { ...COMPLETO, UPSTASH_REDIS_REST_URL: '', NEXT_PUBLIC_SENTRY_DSN: '' },
      true
    );

    expect(problemas).toHaveLength(2);
    expect(problemas.every((p) => p.gravidade === 'degrada')).toBe(true);
  });
});

describe('ambienteSaudavel', () => {
  it('degradacao nao derruba o sistema', () => {
    const problemas = conferirAmbiente({ ...COMPLETO, NEXT_PUBLIC_SENTRY_DSN: '' }, true);
    expect(ambienteSaudavel(problemas)).toBe(true);
  });

  it('falta do que impede derruba', () => {
    const problemas = conferirAmbiente({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, true);
    expect(ambienteSaudavel(problemas)).toBe(false);
  });

  it('ambiente vazio e insalubre', () => {
    expect(ambienteSaudavel(conferirAmbiente({}, true))).toBe(false);
  });
});

describe('cache da conferencia de schema', () => {
  /**
   * `/api/saude` e aberta e cada conferencia dispara dez consultas. Sem
   * cache, um laco de curl vira amplificacao: uma requisicao barata para
   * quem chama, dez para o banco.
   *
   * A sondagem e injetada: sondar de verdade aqui significaria consultar o
   * banco de producao a cada `npm test`.
   */
  function sondaFalsa() {
    let chamadas = 0;
    return {
      get chamadas() {
        return chamadas;
      },
      sondar: async () => {
        chamadas += 1;
        return [{ item: 'vendas', migration: '008', presente: true }];
      },
    };
  }

  it('nao repete a sondagem dentro da validade', async () => {
    limparCacheDeSchema();
    const sonda = sondaFalsa();

    await conferirSchema(1_000_000, sonda.sondar);
    await conferirSchema(1_010_000, sonda.sondar); // 10s depois
    await conferirSchema(1_029_000, sonda.sondar); // 29s depois

    expect(sonda.chamadas).toBe(1);
  });

  it('sonda de novo depois da validade', async () => {
    limparCacheDeSchema();
    const sonda = sondaFalsa();

    await conferirSchema(2_000_000, sonda.sondar);
    await conferirSchema(2_031_000, sonda.sondar); // 31s depois

    expect(sonda.chamadas).toBe(2);
  });

  it('limparCacheDeSchema forca nova sondagem', async () => {
    limparCacheDeSchema();
    const sonda = sondaFalsa();

    await conferirSchema(3_000_000, sonda.sondar);
    limparCacheDeSchema();
    await conferirSchema(3_000_100, sonda.sondar);

    expect(sonda.chamadas).toBe(2);
  });

  it('devolve o resultado da sondagem, nao um vazio', async () => {
    limparCacheDeSchema();
    const itens = await conferirSchema(4_000_000, sondaFalsa().sondar);

    expect(itens).toEqual([{ item: 'vendas', migration: '008', presente: true }]);
  });
});
