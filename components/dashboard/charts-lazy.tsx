'use client';

import dynamic from 'next/dynamic';
import { ChartsSkeleton } from './charts-skeleton';
import type { ResumoMetricas } from '@/lib/types/metricas';

/**
 * Carrega os graficos DEPOIS do resto do dashboard.
 *
 * POR QUE
 * Medido no build: `/dashboard` pesava 268 kB de JavaScript, contra 157 kB da
 * tela de agendamentos — que tem a tabela inteira, com filtros e ordenacao,
 * e nenhum grafico. A diferenca de 111 kB e a biblioteca de graficos.
 *
 * Essa e a primeira tela que o agendador abre, e ele a abre no balcao da
 * loja, provavelmente no celular. Cento e onze kilobytes de JavaScript antes
 * de ver qualquer numero e caro em rede ruim — e os numeros que ele precisa
 * ler estao nos cartoes, que vem em outro pedaco bem menor.
 *
 * `ssr: false` porque grafico nao tem conteudo para indexar nem para leitor
 * de tela: o dado que ele desenha ja esta nos cartoes acima e na tabela
 * abaixo. Enquanto carrega, aparece o mesmo esqueleto que o Suspense usa, o
 * que evita a tela pular quando ele entra.
 */
const Graficos = dynamic(
  () => import('./charts-container').then((modulo) => modulo.ChartsContainer),
  { ssr: false, loading: () => <ChartsSkeleton /> }
);

export function ChartsLazy({ metricas }: { metricas: ResumoMetricas }) {
  return <Graficos metricas={metricas} />;
}
