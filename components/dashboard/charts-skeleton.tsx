import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Fica em arquivo PROPRIO, e nao junto dos graficos, de proposito.
 *
 * `charts-lazy.tsx` precisa deste esqueleto para mostrar enquanto o pedaco
 * dos graficos carrega. Se o importasse de `charts-container.tsx`, puxaria a
 * biblioteca de graficos junto para o carregamento inicial — que e
 * exatamente o que a separacao existe para evitar.
 *
 * Medido: com o esqueleto no mesmo arquivo, o dashboard continuava em 269 kB.
 */
export function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="h-[356px] animate-pulse bg-slate-100/60" />
      ))}
    </div>
  );
}
