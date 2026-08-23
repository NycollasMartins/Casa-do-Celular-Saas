import { describe, expect, it } from 'vitest';
import { mascararCpf, mascararTelefone, validarCpf } from '@/lib/utils';
import { agendamentoSchema, novoAgendamentoSchema, vendaSchema } from '@/lib/validations/agendamento';
import { hojeNaLoja } from '@/lib/semana';
import { novaSenhaSchema } from '@/lib/validations/auth';
import { metaSchema, participacaoSchema } from '@/lib/validations/cadastros';

describe('validarCpf', () => {
  it('aceita CPFs com digito verificador correto', () => {
    // Gerados pelo algoritmo oficial, nao sao de pessoas reais.
    expect(validarCpf('529.982.247-25')).toBe(true);
    expect(validarCpf('111.444.777-35')).toBe(true);
  });

  it('aceita com ou sem mascara', () => {
    expect(validarCpf('52998224725')).toBe(true);
  });

  it('rejeita digito verificador errado', () => {
    expect(validarCpf('529.982.247-26')).toBe(false);
  });

  /**
   * O caso que o regex sozinho deixa passar e que o README destaca como
   * decisao de projeto: formato valido, CPF inexistente.
   */
  it('rejeita sequencias repetidas mesmo com formato valido', () => {
    for (const digito of '0123456789') {
      expect(validarCpf(digito.repeat(11))).toBe(false);
    }
  });

  it('rejeita quantidade de digitos diferente de 11', () => {
    expect(validarCpf('529.982.247-2')).toBe(false);
    expect(validarCpf('')).toBe(false);
  });
});

describe('mascaras', () => {
  it('formata CPF progressivamente enquanto se digita', () => {
    expect(mascararCpf('529')).toBe('529');
    expect(mascararCpf('529982')).toBe('529.982');
    expect(mascararCpf('52998224725')).toBe('529.982.247-25');
  });

  it('descarta digitos alem do tamanho do CPF', () => {
    expect(mascararCpf('5299822472599')).toBe('529.982.247-25');
  });

  it('formata telefone de 10 e 11 digitos', () => {
    expect(mascararTelefone('6133330001')).toBe('(61) 3333-0001');
    expect(mascararTelefone('61999990001')).toBe('(61) 99999-0001');
  });
});

