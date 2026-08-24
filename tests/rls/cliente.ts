import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Helpers dos testes de RLS.
 *
 * A ideia e simples e deliberada: autenticar como os usuarios reais do seed,
 * usando a ANON KEY, e conferir o que cada um enxerga. Nada de service role
 * aqui — ela ignora RLS, que e exatamente o que queremos exercitar.
 */

export const SENHA_SEED = process.env.SEED_PASSWORD ?? 'CasaCelular@2025';

export const CONTAS = {
  franqueado: 'dono@franqueado.com.br',
  diretor1: 'diretor1@franqueado.com.br',
  diretor2: 'diretor2@franqueado.com.br',
  agendadorLoja1: 'agendador1.loja1@franqueado.com.br',
  agendadorLoja9: 'agendador1.loja9@franqueado.com.br',
} as const;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sem credenciais as suites se pulam, em vez de falharem em vermelho. */
export const rlsConfigurado = Boolean(url && anonKey);

export type ClienteAutenticado = SupabaseClient & { encerrar: () => Promise<void> };

/**
 * Cada chamada cria um cliente proprio, com `persistSession: false`, para as
 * sessoes nao se sobrescreverem entre si dentro do mesmo processo.
 */
export async function entrarComo(email: string): Promise<ClienteAutenticado> {
  const cliente = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA_SEED });
  if (error) {
    throw new Error(
      `Nao foi possivel entrar como ${email}: ${error.message}. ` +
        'Rode `npm run seed:auth` e a migration de seed antes dos testes de RLS.'
    );
  }

  const autenticado = cliente as ClienteAutenticado;
  autenticado.encerrar = async () => {
    await cliente.auth.signOut();
  };
  return autenticado;
}

/**
 * Trava de seguranca: os testes so rodam onde os usuarios do seed existem.
 * Impede que alguem aponte o .env.local para producao e saia escrevendo.
 */
export async function bancoEDeTeste(): Promise<boolean> {
  if (!rlsConfigurado) {
    avisar('faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return false;
  }

  try {
    const cliente = await entrarComo(CONTAS.franqueado);
    const { data } = await cliente.from('usuarios').select('email').eq('email', CONTAS.agendadorLoja1);
    await cliente.encerrar();

    if ((data?.length ?? 0) > 0) return true;

    avisar('o banco responde, mas os usuarios do seed nao estao la');
    return false;
  } catch (excecao) {
    avisar(excecao instanceof Error ? excecao.message : 'nao foi possivel autenticar');
    return false;
  }
}

/**
 * Diz por que as suites vao se pular.
 *
 * POR QUE ISTO IMPORTA
 * `npm run test:rls` sem seed imprime "25 skipped" e sai com codigo zero.
 * Verde que nao testou nada e a pior forma de sinal: quem roda nao distingue
 * "esta tudo certo" de "nada foi verificado", e o comando parece atestar uma
 * seguranca que nao mediu.
 *
 * O modulo e carregado uma vez pelo Node, entao o aviso sai uma vez so, por
 * mais suites que o importem.
 */
let jaAvisou = false;

function avisar(motivo: string): void {
  if (jaAvisou) return;
  jaAvisou = true;

  console.warn(
    [
      '',
      '  ┌─ TESTES DE RLS PULADOS ' + '─'.repeat(38),
      `  │  Motivo: ${motivo.replace(/\.$/, '')}.`,
      '  │',
      '  │  Estes testes autenticam como os usuarios do seed e conferem o',
      '  │  RLS atraves do PostgREST. Sem o seed nao ha como autenticar.',
      '  │',
      '  │  Para rodar:  npm run seed:auth  (e a migration de seed)',
      '  │',
      '  │  O comportamento que eles cobrem tambem e verificado por',
      '  │  `npm run verificar:banco`, direto no Postgres — aquele roda',
      '  │  sempre, inclusive no CI. Nada aqui fica sem cobertura; o que',
      '  │  se perde e a passagem pelo PostgREST e pelo GoTrue.',
      '  └' + '─'.repeat(62),
      '',
    ].join('\n')
  );
}

/** Nomes das lojas do seed sao 'Casa do Celular Loja N'. */
export function numeroDaLoja(nome: string): number {
  const encontrado = nome.match(/Loja (\d+)/);
  return encontrado ? Number(encontrado[1]) : 0;
}
