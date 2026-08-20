import { NextResponse, type NextRequest } from 'next/server';
import { atualizarSessao } from '@/lib/supabase/middleware';

const ROTAS_PUBLICAS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/callback'];

/** Exige sessao, mas nao pode ser bloqueada pela troca de senha obrigatoria. */
const ROTA_NOVA_SENHA = '/auth/nova-senha';

export async function middleware(request: NextRequest) {
  const { response, user } = await atualizarSessao(request);
  const { pathname } = request.nextUrl;
  const rotaPublica = ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota));

  if (!user && !rotaPublica && pathname !== ROTA_NOVA_SENHA) {
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
