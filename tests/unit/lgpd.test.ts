import { describe, expect, it } from 'vitest';
import {
  MARCADOR,
  MESES_RETENCAO_PADRAO,
  camposAnonimizados,
  dataLimiteRetencao,
  estaAnonimizado,
  normalizarCpfParaBusca,
  subtrairMeses,
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
  // Meio-dia UTC = 9h em Brasilia: mesma data nos dois fusos, entao o teste
  // nao depende de qual deles a funcao usa. As versoes anteriores usavam
  // meia-noite UTC — que ja e 21h do dia ANTERIOR em Brasilia — e por isso
  // codificavam a suposicao errada que este modulo passou a corrigir.
  const meioDia = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('recua o prazo padrao a partir de hoje', () => {
    expect(dataLimiteRetencao(MESES_RETENCAO_PADRAO, meioDia('2026-08-20'))).toBe('2024-08-20');
  });

  it('aceita prazo customizado', () => {
    expect(dataLimiteRetencao(6, meioDia('2026-08-20'))).toBe('2026-02-20');
  });

  it('atravessa a virada de ano', () => {
    expect(dataLimiteRetencao(3, meioDia('2026-01-15'))).toBe('2025-10-15');
  });
});

describe('subtrairMeses', () => {
  it('subtrai mes normal', () => {
    expect(subtrairMeses('2026-08-15', 1)).toBe('2026-07-15');
    expect(subtrairMeses('2026-08-15', 24)).toBe('2024-08-15');
  });

  /**
   * DEFEITO CORRIGIDO: `setMonth` transborda quando o mes de destino e mais
   * curto — 2026-03-31 menos 1 mes devolvia 2026-03-03, ainda em marco. A
   * funcao de retencao no banco usa a aritmetica do Postgres, que gruda no
   * ultimo dia; a tela contava os vencidos por uma data quase um mes
   * diferente da que o script usa para anonimizar.
   */
  it('gruda no ultimo dia quando o mes de destino e mais curto', () => {
    expect(subtrairMeses('2026-03-31', 1)).toBe('2026-02-28');
    expect(subtrairMeses('2026-05-31', 1)).toBe('2026-04-30');
    expect(subtrairMeses('2026-07-31', 1)).toBe('2026-06-30');
  });

  it('respeita fevereiro em ano bissexto', () => {
    expect(subtrairMeses('2028-03-31', 1)).toBe('2028-02-29');
    expect(subtrairMeses('2026-03-31', 13)).toBe('2025-02-28');
  });

  it('atravessa a virada de ano', () => {
    expect(subtrairMeses('2026-01-15', 1)).toBe('2025-12-15');
    expect(subtrairMeses('2026-01-31', 2)).toBe('2025-11-30');
  });

  it('subtrair zero devolve a mesma data', () => {
    expect(subtrairMeses('2026-08-20', 0)).toBe('2026-08-20');
  });
});

describe('dataLimiteRetencao no fuso das lojas', () => {
  it('usa o hoje das lojas, nao o do processo', () => {
    // 01h UTC de 21/08 = 22h de 20/08 em Brasilia.
    expect(dataLimiteRetencao(24, new Date('2026-08-21T01:00:00Z'))).toBe('2024-08-20');
  });
});
