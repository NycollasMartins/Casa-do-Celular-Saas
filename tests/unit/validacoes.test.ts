import { describe, expect, it } from 'vitest';
import { mascararCpf, mascararTelefone, validarCpf } from '@/lib/utils';
import { agendamentoSchema } from '@/lib/validations/agendamento';
import { novaSenhaSchema } from '@/lib/validations/auth';

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
