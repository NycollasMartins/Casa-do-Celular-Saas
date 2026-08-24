import Link from 'next/link';
import { ArrowRight, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { primeiroPasso } from '@/lib/primeiros-passos';
import type { UserRole } from '@/lib/types/database';

/**
 * Ocupa o lugar dos indicadores quando nao ha loja alcancavel.
 *
 * Mostrar zero em toda parte e honesto e inutil: nao ha o que interpretar, e
 * a tabela ainda sugeria ajustar o periodo, quando o que falta e o primeiro
 * cadastro. Aqui a tela diz qual e o proximo passo — e so oferece botao a
 * quem pode executa-lo.
 */
export function PrimeirosPassos({ role }: { role: UserRole }) {
  const passo = primeiroPasso(role);

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-5 p-8">
        <div className="rounded-full bg-brand/10 p-3">
          <Store className="h-6 w-6 text-brand" aria-hidden />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">{passo.titulo}</h2>
          <p className="max-w-prose text-sm text-slate-500">{passo.descricao}</p>
        </div>

        {passo.passos ? (
          <ol className="max-w-prose space-y-2 text-sm text-slate-600">
            {passo.passos.map((texto, indice) => (
              <li key={texto} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                  {indice + 1}
                </span>
                {texto}
              </li>
            ))}
          </ol>
        ) : null}

        {passo.acao ? (
          <Button asChild>
            <Link href={passo.acao.href}>
              {passo.acao.rotulo}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
