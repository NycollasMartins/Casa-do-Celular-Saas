import { describe, expect, it } from 'vitest';
import { ipDoCliente } from '@/lib/rede';

/**
 * A rota aberta de saude limita por IP. Se o identificador vier de um
 * cabecalho que o proprio cliente escreve, o limite nao limita nada: basta
 * mandar um valor diferente a cada chamada.
 *
 * O efeito colateral e pior que a falta do teto — o contador em memoria guarda
 * uma entrada por chave, entao cada valor inventado vira memoria ocupada.
 */

const cabecalhos = (pares: Record<string, string>) => new Headers(pares);

describe('ipDoCliente', () => {
  it('prefere o cabecalho da plataforma ao que o cliente mandou', () => {
    const ip = ipDoCliente(
      cabecalhos({
        'x-forwarded-for': '1.2.3.4',
        'x-nf-client-connection-ip': '203.0.113.7',
      })
    );

    expect(ip).toBe('203.0.113.7');
  });

  it('nao se deixa enganar por lista forjada antes do IP real', () => {
    // O cliente manda "1.2.3.4" e a borda acrescenta o IP verdadeiro. Ler o
    // primeiro da lista devolveria o valor inventado.
    const ip = ipDoCliente(
      cabecalhos({
        'x-forwarded-for': '1.2.3.4, 203.0.113.7',
        'cf-connecting-ip': '203.0.113.7',
      })
    );

    expect(ip).toBe('203.0.113.7');
  });

  it('cai para x-forwarded-for quando nao ha cabecalho de borda', () => {
    // Melhor um identificador fraco que um unico identificador para todos —
    // com um so, uma pessoa esgotaria o teto de todo mundo.
    expect(ipDoCliente(cabecalhos({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }))).toBe(
      '198.51.100.9'
    );
  });

  it('devolve um valor mesmo sem cabecalho nenhum', () => {
    expect(ipDoCliente(cabecalhos({}))).toBe('desconhecido');
  });

  it('ignora cabecalho vazio em vez de aceitar string em branco', () => {
    // Cabecalho presente e vazio existe; aceitar '' juntaria todo mundo numa
    // chave so, que e o mesmo que nao ter limite por IP.
    expect(ipDoCliente(cabecalhos({ 'x-nf-client-connection-ip': '  ', 'x-real-ip': '203.0.113.1' }))).toBe(
      '203.0.113.1'
    );
  });
});
