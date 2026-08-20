'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Boundary de erro das rotas. Sem ele, qualquer excecao de runtime derruba a
 * arvore inteira e o usuario ve a tela crua do Next.
 *
 * `digest` e o hash que o Next grava no log do servidor. Mostrar na tela
 * permite ao usuario citar o codigo no chamado sem expor o stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sem DSN configurado o capture nao envia nada — o console segue sendo
    // o unico destino em desenvolvimento.
    Sentry.captureException(error);
    console.error('[erro de rota]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Algo saiu errado</CardTitle>
            <CardDescription>
              A pagina nao pode ser carregada. Seus dados nao foram perdidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error.digest ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Codigo do erro: <span className="font-mono font-medium">{error.digest}</span>
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={reset} className="flex-1">
                Tentar de novo
              </Button>
              <Button asChild variant="secondary" className="flex-1">
                <Link href="/dashboard">Ir para o inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
