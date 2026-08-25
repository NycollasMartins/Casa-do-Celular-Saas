import { describe, expect, it } from 'vitest';
import { combinaComBusca } from '@/lib/busca';

/**
 * CPF e telefone sao gravados formatados. A busca comparava o texto digitado
 * direto com o valor gravado, entao so encontrava quem reproduzisse a
 * pontuacao exata — e quem atende digita o numero, nao a mascara.
 */
const ANA = {
  cliente_nome: 'Ana Maria Souza',
  cliente_cpf: '529.982.247-25',
  cliente_telefone: '(11) 99999-9999',
};

describe('combinaComBusca', () => {
  it.each([
    ['529982', 'primeiros digitos do CPF — o ponto caia no meio'],
    ['52998224725', 'CPF inteiro sem pontuacao'],
    ['529.982.247-25', 'CPF com a pontuacao'],
    ['24725', 'final do CPF'],
  ])('encontra por %s (%s)', (termo) => {
    expect(combinaComBusca(ANA, termo)).toBe(true);
  });

  it.each([
    ['11999999999', 'telefone sem pontuacao'],
    ['(11) 99999-9999', 'telefone com a mascara'],
    ['99999', 'trecho do numero'],
  ])('encontra por %s (%s)', (termo) => {
    expect(combinaComBusca(ANA, termo)).toBe(true);
  });

  it.each(['Ana', 'ana maria', 'SOUZA', 'maria'])('encontra por nome: %s', (termo) => {
    expect(combinaComBusca(ANA, termo)).toBe(true);
  });

  it('termo vazio devolve tudo', () => {
    expect(combinaComBusca(ANA, '')).toBe(true);
    expect(combinaComBusca(ANA, '   ')).toBe(true);
  });

  it('nao encontra quem nao combina', () => {
    expect(combinaComBusca(ANA, 'Bruno')).toBe(false);
    expect(combinaComBusca(ANA, '11122233344')).toBe(false);
  });

  it('termo so de texto nao vira busca vazia', () => {
    // Sem a saida antecipada, `soDigitos('bruno')` seria '' e o `includes('')`
    // casaria com TODO MUNDO: a busca por um nome inexistente devolveria a
    // lista inteira, que e pior que devolver nada.
    expect(combinaComBusca(ANA, 'bruno')).toBe(false);
  });

  it('pontuacao digitada no meio nao atrapalha', () => {
    // Alguem cola '529.982' do cadastro: os digitos batem do mesmo jeito.
    expect(combinaComBusca(ANA, '529.982')).toBe(true);
  });

  it('registro anonimizado continua buscavel pelo marcador', () => {
    // Depois do pedido do titular sobra '000.000.000-00'. Quem procurar por
    // zeros precisa encontrar — e a forma de conferir o que foi anonimizado.
    const anonimo = {
      cliente_nome: 'Cliente anonimizado',
      cliente_cpf: '000.000.000-00',
      cliente_telefone: '(00) 00000-0000',
    };

    expect(combinaComBusca(anonimo, '000')).toBe(true);
    expect(combinaComBusca(anonimo, 'anonimizado')).toBe(true);
  });
});
