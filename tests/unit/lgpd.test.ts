import { describe, expect, it } from 'vitest';
import {
  MARCADOR,
  MESES_RETENCAO_PADRAO,
  camposAnonimizados,
  dataLimiteRetencao,
  estaAnonimizado,
  normalizarCpfParaBusca,
} from '@/lib/lgpd';

describe('camposAnonimizados', () => {
  it('limpa todos os campos que identificam a pessoa', () => {
    const campos = camposAnonimizados(new Date('2026-08-20T12:00:00Z'));

    expect(campos.cliente_nome).toBe(MARCADOR.nome);
    expect(campos.cliente_cpf).toBe(MARCADOR.cpf);
    expect(campos.cliente_telefone).toBe(MARCADOR.telefone);
    expect(campos.cliente_email).toBeNull();
  });

  /**
   * `observacoes` e campo livre, onde na pratica aparecem anotacoes como
   * "irma da Dona Maria, mora na quadra 12". Deixar de limpar seria vazar
   * dado pessoal por uma coluna que nao tem "cliente" no nome.
   */
  it('limpa tambem as observacoes, que sao campo livre', () => {
    expect(camposAnonimizados().observacoes).toBeNull();
  });

  it('registra quando a anonimizacao aconteceu', () => {
    const campos = camposAnonimizados(new Date('2026-08-20T12:00:00Z'));
    expect(campos.anonimizado_em).toBe('2026-08-20T12:00:00.000Z');
  });

  /**
   * Marcador que variasse por pessoa (um hash do CPF, por exemplo)
   * permitiria reidentificar por comparacao: seria pseudonimizacao, que a
   * LGPD ainda trata como dado pessoal.
   */
  it('usa marcadores fixos, iguais para todo mundo', () => {
    const um = camposAnonimizados();
    const outro = camposAnonimizados();

    expect(um.cliente_nome).toBe(outro.cliente_nome);
    expect(um.cliente_cpf).toBe(outro.cliente_cpf);
    expect(um.cliente_telefone).toBe(outro.cliente_telefone);
  });

  it('o CPF marcador nao passa na validacao de CPF real', async () => {
    const { validarCpf } = await import('@/lib/utils');
    expect(validarCpf(MARCADOR.cpf)).toBe(false);
  });
});

describe('estaAnonimizado', () => {
  it('reconhece registro ja tratado', () => {
    expect(estaAnonimizado({ anonimizado_em: '2026-08-20T12:00:00Z' })).toBe(true);
  });

  it('reconhece registro com dados pessoais', () => {
    expect(estaAnonimizado({ anonimizado_em: null })).toBe(false);
  });
});

describe('normalizarCpfParaBusca', () => {
  it('formata como o banco guarda, a partir de digitos soltos', () => {
    expect(normalizarCpfParaBusca('52998224725')).toBe('529.982.247-25');
  });

  it('aceita CPF ja mascarado', () => {
    expect(normalizarCpfParaBusca('529.982.247-25')).toBe('529.982.247-25');
  });

  it('aceita separadores diferentes', () => {
    expect(normalizarCpfParaBusca('529 982 247 25')).toBe('529.982.247-25');
  });

  it('recusa quantidade de digitos diferente de 11', () => {
    expect(normalizarCpfParaBusca('5299822472')).toBeNull();
    expect(normalizarCpfParaBusca('529982247250')).toBeNull();
    expect(normalizarCpfParaBusca('')).toBeNull();
  });
});

describe('dataLimiteRetencao', () => {
  it('recua o prazo padrao a partir de hoje', () => {
    expect(dataLimiteRetencao(MESES_RETENCAO_PADRAO, new Date('2026-08-20T00:00:00Z'))).toBe(
      '2024-08-20'
    );
  });

  it('aceita prazo customizado', () => {
    expect(dataLimiteRetencao(6, new Date('2026-08-20T00:00:00Z'))).toBe('2026-02-20');
  });

  it('atravessa a virada de ano', () => {
    expect(dataLimiteRetencao(3, new Date('2026-01-15T00:00:00Z'))).toBe('2025-10-15');
  });
});
