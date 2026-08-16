import { redirect, notFound } from 'next/navigation';
import { buscarLojasDoUsuario } from '@/lib/supabase/queries';
import type { ParametrosBusca } from '@/lib/filtros';

/**
 * Rota profunda por loja (/dashboard/<id>). Mantem a URL compartilhavel e
 * reaproveita a visao geral, que ja filtra por ?loja=. Se a loja nao estiver
 * entre as permitidas pelo RLS, responde 404 em vez de vazar a existencia dela.
 */
export default async function DashboardLojaPage({
  params,
  searchParams,
}: {
  params: { lojaId: string };
  searchParams: ParametrosBusca;
}) {
  const lojas = await buscarLojasDoUsuario();
  if (!lojas.some((loja) => loja.id === params.lojaId)) notFound();

  const query = new URLSearchParams();
  Object.entries(searchParams).forEach(([chave, valor]) => {
    if (typeof valor === 'string') query.set(chave, valor);
  });
  query.set('loja', params.lojaId);

  redirect(`/dashboard?${query.toString()}`);
}
