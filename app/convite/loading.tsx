import { Skeleton } from '@/components/ui/skeleton';

/**
 * A tela de convite consulta o banco para conferir o token. Sem isto, o
 * clique no link deixa a tela parada na pagina anterior — e quem recebeu o
 * convite por mensagem estaria vendo isso no celular, em rede ruim.
 */
export default function CarregandoConvite() {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
