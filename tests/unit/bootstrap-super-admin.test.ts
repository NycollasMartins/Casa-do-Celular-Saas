import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const executar = promisify(execFile);

/**
 * O bootstrap da primeira conta de super admin.
 *
 * POR QUE ESTE TESTE EXISTE
 * `scripts/criar-super-admin.mjs` e o unico caminho para a primeira conta de
 * uma instalacao, e ele roda com a chave de servico — que ignora RLS e
 * atravessa o trigger de campos sensiveis (migration 013), porque `auth.uid()`
 * e nulo nesse caminho. Nenhuma barreira do banco vale aqui: as unicas
 * barreiras sao as que o proprio script impoe.
 *
 * Isso muda o que precisa ser verificado. Nao basta o script conseguir criar
 * a conta; ele precisa se RECUSAR quando nao deve, e desfazer o que fez
 * quando para no meio.
 *
 * COMO, SEM SUPABASE
 * A Admin API e o PostgREST sao HTTP. Um servidor local responde no lugar
 * deles, com o formato que o `@supabase/supabase-js` espera, e registra o que
 * foi pedido — e o registro e onde mora a asserção que importa: numa recusa,
 * `POST /auth/v1/admin/users` nao pode aparecer.
 *
 * Subir um Supabase de verdade exigiria Docker e nao caberia num teste
 * unitario. A troca e consciente: isto cobre a decisao do script, e nao o
 * comportamento do GoTrue.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'criar-super-admin.mjs');
const CONTA_CRIADA = '3f1b2c44-8a6e-4d71-9c05-2b7e6a91d0f3';

interface Pedido {
  metodo: string;
  caminho: string;
  corpo: unknown;
}

interface Cenario {
  /** Linhas devolvidas na consulta por super admins ja existentes. */
  superAdmins?: Array<{ email: string; status: string }>;
  /** Faz o insert do perfil falhar, para exercitar o desfazimento. */
  perfilFalha?: boolean;
  /** Faz o proprio desfazimento falhar. */
  desfazimentoFalha?: boolean;
}

