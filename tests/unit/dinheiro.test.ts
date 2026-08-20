import { describe, expect, it } from 'vitest';
import { formatarBrl, lerValorBrl, ticketMedio } from '@/lib/dinheiro';

describe('lerValorBrl', () => {
  it('le o formato completo em pt-BR', () => {
    expect(lerValorBrl('1.234,56')).toBe(1234.56);
    expect(lerValorBrl('12.345.678,90')).toBe(12345678.9);
  });

  it('le valor so com virgula decimal', () => {
    expect(lerValorBrl('99,90')).toBe(99.9);
    expect(lerValorBrl('0,50')).toBe(0.5);
  });

  it('le numero inteiro sem separador', () => {
    expect(lerValorBrl('1500')).toBe(1500);
  });

  /**
   * O erro de mil vezes: em pt-BR "1.234" e mil duzentos e trinta e quatro,
   * nao um virgula duzentos e trinta e quatro. Um replace ingenuo de virgula
   * por ponto erraria aqui em silencio, num campo de dinheiro.
   */
  it('trata ponto com tres digitos como separador de milhar', () => {
    expect(lerValorBrl('1.234')).toBe(1234);
    expect(lerValorBrl('12.000')).toBe(12000);
  });

  it('trata ponto com um ou dois digitos como decimal digitado em ingles', () => {
    expect(lerValorBrl('1.5')).toBe(1.5);
    expect(lerValorBrl('99.90')).toBe(99.9);
  });

  it('aceita o prefixo R$ que o usuario cola da calculadora', () => {
    expect(lerValorBrl('R$ 1.234,56')).toBe(1234.56);
    expect(lerValorBrl('R$1500')).toBe(1500);
  });

  it('arredonda para centavos', () => {
    expect(lerValorBrl('10,999')).toBe(11);
    expect(lerValorBrl('10,994')).toBe(10.99);
  });

  it('devolve null em vez de NaN quando nao ha numero', () => {
    expect(lerValorBrl('')).toBeNull();
    expect(lerValorBrl('   ')).toBeNull();
    expect(lerValorBrl('abc')).toBeNull();
    expect(lerValorBrl('R$')).toBeNull();
    expect(lerValorBrl('1.2.3,4,5')).toBeNull();
  });

  it('ignora espacos em volta', () => {
    expect(lerValorBrl('  250,00  ')).toBe(250);
  });
});

describe('formatarBrl', () => {
  it('formata com simbolo, milhar e centavos', () => {
    // O Intl usa espaco nao separavel depois do R$; a comparacao normaliza.
    expect(formatarBrl(1234.56).replace(/ /g, ' ')).toBe('R$ 1.234,56');
    expect(formatarBrl(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });

  it('mostra sempre duas casas', () => {
    expect(formatarBrl(10)).toContain('10,00');
  });
});

describe('ticketMedio', () => {
  it('divide receita pela quantidade', () => {
    expect(ticketMedio(1000, 4)).toBe(250);
  });

  it('arredonda para centavos', () => {
    expect(ticketMedio(100, 3)).toBe(33.33);
  });

  it('devolve zero sem vendas, em vez de dividir por zero', () => {
    expect(ticketMedio(0, 0)).toBe(0);
    expect(ticketMedio(500, 0)).toBe(0);
  });

  it('nao quebra com quantidade negativa', () => {
    expect(ticketMedio(500, -1)).toBe(0);
  });
});
