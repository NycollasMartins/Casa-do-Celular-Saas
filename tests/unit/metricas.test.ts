import { describe, expect, it } from 'vitest';
import { agregarMetricas } from '@/lib/supabase/queries';
import type { AgendamentoComRelacoes, AgendamentoStatus } from '@/lib/types/database';

/**
 * A conta que o produto inteiro existe para fazer, e que ate agora nao tinha
 * teste nenhum — estava presa dentro de uma funcao que falava com o banco.
 */

let sequencia = 0;

function registro(
  status: AgendamentoStatus,
  extras: Partial<AgendamentoComRelacoes> = {}
): AgendamentoComRelacoes {
  sequencia += 1;
  return {
    id: `ag-${sequencia}`,
    franqueado_id: 'franq-1',
    loja_id: 'loja-1',
    agendador_id: 'agend-1',
    cliente_nome: 'Cliente',
    cliente_email: null,
    cliente_cpf: '529.982.247-25',
    cliente_telefone: '(61) 99999-0000',
    data_agendamento: '2026-08-10',
    status,
    observacoes: null,
    anonimizado_em: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:00:00Z',
    loja: { id: 'loja-1', nome: 'Loja 1', codigo_loja: 'L-001' },
    agendador: { id: 'agend-1', nome: 'Ana' },
    ...extras,
  } as AgendamentoComRelacoes;
}

const INICIO = '2026-08-01';
const FIM = '2026-08-31';

