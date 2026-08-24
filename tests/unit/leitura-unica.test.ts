import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tela de Relatorios precisa de duas agregacoes do MESMO periodo: o resumo
 * geral e o recorte por loja. Ela pedia as duas separadamente, e cada funcao
 * varre o periodo inteiro e depois busca as vendas — entao a tela pagava tudo
 * em dobro, agendamentos e vendas.
 *
 * O mesmo desperdicio ja tinha sido encontrado e corrigido em
 * `desempenhoNaCompetencia`, cujo comentario descreve exatamente este caso.
 * Faltou na tela de Relatorios.
 *
 * O custo nao e so do banco: a leitura completa sai do Supabase por HTTP, em
 * paginas. Dobrar a leitura dobra o numero de idas e voltas.
 *
 * Uma regressao aqui nao aparece na tela — os numeros continuam certos, so
 * demoram o dobro. Por isso o teste conta consultas.
 */

const consultas: string[] = [];

function construtor(tabela: string) {
  const alvo: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lte', 'order', 'eq', 'in', 'or', 'limit']) {
    alvo[metodo] = () => alvo;
  }
  alvo.range = (de: number) =>
    // Uma pagina com uma linha e depois vazia: encerra o laco de paginacao.
    Promise.resolve({ data: de === 0 ? [{ id: 'a1', status: 'agendado', loja_id: 'l1', data_agendamento: '2026-08-10', agendador_id: 'u1' }] : [], error: null });
  return alvo;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (tabela: string) => {
      consultas.push(tabela);
      return construtor(tabela);
    },
  }),
}));

const { calcularMetricasEPorLoja, calcularMetricas, calcularMetricasPorLoja } = await import(
  '@/lib/supabase/queries'
);

const FILTROS = { dataInicio: '2026-08-01', dataFim: '2026-08-31' };

describe('leitura unica na tela de Relatorios', () => {
  beforeEach(() => {
    consultas.length = 0;
  });

  it('a versao combinada le agendamentos uma vez so', async () => {
    await calcularMetricasEPorLoja(FILTROS);

    const paginas = consultas.filter((t) => t === 'agendamentos').length;

    // Duas chamadas de `range` para uma leitura completa: a pagina com dados
    // e a pagina vazia que encerra o laco.
    expect(paginas).toBe(2);
  });

  it('e devolve as duas agregacoes', async () => {
    const { metricas, porLoja } = await calcularMetricasEPorLoja(FILTROS);

    expect(metricas).toBeDefined();
    expect(Array.isArray(porLoja)).toBe(true);
  });

  it('pedir separado custa o dobro — e o que a tela fazia', async () => {
    await calcularMetricas(FILTROS);
    const umaSo = consultas.filter((t) => t === 'agendamentos').length;

    consultas.length = 0;
    await calcularMetricas(FILTROS);
    await calcularMetricasPorLoja(FILTROS);
    const asDuas = consultas.filter((t) => t === 'agendamentos').length;

    expect(asDuas).toBe(umaSo * 2);
  });
});
