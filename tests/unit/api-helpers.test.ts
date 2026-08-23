import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A resposta de erro das rotas de API nao pode carregar a mensagem interna.
 *
 * Erro do PostgREST traz nome de coluna, nome de constraint e as vezes o valor
 * que causou a violacao. Devolver isso na resposta entrega detalhe de schema a
 * qualquer pessoa autenticada — inclusive ao agendador, que e o papel de menor
 * privilegio e nao deveria aprender nada sobre a estrutura do banco por
 * tentativa e erro.
 */

vi.mock('@sentry/nextjs', () => ({
  captureException: () => 'id-do-evento',
}));

// api-helpers importa a sessao, que chama o `cache` do React no carregamento
// do modulo — fora de uma renderizacao ele nao existe. O alvo do teste e a
// formatacao da resposta, nao a autenticacao.
vi.mock('@/lib/auth/session', () => ({ usuarioComAcesso: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ verificarRateLimit: async () => ({ permitido: true }) }));

const { erroServidor } = await import('@/lib/api-helpers');

describe('erroServidor', () => {
  // A funcao registra a excecao inteira no log do servidor, de proposito. Aqui
  // isso so sujaria a saida do teste.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('nao devolve a mensagem da excecao', async () => {
    const vazamento =
      'duplicate key value violates unique constraint "vendas_agendamento_id_key" (agendamento_id)=(abc)';

    const corpo = await erroServidor(new Error(vazamento)).json();

    expect(JSON.stringify(corpo)).not.toContain('constraint');
    expect(JSON.stringify(corpo)).not.toContain('agendamento_id');
    expect(corpo.erro).toBe('Nao foi possivel completar a operacao.');
  });

  it('devolve um codigo para o chamado ficar rastreavel', async () => {
    // Sem o codigo, "deu erro" nao vira nada investigavel: o log do servidor
    // tem a excecao, mas nada liga o relato de quem usou ao registro certo.
    const corpo = await erroServidor(new Error('qualquer coisa')).json();

    expect(corpo.codigo).toBe('id-do-evento');
  });

  it('responde 500', () => {
    expect(erroServidor(new Error('x')).status).toBe(500);
  });

  it('aguenta excecao que nao e Error', async () => {
    const corpo = await erroServidor('texto solto').json();

    expect(corpo.erro).toBe('Nao foi possivel completar a operacao.');
  });
});
