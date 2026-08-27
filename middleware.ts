import { NextResponse, type NextRequest } from 'next/server';
import { atualizarSessao } from '@/lib/supabase/middleware';

const ROTAS_PUBLICAS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/callback'];

/**
 * Abertas a todos: nao exigem sessao E nao redirecionam quem ja entrou.
 * A politica de privacidade precisa ser alcancavel pelo titular dos dados,
 * que normalmente nao tem conta no sistema — mandar quem esta logado para o
 * dashboard ao clicar nela seria um beco sem saida.
 */
const ROTAS_ABERTAS = [
  '/privacidade',
  // Diz se o deploy esta configurado. Precisa responder justamente quando
  // ninguem consegue entrar — exigir sessao a tornaria inutil.
  '/api/saude',
  // Tunel do Sentry (tunnelRoute). Se o middleware exigisse sessao aqui, o
  // relatorio de erro seria redirecionado para o login e nunca chegaria —
  // e o erro mais importante de capturar e justamente o de quem nao
  // conseguiu autenticar.
  '/monitoring',
  // Resgate de convite. Fica em ROTAS_ABERTAS, e nao em ROTAS_PUBLICAS, por
  // duas razoes: quem chega aqui nao tem conta, e quem JA tem (voce, testando
  // o proprio link) nao pode ser mandado para o dashboard antes de ver a tela.
  '/convite',
];

/** Exige sessao, mas nao pode ser bloqueada pela troca de senha obrigatoria. */
const ROTA_NOVA_SENHA = '/auth/nova-senha';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rota aberta sai ANTES de tocar no Supabase.
  //
  // Nao e so economia: sem as variaveis de ambiente, `atualizarSessao`
  // lanca ao criar o cliente, e a requisicao nunca chega ao destino. O
  // /api/saude existe justamente para dizer que a configuracao esta
  // faltando — se ele dependesse dessa mesma configuracao, so responderia
  // quando ja nao fosse necessario.
  if (ROTAS_ABERTAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))) {
    return NextResponse.next();
  }

  const { response, user } = await atualizarSessao(request);
  // Limite de segmento, como em ROTAS_ABERTAS. Com `startsWith` cru, qualquer
  // rota futura cujo caminho comece com um destes prefixos — `/auth/registrar-
  // parceiro`, digamos — nasceria publica sem ninguem decidir isso.
  const rotaPublica = ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );

  if (!user && !rotaPublica && pathname !== ROTA_NOVA_SENHA) {
    // Requisicao de dados recebe 401 em JSON; so navegacao vai para o login.
    //
    // Sem esta distincao o middleware redirecionava /api/* para a tela de
    // login, o `fetch` seguia o redirect e recebia HTML com status 200 — ou
    // seja, `resposta.ok` era true e o `.json()` estourava com SyntaxError.
    // O usuario via "Unexpected token '<'" no lugar de "sessao expirada".
    //
    // O criterio e o Accept: navegacao de documento pede text/html, fetch
    // nao. Isso mantem o link de download do CSV indo para o login, que e o
    // comportamento certo para um clique do usuario.
    if (pathname.startsWith('/api/') && !request.headers.get('accept')?.includes('text/html')) {
      return NextResponse.json({ erro: 'Nao autenticado' }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Senha provisoria nao navega no sistema: so a tela de troca e o logout.
  // A flag e limpa por definirNovaSenha, entao o bloqueio se desfaz sozinho.
  if (user?.user_metadata?.senha_provisoria === true && pathname !== ROTA_NOVA_SENHA) {
    const url = request.nextUrl.clone();
    url.pathname = ROTA_NOVA_SENHA;
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && rotaPublica && pathname !== '/auth/callback') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
