'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Loja, UserRole } from '@/lib/types/database';

type LojaResumo = Pick<Loja, 'id' | 'nome' | 'codigo_loja' | 'cidade' | 'estado'>;

interface Props {
  lojas: LojaResumo[];
  role: UserRole;
  lojaSelecionada?: string;
}

export const TODAS_AS_LOJAS = 'todas';

/**
 * Seletor de loja do dashboard.
 * As lojas ja chegam filtradas pelo RLS. O agendador tem loja fixa, entao
 * ve apenas um rotulo estatico - sem dropdown.
 */
export function LojaSelector({ lojas, role, lojaSelecionada }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciarTransicao] = useTransition();

  const aoSelecionar = useCallback(
    (valor: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor === TODAS_AS_LOJAS) params.delete('loja');
      else params.set('loja', valor);

      iniciarTransicao(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams]
  );

  if (role === 'agendador') {
    const loja = lojas[0];
    return (
      <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-ink">
        <Store className="h-4 w-4 text-brand" aria-hidden />
        <span className="font-medium">{loja ? loja.nome : 'Sem loja atribuida'}</span>
        {loja ? <span className="text-slate-400">{loja.codigo_loja}</span> : null}
      </div>
    );
  }

  return (
    <Select value={lojaSelecionada ?? TODAS_AS_LOJAS} onValueChange={aoSelecionar} disabled={pendente}>
      <SelectTrigger className="w-full sm:w-64" aria-label="Selecionar loja">
        <div className="flex items-center gap-2 truncate">
          <Store className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <SelectValue placeholder="Selecionar loja" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS_AS_LOJAS}>Todas as lojas</SelectItem>
        {lojas.map((loja) => (
          <SelectItem key={loja.id} value={loja.id}>
            {loja.nome} · {loja.codigo_loja}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
