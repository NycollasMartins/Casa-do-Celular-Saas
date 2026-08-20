import { describe, expect, it } from 'vitest';
import { montarTemplateLembrete, normalizarTelefoneBr } from '@/lib/whatsapp';

describe('normalizarTelefoneBr', () => {
  it('aceita o formato que o agendador digita, com mascara', () => {
    expect(normalizarTelefoneBr('(61) 99999-0001')).toBe('5561999990001');
  });

  it('aceita so os digitos', () => {
    expect(normalizarTelefoneBr('61999990001')).toBe('5561999990001');
  });

  it('aceita numero que ja veio com o codigo do pais', () => {
    expect(normalizarTelefoneBr('+55 61 99999-0001')).toBe('5561999990001');
    expect(normalizarTelefoneBr('5561999990001')).toBe('5561999990001');
  });

  it('aceita o prefixo internacional discado', () => {
    expect(normalizarTelefoneBr('005561999990001')).toBe('5561999990001');
  });

  it('remove o zero de operadora antes do DDD', () => {
    expect(normalizarTelefoneBr('061999990001')).toBe('5561999990001');
  });

  it('aceita telefone fixo', () => {
    expect(normalizarTelefoneBr('(61) 3333-0001')).toBe('556133330001');
    expect(normalizarTelefoneBr('+55 61 3333-0001')).toBe('556133330001');
  });

  /**
   * O intervalo 11-99 nao e continuo: 20, 23, 30, 60 e outros nunca foram
   * atribuidos. Aceitar um deles produz numero que a Meta rejeita e que
   * ninguem consegue explicar depois.
   */
  it('recusa DDD que nao existe', () => {
    for (const ddd of ['20', '23', '26', '30', '39', '60', '80', '90']) {
      expect(normalizarTelefoneBr(`${ddd}999990001`)).toBeNull();
    }
  });

  it('aceita os DDDs das pontas', () => {
    expect(normalizarTelefoneBr('11999990001')).toBe('5511999990001');
    expect(normalizarTelefoneBr('99999990001')).toBe('5599999990001');
  });

  it('recusa celular de 9 digitos que nao comeca com 9', () => {
    expect(normalizarTelefoneBr('61899990001')).toBeNull();
  });

  it('recusa fixo que nao comeca entre 2 e 5', () => {
    expect(normalizarTelefoneBr('6113330001')).toBeNull();
    expect(normalizarTelefoneBr('6193330001')).toBeNull();
  });

  it('recusa quantidade de digitos invalida', () => {
    expect(normalizarTelefoneBr('619999')).toBeNull();
    expect(normalizarTelefoneBr('6199999000123')).toBeNull();
    expect(normalizarTelefoneBr('')).toBeNull();
  });

  /** Recusar e melhor que adivinhar: numero errado entrega a um estranho. */
  it('recusa texto sem digito', () => {
    expect(normalizarTelefoneBr('nao informado')).toBeNull();
    expect(normalizarTelefoneBr('-')).toBeNull();
  });
});

describe('montarTemplateLembrete', () => {
  const parametros = { nome: 'Ana', loja: 'Casa do Celular Loja 1', data: '01/09' };

  it('usa template, nao texto livre', () => {
    const corpo = montarTemplateLembrete('5561999990001', parametros);
    expect(corpo.type).toBe('template');
    expect(corpo.messaging_product).toBe('whatsapp');
  });

  /**
   * A ordem e posicional na API da Meta ({{1}}, {{2}}...). Trocar dois
   * parametros de lugar entrega uma mensagem que diz a coisa errada, sem
   * erro nenhum — por isso a ordem esta fixada em teste.
   */
  it('mantem a ordem dos parametros do template', () => {
    const corpo = montarTemplateLembrete('5561999990001', parametros);
    const textos = corpo.template.components[0].parameters.map((p) => p.text);
    expect(textos).toEqual(['Ana', 'Casa do Celular Loja 1', '01/09']);
  });

  it('envia para o destino informado', () => {
    expect(montarTemplateLembrete('5511988887777', parametros).to).toBe('5511988887777');
  });
});
