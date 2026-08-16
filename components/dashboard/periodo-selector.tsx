'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { Periodo } from '@/lib/types/metricas';

const OPCOES: { valor: Periodo; label: string }[] = [
  { valor: '7d', label: 'Ultimos 7 dias' },
  { valor: '30d', label: 'Ultimos 30 dias' },
  { valor: '90d', label: 'Ultimos 90 dias' },
  { valor: 'personalizado', label: 'Periodo personalizado' },
];

interface Props {
  periodo: Periodo;
  dataInicio?: string;
  dataFim?: string;
}

export function PeriodoSelector({ periodo, dataInicio, dataFim }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, iniciarTransicao] = useTransition();

  function atualizar(campo: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(campo, valor);
    else params.delete(campo);
    iniciarTransicao(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={periodo} onValueChange={(valor) => atualizar('periodo', valor)}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Selecionar periodo">
          <div className="flex items-center gap-2 truncate">
            <CalendarRange className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {OPCOES.map((opcao) => (
            <SelectItem key={opcao.valor} value={opcao.valor}>
              {opcao.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {periodo === 'personalizado' ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Data inicial"
            defaultValue={dataInicio}
            onChange={(evento) => atualizar('inicio', evento.target.value)}
            className="w-40"
          />
          <span className="text-sm text-slate-400">ate</span>
          <Input
            type="date"
            aria-label="Data final"
            defaultValue={dataFim}
            onChange={(evento) => atualizar('fim', evento.target.value)}
            className="w-40"
          />
        </div>
      ) : null}
    </div>
  );
}