describe('agregarMetricas', () => {
  it('devolve tudo zerado sem registro nenhum', () => {
    const m = agregarMetricas([], new Map(), INICIO, FIM);

    expect(m.totalContatos).toBe(0);
    expect(m.taxaConversao).toBe(0);
    expect(m.taxaComparecimento).toBe(0);
    expect(m.taxaFechamento).toBe(0);
    expect(m.receita).toBe(0);
    expect(m.ticketMedio).toBe(0);
  });

  it('conta contatos, agendados e comparecimentos', () => {
    const m = agregarMetricas(
      [
        registro('contatado'),
        registro('nao_agendado'),
        registro('agendado'),
        registro('compareceu'),
        registro('nao_compareceu'),
      ],
      new Map(),
      INICIO,
      FIM
    );

    expect(m.totalContatos).toBe(5);
    // Agendado, compareceu e nao_compareceu sao todos "chegou a marcar".
    expect(m.totalAgendados).toBe(3);
    expect(m.totalCompareceram).toBe(1);
  });

  it('conversao e sobre os contatos; comparecimento e sobre os agendados', () => {
    const m = agregarMetricas(
      [registro('contatado'), registro('agendado'), registro('compareceu'), registro('nao_compareceu')],
      new Map(),
      INICIO,
      FIM
    );

    // 3 de 4 marcaram = 75%. O comparecimento so olha as visitas com
    // desfecho: 1 apareceu, 1 faltou, e a de status 'agendado' ainda vai
    // acontecer — 1 de 2 = 50%.
    expect(m.taxaConversao).toBe(75);
    expect(m.taxaComparecimento).toBe(50);
  });

  /**
   * DEFEITO CORRIGIDO: `nao_compareceu` nao contava como agendado, entao
   * quem faltou sumia do numerador E do denominador. A taxa de
   * comparecimento ficava cega ao nao comparecimento — o numero que o
   * sistema existe para combater.
   */
  it('quem faltou continua contando como visita marcada', () => {
    const m = agregarMetricas(
      [
        ...Array.from({ length: 10 }, () => registro('compareceu')),
        ...Array.from({ length: 90 }, () => registro('nao_compareceu')),
      ],
      new Map(),
      INICIO,
      FIM
    );

    expect(m.totalAgendados).toBe(100);
    expect(m.taxaComparecimento).toBe(10);
    expect(m.taxaConversao).toBe(100);
  });

  it('visita futura nao dilui a taxa de comparecimento', () => {
    const m = agregarMetricas(
      [registro('compareceu'), registro('nao_compareceu'), registro('agendado')],
      new Map(),
      INICIO,
      FIM
    );

    // 1 de 2 concluidas = 50%. A terceira ainda vai acontecer.
    expect(m.taxaComparecimento).toBe(50);
  });

  it('nao divide por zero quando ninguem foi agendado', () => {
    const m = agregarMetricas([registro('contatado'), registro('nao_agendado')], new Map(), INICIO, FIM);

    expect(m.taxaConversao).toBe(0);
    expect(m.taxaComparecimento).toBe(0);
  });

  describe('faturamento', () => {
    it('soma as vendas dos registros do periodo', () => {
      const a = registro('compareceu');
      const b = registro('compareceu');
      const vendas = new Map([
        [a.id, 1500.5],
        [b.id, 499.5],
      ]);

      const m = agregarMetricas([a, b], vendas, INICIO, FIM);

      expect(m.totalVendas).toBe(2);
      expect(m.receita).toBe(2000);
      expect(m.ticketMedio).toBe(1000);
    });

    /**
     * O mapa de vendas pode trazer chave de agendamento fora do recorte
     * quando o chamador reaproveita a leitura. Somar tudo faria a receita de
     * um periodo vazar para outro.
     */
    it('ignora venda de agendamento que nao esta no recorte', () => {
      const dentro = registro('compareceu');
      const vendas = new Map([
        [dentro.id, 100],
        ['ag-de-outro-periodo', 9999],
      ]);

      const m = agregarMetricas([dentro], vendas, INICIO, FIM);

      expect(m.totalVendas).toBe(1);
      expect(m.receita).toBe(100);
    });

    /** Fechamento mede o balcao: o denominador e quem apareceu. */
    it('fechamento e sobre quem compareceu, nao sobre quem foi contatado', () => {
      const veio = registro('compareceu');
      const outroVeio = registro('compareceu');
      const m = agregarMetricas(
        [registro('contatado'), registro('agendado'), veio, outroVeio],
        new Map([[veio.id, 200]]),
        INICIO,
        FIM
      );

      // 1 venda para 2 comparecimentos = 50%, nao 25% sobre os 4 contatos.
      expect(m.taxaFechamento).toBe(50);
    });

    it('arredonda a receita para centavos', () => {
      const a = registro('compareceu');
      const m = agregarMetricas([a], new Map([[a.id, 0.1 + 0.2]]), INICIO, FIM);
      expect(m.receita).toBe(0.3);
    });
  });

  describe('agrupamentos', () => {
    it('separa por agendador', () => {
      const m = agregarMetricas(
        [
          registro('agendado'),
          registro('compareceu', {
            agendador_id: 'agend-2',
            agendador: { id: 'agend-2', nome: 'Bruno' },
          }),
        ],
        new Map(),
        INICIO,
        FIM
      );

      expect(m.dadosPorAgendador).toHaveLength(2);
      expect(m.dadosPorAgendador.map((linha) => linha.nome).sort()).toEqual(['Ana', 'Bruno']);
    });

    it('distribui por status, sem listar status ausente', () => {
      const m = agregarMetricas([registro('contatado'), registro('contatado')], new Map(), INICIO, FIM);

      expect(m.distribuicaoStatus).toHaveLength(1);
      expect(m.distribuicaoStatus[0]).toMatchObject({ status: 'contatado', total: 2 });
    });

    it('a serie diaria cobre o intervalo inteiro, inclusive dias sem movimento', () => {
      const m = agregarMetricas(
        [registro('agendado', { data_agendamento: '2026-08-03' })],
        new Map(),
        '2026-08-01',
        '2026-08-07'
      );

      expect(m.dadosDiarios).toHaveLength(7);
      expect(m.dadosDiarios.reduce((soma, dia) => soma + dia.contatos, 0)).toBe(1);
    });
  });
});
