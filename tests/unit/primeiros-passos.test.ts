import { describe, expect, it } from 'vitest';
import { primeiroPasso } from '@/lib/primeiros-passos';

/**
 * Sem loja, o dashboard mostrava zeros e a mensagem "Ajuste o periodo ou
 * registre um novo contato" — que aponta para o lugar errado duas vezes: o
 * problema nao e o periodo, e registrar contato exige uma loja que ainda nao
 * existe.
 */
describe('primeiroPasso', () => {
  it('franqueado recebe acao que ele pode executar', () => {
    const passo = primeiroPasso('franqueado');

    expect(passo.acao?.href).toBe('/dashboard/lojas');
    expect(passo.passos?.length).toBeGreaterThan(1);
  });

  it('super admin e mandado para franqueados, nao para lojas', () => {
    // Ele nao cadastra loja: a loja pertence a um franqueado, e a policy de
    // insert exige o tenant. Mandar para Lojas seria um beco.
    expect(primeiroPasso('super_admin').acao?.href).toBe('/admin/franqueados');
  });

  it.each(['diretor', 'agendador'] as const)('%s nao recebe acao nenhuma', (role) => {
    // Quem depende de outra pessoa nao pode receber um botao: clicar levaria
    // a uma tela sem permissao, o que e pior que nao oferecer nada.
    const passo = primeiroPasso(role);

    expect(passo.acao).toBeUndefined();
    expect(passo.descricao).toMatch(/peca ao/i);
  });

  it('cada papel tem titulo proprio', () => {
    const titulos = (['super_admin', 'franqueado', 'diretor', 'agendador'] as const).map(
      (r) => primeiroPasso(r).titulo
    );

    // Diretor e agendador compartilham o titulo de proposito — os dois estao
    // sem vinculo —, mas gestor e operacao nao podem ler a mesma coisa.
    expect(new Set(titulos).size).toBe(3);
  });
});
