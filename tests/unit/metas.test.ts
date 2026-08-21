import { describe, expect, it } from 'vitest';
import {
  calcularAtingimento,
  classificar,
  competenciaDe,
  fimDaCompetencia,
  fracaoDoMesDecorrida,
  situacaoGeral,
  type Meta,
  type Realizado,
} from '@/lib/metas';

const SEM_ALVO: Meta = {
  meta_agendamentos: null,
  meta_taxa_conversao: null,
  meta_vendas: null,
  meta_receita: null,
};

const NADA_FEITO: Realizado = { agendamentos: 0, taxaConversao: 0, vendas: 0, receita: 0 };

describe('fracaoDoMesDecorrida', () => {
  it('devolve a fracao proporcional ao dia dentro do mes corrente', () => {
    // Dia 15 de um mes de 30 dias.
    expect(fracaoDoMesDecorrida('2026-09-01', new Date('2026-09-15T12:00:00Z'))).toBeCloseTo(0.5, 2);
  });

  it('devolve 1 para mes ja fechado', () => {
    expect(fracaoDoMesDecorrida('2026-08-01', new Date('2026-09-05T12:00:00Z'))).toBe(1);
  });

  it('devolve 0 para mes que ainda nao comecou', () => {
    expect(fracaoDoMesDecorrida('2026-10-01', new Date('2026-09-05T12:00:00Z'))).toBe(0);
  });

  it('considera o tamanho real do mes', () => {
    // Dia 14 de fevereiro em ano bissexto (29 dias).
    expect(fracaoDoMesDecorrida('2028-02-01', new Date('2028-02-14T12:00:00Z'))).toBeCloseTo(
      14 / 29,
      3
    );
  });
});

describe('classificar', () => {
  it('considera no alvo a partir de 95% do esperado', () => {
    expect(classificar(100)).toBe('no_alvo');
    expect(classificar(95)).toBe('no_alvo');
    expect(classificar(150)).toBe('no_alvo');
  });

  it('marca atencao entre 80 e 95', () => {
    expect(classificar(94.9)).toBe('atencao');
    expect(classificar(80)).toBe('atencao');
  });

  it('marca abaixo sob 80', () => {
    expect(classificar(79.9)).toBe('abaixo');
    expect(classificar(0)).toBe('abaixo');
  });
});

describe('calcularAtingimento', () => {
  /**
   * O ponto central: no dia 10 de um mes de 30 dias, quem fez 33% do alvo
   * esta EM DIA. Comparar o realizado parcial com a meta cheia acusaria
   * todo mundo de atrasado ate o ultimo dia do mes.
   */
  it('compara com o esperado ate a data, nao com o alvo cheio', () => {
    const meta: Meta = { ...SEM_ALVO, meta_agendamentos: 60 };
    const realizado: Realizado = { ...NADA_FEITO, agendamentos: 20 };

    // Dia 10 de 30: esperado ate aqui = 20. Realizado = 20 -> no alvo.
    const itens = calcularAtingimento(meta, realizado, '2026-09-01', new Date('2026-09-10T12:00:00Z'));

    expect(itens).toHaveLength(1);
    expect(itens[0].situacao).toBe('no_alvo');
    // O percentual exibido continua sendo sobre o alvo do mes inteiro.
    expect(itens[0].percentual).toBeCloseTo(33.3, 1);
  });

  it('acusa quem esta atras do ritmo', () => {
    const meta: Meta = { ...SEM_ALVO, meta_agendamentos: 60 };
    const realizado: Realizado = { ...NADA_FEITO, agendamentos: 5 };

    const itens = calcularAtingimento(meta, realizado, '2026-09-01', new Date('2026-09-15T12:00:00Z'));
    expect(itens[0].situacao).toBe('abaixo');
  });

  /**
   * Taxa de conversao nao acumula: 60% no dia 5 ja e 60%. Proporcionalizar
   * o alvo dela diria que 60% no dia 5 supera em muito a meta de 50%.
   */
  it('nao proporcionaliza a taxa de conversao', () => {
    const meta: Meta = { ...SEM_ALVO, meta_taxa_conversao: 50 };
    const realizado: Realizado = { ...NADA_FEITO, taxaConversao: 48 };

    const itens = calcularAtingimento(meta, realizado, '2026-09-01', new Date('2026-09-02T12:00:00Z'));
    expect(itens[0].percentual).toBe(96);
    expect(itens[0].situacao).toBe('no_alvo');
  });

  it('ignora alvos nao definidos', () => {
    const meta: Meta = { ...SEM_ALVO, meta_vendas: 10 };
    const itens = calcularAtingimento(meta, NADA_FEITO, '2026-09-01', new Date('2026-09-15T12:00:00Z'));

    expect(itens).toHaveLength(1);
    expect(itens[0].chave).toBe('vendas');
  });

  it('devolve lista vazia quando nao ha meta alguma', () => {
    expect(calcularAtingimento(SEM_ALVO, NADA_FEITO, '2026-09-01')).toEqual([]);
  });

  it('cobre os quatro alvos quando todos estao definidos', () => {
    const meta: Meta = {
      meta_agendamentos: 60,
      meta_taxa_conversao: 50,
      meta_vendas: 12,
      meta_receita: 30000,
    };
    const itens = calcularAtingimento(meta, NADA_FEITO, '2026-09-01', new Date('2026-09-15T12:00:00Z'));
    expect(itens.map((item) => item.chave)).toEqual([
      'agendamentos',
      'taxaConversao',
      'vendas',
      'receita',
    ]);
  });

  it('no primeiro dia do mes nao acusa ninguem', () => {
    const meta: Meta = { ...SEM_ALVO, meta_agendamentos: 60 };
    const itens = calcularAtingimento(meta, NADA_FEITO, '2026-09-01', new Date('2026-08-20T12:00:00Z'));
    // Mes ainda nao comecou: esperado ate aqui e zero.
    expect(itens[0].situacao).toBe('no_alvo');
  });
});