let servidor: Server;
let endereco: string;
let pedidos: Pedido[] = [];
let cenario: Cenario = {};

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let bruto = '';
    req.on('data', (pedaco) => (bruto += pedaco));
    req.on('end', () => {
      const caminho = (req.url ?? '').split('?')[0];
      pedidos.push({
        metodo: req.method ?? '',
        caminho,
        corpo: bruto ? JSON.parse(bruto) : null,
      });

      const responder = (codigo: number, corpo: unknown) => {
        res.writeHead(codigo, { 'Content-Type': 'application/json' });
        res.end(corpo === null ? '' : JSON.stringify(corpo));
      };

      // Consulta por super admins existentes.
      if (req.method === 'GET' && caminho === '/rest/v1/usuarios') {
        return responder(200, cenario.superAdmins ?? []);
      }

      // Admin API criando a conta de login.
      // O id precisa ser um UUID de verdade: o `@supabase/auth-js` valida o
      // formato antes de montar a URL do desfazimento, e LANCA se nao for.
      if (req.method === 'POST' && caminho === '/auth/v1/admin/users') {
        return responder(200, { id: CONTA_CRIADA, email: (bruto && JSON.parse(bruto).email) || '' });
      }

      // Desfazimento.
      if (req.method === 'DELETE' && caminho.startsWith('/auth/v1/admin/users/')) {
        return cenario.desfazimentoFalha
          ? responder(500, { message: 'indisponivel' })
          : responder(200, {});
      }

      // Insert do perfil em public.usuarios.
      if (req.method === 'POST' && caminho === '/rest/v1/usuarios') {
        if (cenario.perfilFalha) {
          return responder(400, {
            message: 'column "status" of relation "usuarios" does not exist',
            code: '42703',
          });
        }
        return responder(201, null);
      }

      return responder(404, { message: `sem rota para ${req.method} ${caminho}` });
    });
  });

  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = (servidor.address() as { port: number }).port;
  endereco = `http://127.0.0.1:${porta}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

/**
 * `cwd` num diretorio vazio de proposito: o script carrega `.env.local` do
 * diretorio corrente, e o do repositorio aponta para o Supabase de producao.
 * Rodar daqui garante que um teste jamais alcance o banco real.
 */
const VAZIO = mkdtempSync(join(tmpdir(), 'bootstrap-'));

async function rodar(...args: string[]) {
  pedidos = [];
  try {
    const { stdout } = await executar('node', [SCRIPT, ...args], {
      cwd: VAZIO,
      // Ambiente montado do zero, sem herdar o do processo: se o shell tiver
      // as chaves de producao exportadas, herdar as traria para ca.
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: endereco,
        SUPABASE_SERVICE_ROLE_KEY: 'chave-de-mentira',
        NEXT_PUBLIC_SITE_URL: 'https://exemplo.test',
      },
    });
    return { saida: 0, texto: stdout };
  } catch (erro) {
    const e = erro as { code: number; stdout: string; stderr: string };
    return { saida: e.code, texto: e.stdout + e.stderr };
  }
}

const criouLogin = () =>
  pedidos.some((p) => p.metodo === 'POST' && p.caminho === '/auth/v1/admin/users');

describe('bootstrap do primeiro super admin', () => {
  it('recusa quando o banco ja tem um super admin, sem criar nada', async () => {
    cenario = { superAdmins: [{ email: 'dono@rede.com.br', status: 'ativo' }] };

    const { saida, texto } = await rodar('--nome', 'Segundo Dono', '--email', 'segundo@rede.com.br');

    expect(saida).toBe(1);
    expect(texto).toContain('dono@rede.com.br');
    // O que de fato protege: a recusa acontece ANTES da Admin API.
    expect(criouLogin()).toBe(false);
  });

  it('conta super admin desligado como instalacao ja inicializada', async () => {
    // Status 'inativo' tira o acesso hoje, mas a tela de Equipe reativa. A
    // pergunta que a recusa faz e "este banco ja foi inicializado?", e uma
    // conta desligada responde que sim.
    cenario = { superAdmins: [{ email: 'antigo@rede.com.br', status: 'inativo' }] };

    const { saida, texto } = await rodar('--nome', 'Novo Dono', '--email', 'novo@rede.com.br');

    expect(saida).toBe(1);
    expect(texto).toContain('inativo');
    expect(criouLogin()).toBe(false);
  });

  it('cria a conta quando nao ha nenhum super admin', async () => {
    cenario = { superAdmins: [] };

    const { saida, texto } = await rodar('--nome', 'Dona da Rede', '--email', 'Dona@Rede.com.br');

    expect(saida).toBe(0);

    const login = pedidos.find((p) => p.caminho === '/auth/v1/admin/users')?.corpo as {
      email: string;
      user_metadata: { senha_provisoria: boolean };
    };

    // Sem esta marca o middleware nao exige a troca e a senha gerada aqui
    // valeria para sempre — o defeito que separa este script do seed.
    expect(login.user_metadata.senha_provisoria).toBe(true);
    expect(login.email).toBe('dona@rede.com.br');

    const perfil = pedidos.find((p) => p.caminho === '/rest/v1/usuarios' && p.metodo === 'POST')
      ?.corpo as { role: string; franqueado_id: null };

    expect(perfil.role).toBe('super_admin');
    // A constraint usuarios_franqueado_obrigatorio dispensa o tenant para
    // super admin, e e o que permite criar a conta antes de existir franqueado.
    expect(perfil.franqueado_id).toBeNull();

    expect(texto).toContain('NAO SERA MOSTRADA DE NOVO');
  });

  it('desfaz a conta de login quando o perfil nao pode ser salvo', async () => {
    // Conta de auth sem perfil nao entra em lugar nenhum: o middleware busca
    // o papel, nao acha e derruba. Pior, ela bloquearia uma nova tentativa
    // com o mesmo e-mail.
    cenario = { superAdmins: [], perfilFalha: true };

    const { saida } = await rodar('--nome', 'Dona da Rede', '--email', 'dona@rede.com.br');

    expect(saida).toBe(1);
    expect(
      pedidos.some(
        (p) => p.metodo === 'DELETE' && p.caminho === `/auth/v1/admin/users/${CONTA_CRIADA}`
      )
    ).toBe(true);
  });

  it('avisa que a conta ficou para tras quando nem o desfazimento funciona', async () => {
    // O pior caso: perfil falhou E a limpeza falhou. Sem este aviso, quem
    // rodou tenta de novo e recebe "e-mail ja cadastrado", sem ligar uma
    // coisa na outra.
    cenario = { superAdmins: [], perfilFalha: true, desfazimentoFalha: true };

    const { saida, texto } = await rodar('--nome', 'Dona da Rede', '--email', 'dona@rede.com.br');

    expect(saida).toBe(1);
    expect(texto).toContain('NAO pode ser desfeita');
    expect(texto).toContain('Authentication > Users');
  });

  it('nao cria nenhuma senha igual a outra', async () => {
    cenario = { superAdmins: [] };

    const senhas = new Set<string>();
    for (let i = 0; i < 5; i++) {
      await rodar('--nome', 'Dona da Rede', '--email', 'dona@rede.com.br');
      senhas.add((pedidos.find((p) => p.caminho === '/auth/v1/admin/users')?.corpo as { password: string }).password);
    }

    expect(senhas.size).toBe(5);
  });
});
