import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashDoToken, pareceToken } from '@/lib/convites';
import { ConviteForm } from './convite-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Criar acesso · Casa do Celular' };

/**
 * Tela publica de resgate do convite.
 *
 * Ela apenas CONFERE o convite; quem o consome e a action, no envio do
 * formulario. Se abrir a pagina ja marcasse como usado, um link visitado por
 * curiosidade — ou pelo preview de um aplicativo de mensagem, que busca a URL
 * para montar o cartao — queimaria o convite antes de o cliente digitar o
 * primeiro campo.
 *
 * Le com service role porque nao ha sessao aqui: a policy de `convites` exige
 * super admin, e quem chega nesta tela ainda nao tem conta nenhuma.
 */
export default async function ConvitePage({ params }: { params: { token: string } }) {
  if (!pareceToken(params.token)) return <ConviteInvalido />;

  const { data: convite } = await createAdminClient()
    .from('convites')
    .select('id, usado_em, expira_em')
    .eq('token_hash', hashDoToken(params.token))
    .maybeSingle();

  // Um so desfecho para inexistente, usado e expirado. Distinguir ajudaria
  // mais quem esta testando tokens do que quem tem um convite legitimo.
  if (!convite || convite.usado_em || new Date(convite.expira_em) <= new Date()) {
    return <ConviteInvalido />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar o acesso da sua rede</CardTitle>
        <CardDescription>
          Preencha os dados da empresa e escolha sua senha. Depois disso voce cadastra suas lojas
          e sua equipe sozinho.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConviteForm token={params.token} />
      </CardContent>
    </Card>
  );
}

function ConviteInvalido() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Convite indisponivel</CardTitle>
        <CardDescription>
          Este link nao vale mais. Pode ter expirado ou ja ter sido usado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-600">
        <p>Peca um convite novo a quem lhe enviou este link.</p>
        <Link href="/auth/login" className="inline-block text-brand hover:underline">
          Ja tenho acesso
        </Link>
      </CardContent>
    </Card>
  );
}
