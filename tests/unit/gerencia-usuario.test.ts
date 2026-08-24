import { describe, expect, it, vi } from 'vitest';

// A funcao e pura, mas mora no modulo de sessao, que chama o `cache` do React
// no carregamento — e fora de uma renderizacao ele nao existe.
vi.mock('react', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));

const { podeGerenciarUsuario } = await import('@/lib/auth/session');

/**
 * Quem pode mexer na conta de quem.
 *
 * A regra vive aqui, e nao so no RLS, porque as acoes que trocam senha ou
 * criam conta usam a Admin API — service role tem BYPASSRLS. Nesses caminhos
 * a checagem da aplicacao e a UNICA barreira, e ja aconteceu de faltar uma
 * nesta base: `criarUsuario` conferia o papel do gestor e nunca o status
 * dele, o que deixava um franqueado desligado criar contas novas.
 */
const TENANT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

const gestor = (role: string, franqueado_id: string | null) =>
  ({ role, franqueado_id }) as Parameters<typeof podeGerenciarUsuario>[0];
const alvo = (franqueado_id: string | null) =>
  ({ franqueado_id }) as Parameters<typeof podeGerenciarUsuario>[1];

describe('podeGerenciarUsuario', () => {
  it('franqueado gerencia quem e do proprio tenant', () => {
    expect(podeGerenciarUsuario(gestor('franqueado', TENANT_A), alvo(TENANT_A))).toBe(true);
  });

  it('franqueado NAO alcanca quem e de outro tenant', () => {
    // Este e o ataque: redefinir a senha de alguem de outro franqueado
    // significa passar a ter a conta dessa pessoa.
    expect(podeGerenciarUsuario(gestor('franqueado', TENANT_A), alvo(TENANT_B))).toBe(false);
  });

  it('super admin alcanca qualquer tenant', () => {
    expect(podeGerenciarUsuario(gestor('super_admin', null), alvo(TENANT_A))).toBe(true);
    expect(podeGerenciarUsuario(gestor('super_admin', null), alvo(TENANT_B))).toBe(true);
  });

  it('diretor e agendador nao gerenciam ninguem', () => {
    expect(podeGerenciarUsuario(gestor('diretor', TENANT_A), alvo(TENANT_A))).toBe(false);
    expect(podeGerenciarUsuario(gestor('agendador', TENANT_A), alvo(TENANT_A))).toBe(false);
  });

  it('nulo com nulo NAO casa', () => {
    // Um franqueado sem tenant e um alvo sem tenant dariam `null === null`.
    // Alvo sem franqueado e outro super admin: liberar isso seria uma brecha
    // disfarcada de comparacao natural.
    expect(podeGerenciarUsuario(gestor('franqueado', null), alvo(null))).toBe(false);
  });

  it('franqueado nao alcanca super admin', () => {
    expect(podeGerenciarUsuario(gestor('franqueado', TENANT_A), alvo(null))).toBe(false);
  });
});
