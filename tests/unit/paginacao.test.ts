import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A paginacao de `buscarAgendamentos` precisa sobreviver ao teto de linhas do
 * servidor.
 *
 * O PostgREST corta toda resposta em `db-max-rows` — no Supabase, o "Max rows"
 * de Settings > API. O padrao e 1000, exatamente igual ao TAMANHO_PAGINA do
 * codigo: a leitura completa funcionava por COINCIDENCIA entre dois numeros que
 * ninguem prometeu manter iguais.
 *
 * Este teste move o teto para 500 e exige que a leitura continue completa.
 * Sao os numeros que o franqueado leva para a reuniao: faltar registro sem
 * avisar e o pior desfecho possivel.
 */

const TOTAL = 2_600;
const TETO_DO_SERVIDOR = 500;

let requisicoes: Array<[number, number]> = [];

/** Imita o PostgREST: respeita o range pedido, mas nunca entrega mais que o teto. */
function pagina(de: number, ate: number) {
  const fim = Math.min(ate, de + TETO_DO_SERVIDOR - 1, TOTAL - 1);
  const linhas = [];
  for (let i = de; i <= fim; i++) linhas.push({ id: i, status: 'agendado' });
  return linhas;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => {
      const construtor: Record<string, unknown> = {};
      for (const metodo of ['select', 'gte', 'lte', 'order', 'eq', 'in', 'or', 'limit']) {
        construtor[metodo] = () => construtor;
      }
      construtor.range = (de: number, ate: number) => {
        requisicoes.push([de, ate]);
        return Promise.resolve({ data: pagina(de, ate), error: null });
      };
      return construtor;
    },
  }),
}));

const { buscarAgendamentos } = await import('@/lib/supabase/queries');

describe('leitura paginada sob teto do servidor', () => {
  beforeEach(() => {
    requisicoes = [];
  });

  it('le TODAS as linhas mesmo com o servidor entregando menos que a pagina pedida', async () => {
    const linhas = await buscarAgendamentos({ dataInicio: '2025-01-01', dataFim: '2025-12-31' });

    expect(linhas).toHaveLength(TOTAL);
  });

  it('nao pula linhas entre uma pagina e a seguinte', async () => {
    const linhas = (await buscarAgendamentos({
      dataInicio: '2025-01-01',
      dataFim: '2025-12-31',
    })) as unknown as Array<{ id: number }>;

    // Buraco no meio e o desfecho de avancar por TAMANHO_PAGINA enquanto o
    // servidor entrega menos: some um pedaco sem que nada acuse.
    expect(linhas.map((l) => l.id)).toEqual(Array.from({ length: TOTAL }, (_, i) => i));
  });

  it('cada requisicao comeca onde a anterior parou', async () => {
    await buscarAgendamentos({ dataInicio: '2025-01-01', dataFim: '2025-12-31' });

    // 0, 500, ... 2500 entregam 500 cada; 2600 e a ultima parcial (100) e a
    // requisicao seguinte volta vazia, que e o sinal de fim.
    expect(requisicoes.map(([de]) => de)).toEqual([0, 500, 1000, 1500, 2000, 2500, 2600]);
  });
});
