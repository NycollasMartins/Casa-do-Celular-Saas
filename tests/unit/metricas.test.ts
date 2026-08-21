import { describe, expect, it } from 'vitest';
import {
  agregarMetricas,
  agregarPorLoja,
  agruparPorAgendador,
  agruparPorDia,
  distribuirStatus,
  resolverIntervalo,
} from '@/lib/supabase/queries';
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

describe('agregarPorLoja', () => {
  const lojaA = { id: 'loja-1', nome: 'Loja 1', codigo_loja: 'L-001' };
  const lojaB = { id: 'loja-2', nome: 'Loja 2', codigo_loja: 'L-002' };

  function daLoja(status: AgendamentoStatus, loja: typeof lojaA) {
    return registro(status, { loja_id: loja.id, loja });
  }

  it('separa os numeros por loja', () => {
    const linhas = agregarPorLoja(
      [daLoja('contatado', lojaA), daLoja('compareceu', lojaA), daLoja('agendado', lojaB)],
      new Map()
    );

    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.lojaId === 'loja-1')).toMatchObject({ contatos: 2, compareceram: 1 });
    expect(linhas.find((l) => l.lojaId === 'loja-2')).toMatchObject({ contatos: 1, agendados: 1 });
  });

  it('ordena pelo volume de contatos, como a tela promete', () => {
    const linhas = agregarPorLoja(
      [daLoja('contatado', lojaA), daLoja('contatado', lojaB), daLoja('contatado', lojaB)],
      new Map()
    );

    expect(linhas[0].lojaId).toBe('loja-2');
  });

  it('soma receita e ticket medio por loja', () => {
    const um = daLoja('compareceu', lojaA);
    const dois = daLoja('compareceu', lojaA);
    const tres = daLoja('compareceu', lojaB);

    const linhas = agregarPorLoja(
      [um, dois, tres],
      new Map([
        [um.id, 300],
        [dois.id, 100],
        [tres.id, 50],
      ])
    );

    const a = linhas.find((l) => l.lojaId === 'loja-1')!;
    expect(a.vendas).toBe(2);
    expect(a.receita).toBe(400);
    expect(a.ticketMedio).toBe(200);

    expect(linhas.find((l) => l.lojaId === 'loja-2')!.ticketMedio).toBe(50);
  });

  /** Mesma regra da metrica geral: faltar nao desfaz o agendamento. */
  it('conta quem faltou como visita marcada', () => {
    const linhas = agregarPorLoja(
      [daLoja('nao_compareceu', lojaA), daLoja('compareceu', lojaA)],
      new Map()
    );

    expect(linhas[0].agendados).toBe(2);
    expect(linhas[0].taxaConversao).toBe(100);
  });

  it('loja sem venda fica com receita e ticket zerados, nao nulos', () => {
    const linhas = agregarPorLoja([daLoja('contatado', lojaA)], new Map());

    expect(linhas[0].receita).toBe(0);
    expect(linhas[0].ticketMedio).toBe(0);
  });

  it('devolve lista vazia sem registro nenhum', () => {
    expect(agregarPorLoja([], new Map())).toEqual([]);
  });
});

describe('resolverIntervalo', () => {
  /** 22h de 20/08 em Brasilia = 01h de 21/08 em UTC. */
  const noite = new Date('2026-08-21T01:00:00Z');

  it('respeita o intervalo personalizado', () => {
    expect(
      resolverIntervalo({ periodo: 'personalizado', dataInicio: '2026-01-01', dataFim: '2026-01-31' })
    ).toEqual({ inicio: '2026-01-01', fim: '2026-01-31' });
  });

  it('usa 30 dias por padrao', () => {
    const { inicio, fim } = resolverIntervalo({}, new Date('2026-08-20T15:00:00Z'));
    expect(fim).toBe('2026-08-20');
    expect(inicio).toBe('2026-07-22');
  });

  it('7 e 90 dias contam a partir de hoje, inclusive', () => {
    const meio = new Date('2026-08-20T15:00:00Z');
    expect(resolverIntervalo({ periodo: '7d' }, meio).inicio).toBe('2026-08-14');
    expect(resolverIntervalo({ periodo: '90d' }, meio).inicio).toBe('2026-05-23');
  });

  /**
   * DEFEITO CORRIGIDO: o servidor roda em UTC e as lojas em Brasilia. As
   * 22h o UTC ja virou o dia, e a janela escorregava — descartava um dia
   * real de dados e incluia um que ainda nao aconteceu. O mesmo usuario via
   * totais diferentes as 20h e as 22h.
   */
  it('a janela nao escorrega quando o UTC ja virou o dia', () => {
    expect(resolverIntervalo({ periodo: '30d' }, noite)).toEqual({
      inicio: '2026-07-22',
      fim: '2026-08-20',
    });
  });

  it('o mesmo dia da a mesma janela de tarde e de noite', () => {
    const tarde = resolverIntervalo({ periodo: '30d' }, new Date('2026-08-20T18:00:00Z'));
    expect(resolverIntervalo({ periodo: '30d' }, noite)).toEqual(tarde);
  });

  it('atravessa a virada de mes', () => {
    expect(resolverIntervalo({ periodo: '7d' }, new Date('2026-09-03T15:00:00Z')).inicio).toBe(
      '2026-08-28'
    );
  });

  it('periodo personalizado sem as duas datas cai no padrao', () => {
    const { fim } = resolverIntervalo({ periodo: 'personalizado' }, new Date('2026-08-20T15:00:00Z'));
    expect(fim).toBe('2026-08-20');
  });
});

