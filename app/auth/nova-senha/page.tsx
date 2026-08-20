import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sair } from '@/app/actions/auth';
import { NovaSenhaForm } from './nova-senha-form';

export const metadata = { title: 'Definir senha · Casa do Celular' };

/**
 * Chegam aqui dois fluxos: quem clicou no link de recuperacao (ja logado
 * pelo /auth/callback) e quem entrou com senha provisoria e foi barrado
 * pelo middleware. O texto muda; o formulario e o mesmo.
 */
export default async function NovaSenhaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem sessao nao ha o que atualizar: o link expirou ou foi aberto solto.
  if (!user) redirect('/auth/forgot-password');

  const primeiroAcesso = user.user_metadata?.senha_provisoria === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{primeiroAcesso ? 'Crie sua senha' : 'Definir nova senha'}</CardTitle>
        <CardDescription>
          {primeiroAcesso
            ? 'Voce esta usando a senha provisoria que recebeu. Escolha uma senha sua para continuar.'
            : 'Escolha a senha que passara a valer para sua conta.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NovaSenhaForm />

        {/* Sem esta saida, quem entra com senha provisoria fica preso: o
            middleware redireciona todas as outras rotas para ca. */}
        <form action={sair}>
          <button
            type="submit"
            className="w-full text-center text-sm text-slate-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Sair e entrar com outra conta
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
