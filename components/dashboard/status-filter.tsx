'use client';

import { STATUS_LABEL } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { AgendamentoStatus } from '@/lib/types/database';

interface Props {
  selecionados: AgendamentoStatus[];
  onChange: (status: AgendamentoStatus[]) => void;
}

const TODOS = Object.keys(STATUS_LABEL) as AgendamentoStatus[];

/** Multi-select em chips: mais rapido de tocar no celular que um dropdown. */
export function StatusFilter({ selecionados, onChange }: Props) {
  function alternar(status: AgendamentoStatus) {
    onChange(
      selecionados.includes(status)
        ? selecionados.filter((item) => item !== status)
        : [...selecionados, status]
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por status">
      {TODOS.map((status) => {
        const ativo = selecionados.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={ativo}
            onClick={() => alternar(status)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              ativo
                ? 'border-brand bg-brand-light text-brand-dark'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            )}
          >
            {STATUS_LABEL[status]}
          </button>
        );
      })}
      {selecionados.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full px-3 py-1 text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
        >
          Limpar
        </button>
      ) : null}
    </div>
  );
}