describe('agruparPorDia', () => {
  const dia = (data: string, status: AgendamentoStatus = 'contatado') => ({
    data_agendamento: data,
    status,
  });

  it('cobre todos os dias do intervalo, inclusive os vazios', () => {
    const serie = agruparPorDia([dia('2026-08-03')], '2026-08-01', '2026-08-05');

    expect(serie).toHaveLength(5);
    expect(serie.map((p) => p.data)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(serie[2].contatos).toBe(1);
    expect(serie[0].contatos).toBe(0);
  });

  it('rotula como dia/mes', () => {
    expect(agruparPorDia([], '2026-08-09', '2026-08-09')[0].label).toBe('09/08');
  });

  it('atravessa a virada de mes', () => {
    const serie = agruparPorDia([], '2026-08-30', '2026-09-02');
    expect(serie.map((p) => p.data)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    const serie = agruparPorDia([], '2028-02-28', '2028-03-01');
    expect(serie.map((p) => p.data)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });

  /**
   * A serie nasce de aritmetica de string. Somar 86.400.000 ms a um Date
   * local repete ou pula um dia ao atravessar o horario de verao — nem
   * Brasilia nem UTC tem, entao a versao anterior funcionava por
   * coincidencia, e so ate rodar em outro fuso.
   */
  it('nao repete nem pula dia num intervalo longo', () => {
    const serie = agruparPorDia([], '2026-01-01', '2026-12-31');
    const unicos = new Set(serie.map((p) => p.data));

    expect(serie).toHaveLength(365);
    expect(unicos.size).toBe(365);
  });

  it('ignora registro fora do intervalo', () => {
    const serie = agruparPorDia([dia('2026-07-15')], '2026-08-01', '2026-08-02');
    expect(serie.every((p) => p.contatos === 0)).toBe(true);
  });

  it('intervalo invertido devolve serie vazia', () => {
    expect(agruparPorDia([], '2026-08-10', '2026-08-01')).toEqual([]);
  });

  /** Sem o teto, `?inicio=1900-01-01` montaria 45 mil pontos. */
  it('limita a serie para intervalo absurdo nao travar a pagina', () => {
    const serie = agruparPorDia([], '1900-01-01', '2026-12-31');
    expect(serie.length).toBeLessThanOrEqual(1000);
  });
});

describe('agruparPorAgendador', () => {
  it('separa por pessoa e ordena pela conversao', () => {
    const linhas = agruparPorAgendador([
      registro('contatado'),
      registro('compareceu'),
      registro('compareceu', {
        agendador_id: 'agend-2',
        agendador: { id: 'agend-2', nome: 'Bruno' },
      }),
    ]);

    // Bruno converteu 1 de 1; Ana, 1 de 2.
    expect(linhas[0].nome).toBe('Bruno');
    expect(linhas[0].taxaConversao).toBe(100);
    expect(linhas[1].taxaConversao).toBe(50);
  });

  it('conta quem faltou como agendado, como no resto do sistema', () => {
    const linhas = agruparPorAgendador([registro('nao_compareceu')]);
    expect(linhas[0].agendados).toBe(1);
    expect(linhas[0].taxaConversao).toBe(100);
  });

  it('devolve lista vazia sem registro', () => {
    expect(agruparPorAgendador([])).toEqual([]);
  });
});

describe('distribuirStatus', () => {
  it('conta cada status presente', () => {
    const fatias = distribuirStatus([
      { status: 'contatado' },
      { status: 'contatado' },
      { status: 'compareceu' },
    ]);

    expect(fatias.find((f) => f.status === 'contatado')?.total).toBe(2);
    expect(fatias.find((f) => f.status === 'compareceu')?.total).toBe(1);
  });

  /** Fatia de tamanho zero polui a legenda do grafico sem informar nada. */
  it('omite status sem nenhum registro', () => {
    const fatias = distribuirStatus([{ status: 'contatado' }]);
    expect(fatias).toHaveLength(1);
  });

  it('traz o rotulo legivel junto do status', () => {
    expect(distribuirStatus([{ status: 'nao_compareceu' }])[0].label).toBeTruthy();
  });
});
