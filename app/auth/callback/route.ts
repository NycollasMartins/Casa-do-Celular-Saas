import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { destinoSeguro } from '@/lib/rede';

/**
 * Troca o code do e-mail (recuperacao/convite) por uma sessao.
 *
 * O `next` PASSA POR CONFERENCIA
 * Ele nao e explorável hoje: chegar ao redirecionamento exige um `code`
 * valido, e o `next` do e-mail e escrito pelo proprio servidor — quem manda
 * um `next` proprio nao tem code, e cai no login. E mina, nao buraco aberto.
 *
 * Mas concatenar `origin` com texto de fora nao protege como parece.
 * `//evil.com` realmente fica no dominio; `@evil.com` transforma o dominio em
 * userinfo e o host vira evil.com; e `.evil.com` produz
 * `casadocelular.netlify.app.evil.com`, um subdominio que qualquer um
 * registra e que fica convincente na barra de endereco.
 *
 * Uma linha separa "nao da para explorar hoje" de "nao da para explorar".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const proximo = destinoSeguro(searchParams.get('next'));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(proximo, origin));
  }

  return NextResponse.redirect(`${origin}/auth/login?erro=link_invalido`);
}
