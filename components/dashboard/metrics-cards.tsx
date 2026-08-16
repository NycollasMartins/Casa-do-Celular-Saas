'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarCheck, PhoneCall, Target, UserCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn, formatarNumero, formatarPercentual } from '@/lib/utils';
import type { ResumoMetricas } from '@/lib/types/metricas';

/** Contagem animada. Respeita prefers-reduced-motion. */
function useContagem(valorFinal: number, duracao = 700): number {
  const [valor, setValor] = useState(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValor(valorFinal);
      return;
    }

    const inicio = performance.now();
    const animar = (agora: number) => {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      // easeOutCubic: rapido no comeco, suave no fim
      const eased = 1 - Math.pow(1 - progresso, 3);
      setValor(valorFinal * eased);
      if (progresso < 1) frameRef.current = requestAnimationFrame(animar);
    };

    frameRef.current = requestAnimationFrame(animar);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [valorFinal, duracao]);

  return valor;
}

interface CardMetrica {
  chave: string;
  titulo: string;
  valor: number;
  formato: 'numero' | 'percentual';
  descricao: string;
  icone: typeof PhoneCall;
  cor: string;
  fundo: string;
  filtroStatus?: string;
}

function MetricCard({ card, ativo, onClick }: { card: CardMetrica; ativo: boolean; onClick: () => void }) {
  const animado = useContagem(card.valor);
  const Icone = card.icone;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          onClick();
        }
      }}
      aria-pressed={ativo}
      className={cn(
        'animate-fade-in cursor-pointer p-5 transition-shadow duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        ativo && 'ring-2 ring-brand'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-500">{card.titulo}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
            {card.formato === 'percentual'
              ? formatarPercentual(animado)
              : formatarNumero(Math.round(animado))}
          </p>
          <p className="mt-1 text-xs text-slate-400">{card.descricao}</p>
        </div>
        <span className={cn('rounded-lg p-2', card.fundo)}>
          <Icone className={cn('h-5 w-5', card.cor)} aria-hidden />
        </span>
      </div>
    </Card>
  );
}

/**
 * Os 4 indicadores do topo. Clicar em um card aplica o filtro de status
 * correspondente na tabela logo abaixo (via query string).
 */
export function MetricsCards({ metricas }: { metricas: ResumoMetricas }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusAtivo = searchParams.get('status');

  const cards: CardMetrica[] = [
    {
      chave: 'contatos',
      titulo: 'Total de contatos',
      valor: metricas.totalContatos,
      formato: 'numero',
      descricao: 'Clientes abordados no periodo',
      icone: PhoneCall,
      cor: 'text-brand',
      fundo: 'bg-brand-light',
    },
    {
      chave: 'agendados',
      titulo: 'Agendamentos confirmados',
      valor: metricas.totalAgendados,
      formato: 'numero',
      descricao: 'Visitas marcadas',
      icone: CalendarCheck,
      cor: 'text-amber-600',
      fundo: 'bg-amber-50',
      filtroStatus: 'agendado',
    },
    {
      chave: 'conversao',
      titulo: 'Taxa de conversao',
      valor: metricas.taxaConversao,
      formato: 'percentual',
      descricao: 'Agendamentos sobre contatos',
      icone: Target,
      cor: 'text-violet-600',
      fundo: 'bg-violet-50',
    },
    {
      chave: 'compareceram',
      titulo: 'Comparecimentos',
      valor: metricas.totalCompareceram,
      formato: 'numero',
      descricao: `${formatarPercentual(metricas.taxaComparecimento)} dos agendados`,
      icone: UserCheck,
      cor: 'text-emerald-600',
      fundo: 'bg-emerald-50',
      filtroStatus: 'compareceu',
    },
  ];

  function aplicarFiltro(card: CardMetrica) {
    const params = new URLSearchParams(searchParams.toString());
    if (!card.filtroStatus || statusAtivo === card.filtroStatus) params.delete('status');
    else params.set('status', card.filtroStatus);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <MetricCard
          key={card.chave}
          card={card}
          ativo={Boolean(card.filtroStatus) && statusAtivo === card.filtroStatus}
          onClick={() => aplicarFiltro(card)}
        />
      ))}
    </div>
  );
}

export function MetricsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="h-[122px] animate-pulse bg-slate-100/60" />
      ))}
    </div>
  );
}
