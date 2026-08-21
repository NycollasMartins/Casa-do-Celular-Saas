import { EsqueletoDeTabela } from '@/components/ui/esqueleto';

/**
 * Cobre TODAS as rotas de /dashboard que nao tenham loading proprio —
 * agendamentos, metas, equipe, lojas, participacoes, relatorios, privacidade.
 * Conferido: o esqueleto do segmento pai atende a rota filha, e chega em
 * dezenas de milissegundos enquanto a pagina espera o banco.
 */
export default function Loading() {
  return <EsqueletoDeTabela />;
}
