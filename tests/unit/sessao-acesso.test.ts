import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/**
 * `usuarioComAcesso` e a guarda das Server Action.
 *
 * O DEFEITO QUE ELA FECHA
 * `buscarUsuarioAtual` devolve a linha de quem foi desligado — de proposito:
 * o RLS libera todo mundo a ler a PROPRIA linha para a aplicacao poder dizer
 * "seu acesso foi encerrado" em vez de mostrar tela vazia.
 *
 * Nas acoes que gravam com o cliente normal isso era inofensivo, porque o RLS
 * barra o desligado. Mas `criarUsuario` grava com SERVICE ROLE — a Admin API
 * precisa disso para criar a conta em auth.users — e service role ignora RLS.
 * A guarda daquela action conferia o PAPEL, nunca o status.
 *
 * Entao um franqueado desligado, enquanto o access token nao expirasse, ainda
 * criava usuario novo no proprio tenant, com o papel que quisesse, e voltava a
 * entrar por essa conta. O desligamento durava o tempo de um token.
 */

const perfil = {
  id: 'u1',
  email: 'dono@x.com',
  nome: 'Dono',
  role: 'franqueado',
  franqueado_id: 'f1',
  status: 'ativo',
};

let linha: Record<string, unknown> | null = perfil;

// `cache` do React so existe dentro de uma renderizacao de Server Component.
// Fora dela e undefined, e o modulo nem carrega. Identidade e o dublê certo:
// o que `cache` faz e memorizar por renderizacao, e no teste nao ha nenhuma.
vi.mock('react', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('react')>()),
  cache: (fn: unknown) => fn,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: linha, error: null }) }),
      }),
    }),
  }),
}));

const { usuarioComAcesso } = await import('@/lib/auth/session');

describe('usuarioComAcesso', () => {
  it('devolve quem esta ativo', async () => {
    linha = { ...perfil, status: 'ativo' };

    expect(await usuarioComAcesso()).toMatchObject({ id: 'u1', role: 'franqueado' });
  });

  it('recusa quem foi desligado, mesmo com sessao valida', async () => {
    // A sessao continua valendo: revogar no Auth invalida o refresh token, e o
    // access token ja emitido vale ate expirar. Quem fecha essa janela e esta
    // guarda.
    linha = { ...perfil, status: 'inativo' };

    expect(await usuarioComAcesso()).toBeNull();
  });

  it('recusa status desconhecido, em vez de aceitar por omissao', async () => {
    // Se um status novo entrar no banco, a guarda precisa errar para o lado
    // seguro — negar — e nao liberar por nao reconhecer o valor.
    linha = { ...perfil, status: 'suspenso' };

    expect(await usuarioComAcesso()).toBeNull();
  });

  it('recusa quando nao ha perfil', async () => {
    linha = null;

    expect(await usuarioComAcesso()).toBeNull();
  });
});

describe('quem usa qual guarda', () => {
  /**
   * `buscarUsuarioAtual` continua existindo porque `exigirUsuario` precisa
   * dela: para deslogar o desligado com uma mensagem, e preciso primeiro
   * enxergar que ele existe e esta inativo.
   *
   * Mas fora dali ela nao serve como autorizacao. O teste existe porque a
   * diferenca entre as duas e invisivel no ponto de uso — as duas devolvem
   * `Usuario | null`, e trocar uma pela outra nao quebra nada que se veja.
   */
  const permitidos = ['lib/auth/session.ts'];

  it('so o proprio modulo de sessao usa buscarUsuarioAtual', () => {
    const arquivos = execSync(
      "grep -rl 'buscarUsuarioAtual' app lib --include='*.ts' --include='*.tsx' || true",
      { encoding: 'utf8' }
    )
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(arquivos.filter((a) => !permitidos.includes(a))).toEqual([]);
  });

  it('toda Server Action passa por usuarioComAcesso', () => {
    const acoes = execSync("find app/actions -name '*.ts'", { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);

    const semGuarda = acoes.filter((caminho) => {
      const fonte = readFileSync(caminho, 'utf8');
      // auth.ts trata login e troca de senha: nao ha usuario logado ainda.
      if (!fonte.includes('usuarioComAcesso') && !caminho.endsWith('auth.ts')) return true;
      return false;
    });

    expect(semGuarda).toEqual([]);
  });
});