describe('agendamentoSchema', () => {
  const valido = {
    loja_id: '11111111-1111-4111-8111-111111111111',
    cliente_nome: 'Cliente Teste',
    cliente_cpf: '529.982.247-25',
    cliente_telefone: '(61) 99999-0001',
    data_agendamento: '2026-09-01',
    status: 'agendado',
  };

  it('aceita um agendamento completo', () => {
    expect(agendamentoSchema.safeParse(valido).success).toBe(true);
  });

  it('rejeita CPF com formato certo e digito errado', () => {
    const resultado = agendamentoSchema.safeParse({ ...valido, cliente_cpf: '111.111.111-11' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita status fora da lista', () => {
    const resultado = agendamentoSchema.safeParse({ ...valido, status: 'remarcado' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita loja que nao e uuid', () => {
    const resultado = agendamentoSchema.safeParse({ ...valido, loja_id: 'loja-1' });
    expect(resultado.success).toBe(false);
  });
});

describe('novaSenhaSchema', () => {
  it('aceita senha com letra, numero e 8 caracteres', () => {
    const resultado = novaSenhaSchema.safeParse({ senha: 'casa2026', confirmacao: 'casa2026' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita senha curta', () => {
    const resultado = novaSenhaSchema.safeParse({ senha: 'casa26', confirmacao: 'casa26' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita senha sem numero', () => {
    const resultado = novaSenhaSchema.safeParse({ senha: 'casadocelular', confirmacao: 'casadocelular' });
    expect(resultado.success).toBe(false);
  });

  it('aponta o erro no campo de confirmacao quando nao conferem', () => {
    const resultado = novaSenhaSchema.safeParse({ senha: 'casa2026', confirmacao: 'casa2027' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.flatten().fieldErrors.confirmacao).toBeTruthy();
    }
  });
});

describe('novoAgendamentoSchema', () => {
  const base = {
    loja_id: '11111111-1111-4111-8111-111111111111',
    cliente_nome: 'Cliente Teste',
    cliente_cpf: '529.982.247-25',
    cliente_telefone: '(61) 99999-0001',
    status: 'agendado',
  };

  function comData(data: string) {
    return novoAgendamentoSchema.safeParse({ ...base, data_agendamento: data });
  }

  it('aceita visita marcada para hoje', () => {
    expect(comData(hojeNaLoja()).success).toBe(true);
  });

  it('aceita visita no futuro', () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    expect(comData(amanha.toISOString().slice(0, 10)).success).toBe(true);
  });

  it('recusa visita no passado', () => {
    expect(comData('2020-01-01').success).toBe(false);
  });

  it('aponta o erro no campo da data', () => {
    const resultado = comData('2020-01-01');
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.flatten().fieldErrors.data_agendamento).toBeTruthy();
    }
  });
});

/**
 * Todo campo de data precisa recusar o que nao e data de calendario.
 *
 * O `data_agendamento` foi corrigido primeiro; estes sao os irmaos que
 * ficaram para tras. Cada um errava de um jeito:
 *
 *   data_venda    -> regex de formato: 2026-02-31 passava
 *   competencia   -> regex ^\d{4}-\d{2}-01$: mes 13 casa com \d{2}
 *   data_inicio   -> `z.string().optional()`, sem conferencia nenhuma
 *
 * O carimbo de tempo e o que mais custa: 2026-08-26T01:00:00Z e 25 de agosto
 * as 22h em Brasilia, e gravar o dia 26 desloca todo relatorio que o conte.
 */
const DATAS_RUINS = [
  ['2026-02-31', 'dia que nao existe no mes'],
  ['2026-13-01', 'mes 13 casa com \\d{2}'],
  ['2026-08-26T01:00:00Z', 'carimbo de tempo: 25/08 as 22h em Brasilia'],
  ['08/25/2026', 'formato ambiguo'],
  ['abc', 'nao e data'],
] as const;

const UUID = '11111111-1111-4111-8111-111111111111';

describe('campos de data nos schemas', () => {
  describe('vendaSchema.data_venda', () => {
    const montar = (data_venda: string) => ({ valor: 100, data_venda });

    it('aceita data de calendario', () => {
      expect(vendaSchema.safeParse(montar('2026-08-25')).success).toBe(true);
    });

    it.each(DATAS_RUINS)('recusa %s (%s)', (valor) => {
      expect(vendaSchema.safeParse(montar(valor)).success).toBe(false);
    });
  });

  describe('metaSchema.competencia', () => {
    const montar = (competencia: string) => ({
      usuario_id: UUID,
      competencia,
      meta_contatos: 1,
      meta_agendamentos: 1,
      meta_comparecimentos: 1,
    });

    it('aceita o primeiro dia do mes', () => {
      expect(metaSchema.safeParse(montar('2026-08-01')).success).toBe(true);
    });

    it('recusa mes 13, que a regex sozinha deixava passar', () => {
      expect(metaSchema.safeParse(montar('2026-13-01')).success).toBe(false);
    });

    it('continua exigindo o dia 01: competencia e o mes, nao uma data qualquer', () => {
      expect(metaSchema.safeParse(montar('2026-08-15')).success).toBe(false);
    });
  });

  describe('participacaoSchema.data_inicio', () => {
    const montar = (data_inicio: string) => ({
      usuario_id: UUID,
      loja_id: UUID,
      percentual_participacao: 50,
      cargo: 'diretor' as const,
      data_inicio,
    });

    it('aceita vazio: a action cai em hoje()', () => {
      expect(participacaoSchema.safeParse(montar('')).success).toBe(true);
    });

    it('aceita data de calendario', () => {
      expect(participacaoSchema.safeParse(montar('2026-08-25')).success).toBe(true);
    });

    it.each(DATAS_RUINS)('recusa %s (%s)', (valor) => {
      expect(participacaoSchema.safeParse(montar(valor)).success).toBe(false);
    });
  });
});
