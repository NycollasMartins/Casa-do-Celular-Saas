import { cn } from '@/lib/utils';

/**
 * Blocos pulsantes para o intervalo entre o clique e a resposta do banco.
 *
 * POR QUE
 * Numa Server Component, navegar sem `loading.tsx` deixa a tela PARADA na
 * pagina anterior ate o Supabase responder — nenhum sinal de que algo esta
 * acontecendo. Em rede de loja isso vira toque repetido no mesmo link.
 *
 * O esqueleto tem a forma aproximada do que vai chegar, entao o layout nao
 * pula quando o conteudo entra.
 */
export function Barra({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-100', className)} />;
}

/**
 * `role="status"` e o texto escondido existem porque a animacao nao diz nada
 * a quem usa leitor de tela: sem isso, a espera e silencio total.
 */
export function EsqueletoDeTabela({ linhas = 6, titulo = true }: { linhas?: number; titulo?: boolean }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Carregando</span>

      {titulo ? (
        <div className="space-y-2">
          <Barra className="h-7 w-56" />
          <Barra className="h-4 w-40" />
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex gap-4 border-b border-slate-100 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Barra key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-slate-50 p-4 last:border-0">
            {Array.from({ length: 4 }).map((_, j) => (
              <Barra key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