describe('situacaoGeral', () => {
  const base = { chave: 'vendas' as const, rotulo: 'Vendas', meta: 10, realizado: 5, percentual: 50 };

  it('devolve sem_meta quando nao ha alvo', () => {
    expect(situacaoGeral([])).toBe('sem_meta');
  });

  /** E a pior situacao que o franqueado precisa enxergar na lista. */
  it('a pior situacao prevalece', () => {
    expect(
      situacaoGeral([
        { ...base, situacao: 'no_alvo' },
        { ...base, situacao: 'abaixo' },
        { ...base, situacao: 'atencao' },
      ])
    ).toBe('abaixo');
  });

  it('atencao prevalece sobre no alvo', () => {
    expect(
      situacaoGeral([
        { ...base, situacao: 'no_alvo' },
        { ...base, situacao: 'atencao' },
      ])
    ).toBe('atencao');
  });

  it('no alvo so quando todos estao', () => {
    expect(situacaoGeral([{ ...base, situacao: 'no_alvo' }])).toBe('no_alvo');
  });
});

describe('competencia', () => {
  it('normaliza para o primeiro dia do mes', () => {
    expect(competenciaDe(new Date('2026-09-17T12:00:00Z'))).toBe('2026-09-01');
  });

  it('calcula o ultimo dia do mes', () => {
    expect(fimDaCompetencia('2026-09-01')).toBe('2026-09-30');
    expect(fimDaCompetencia('2026-02-01')).toBe('2026-02-28');
    expect(fimDaCompetencia('2028-02-01')).toBe('2028-02-29');
    expect(fimDaCompetencia('2026-12-01')).toBe('2026-12-31');
  });
});

describe('fuso das lojas nas metas', () => {
  /** 01h UTC de 01/09 = 22h de 31/08 em Brasilia. */
  const ultimaNoiteDeAgosto = new Date('2026-09-01T01:00:00Z');

  /**
   * DEFEITO CORRIGIDO: competenciaDe usava getUTCMonth. Na ultima noite do
   * mes, a tela de Metas abria a competencia seguinte — justamente quando o
   * gestor confere o fechamento.
   */
  it('a competencia so vira quando o mes vira na loja', () => {
    expect(competenciaDe(ultimaNoiteDeAgosto)).toBe('2026-08-01');
    // 03h UTC ja e meia-noite em Brasilia.
    expect(competenciaDe(new Date('2026-09-01T03:00:00Z'))).toBe('2026-09-01');
  });

  it('o mes nao e dado como fechado uma noite antes', () => {
    // Ainda e 31/08 na loja: o mes corre, nao fechou.
    expect(fracaoDoMesDecorrida('2026-08-01', ultimaNoiteDeAgosto)).toBeCloseTo(1, 5);
    // E em 30/08 as 22h, faltava um dia.
    expect(fracaoDoMesDecorrida('2026-08-01', new Date('2026-08-31T01:00:00Z'))).toBeCloseTo(
      30 / 31,
      5
    );
  });
});
