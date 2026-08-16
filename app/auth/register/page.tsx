import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Solicitar acesso · Casa do Celular' };

/**
 * Nao ha auto-cadastro: cada conta pertence a um franqueado e precisa de
 * loja e papel definidos. O franqueado cria o usuario em Equipe.
 */
export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitar acesso</CardTitle>
        <CardDescription>As contas sao criadas pelo franqueado responsavel pela sua loja.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-600">
        <p>
          Peca ao seu franqueado para cadastrar seu e-mail em <strong>Equipe</strong>. Voce recebe uma senha
          provisoria e troca no primeiro acesso.
        </p>
        <Link href="/auth/login" className="inline-block text-brand hover:underline">
          Ja tenho acesso
        </Link>
      </CardContent>
    </Card>
  );
}
