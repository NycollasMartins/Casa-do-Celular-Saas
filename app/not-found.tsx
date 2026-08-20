import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Pagina nao encontrada · Casa do Celular' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Pagina nao encontrada</CardTitle>
            <CardDescription>
              O endereco nao existe, ou o registro foi removido por outra pessoa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/dashboard">Voltar ao inicio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
