import { revalidatePath } from 'next/cache';

/**
 * Quais telas precisam ser invalidadas depois de cada tipo de mudanca.
 *
 * Existe porque a lista estava espalhada e incompleta: `registrarVenda`
 * invalidava Relatorios mas nao Metas, que tambem mostra vendas;
 * `criarUsuario` invalidava so a Equipe, embora um agendador novo apareca
 * em Metas; e as tres acoes de agendamento nao invalidavam nada — excluir
 * um registro mostrava "excluido" com a linha ainda na tela.
 *
 * Declarar o alcance por TIPO DE DADO, e nao por acao, e o que evita a
 * proxima omissao: quem criar uma acao nova escolhe o grupo, em vez de
 * lembrar de cada tela que le aquilo.
 */

/** Telas que mostram agendamento, direta ou agregadamente. */
const TELAS_AGENDAMENTO = [
  '/dashboard',
  '/dashboard/[lojaId]',
  '/dashboard/agendamentos',
  '/dashboard/agendamentos/[id]',
  '/dashboard/relatorios',
  '/dashboard/metas',
  '/admin/metricas-gerais',
];

/** Venda muda faturamento, ticket medio e o realizado das metas. */
const TELAS_VENDA = [
  '/dashboard',
  '/dashboard/[lojaId]',
  '/dashboard/agendamentos',
  '/dashboard/agendamentos/[id]',
  '/dashboard/relatorios',
  '/dashboard/metas',
  '/admin/metricas-gerais',
];

/** Quem e a equipe aparece na Equipe, no Societario, em Metas e nos filtros. */
const TELAS_EQUIPE = [
  '/dashboard',
  '/dashboard/usuarios',
  '/dashboard/participacoes',
  '/dashboard/metas',
];

/** Loja alimenta todos os seletores e recortes por loja. */
const TELAS_LOJA = [
  '/dashboard',
  '/dashboard/[lojaId]',
  '/dashboard/lojas',
  '/dashboard/agendamentos',
  // O formulario de novo agendamento monta o seletor a partir das lojas.
  '/dashboard/agendamentos/novo',
  '/dashboard/relatorios',
  '/dashboard/metas',
  // Painel do super admin: lista da rede inteira e metricas por loja.
  '/admin/lojas',
  '/admin/metricas-gerais',
];

/** Meta aparece na tela do gestor e no dashboard do proprio agendador. */
const TELAS_META = ['/dashboard', '/dashboard/metas'];

/** Franqueado so aparece no painel do super admin. */
const TELAS_FRANQUEADO = ['/admin/franqueados'];

/** Anonimizacao muda o que a tela de Privacidade conta e o que a lista exibe. */
const TELAS_PRIVACIDADE = [
  '/dashboard',
  '/dashboard/agendamentos',
  '/dashboard/agendamentos/[id]',
  '/dashboard/privacidade',
];

const GRUPOS = {
  agendamento: TELAS_AGENDAMENTO,
  venda: TELAS_VENDA,
  equipe: TELAS_EQUIPE,
  loja: TELAS_LOJA,
  meta: TELAS_META,
  privacidade: TELAS_PRIVACIDADE,
  franqueado: TELAS_FRANQUEADO,
} as const;

export type GrupoRevalidacao = keyof typeof GRUPOS;

/**
 * Exportado para o teste conferir que cada caminho corresponde a uma rota
 * de verdade. `revalidatePath` com caminho inexistente nao levanta erro —
 * simplesmente nao faz nada, e a tela continua mostrando dado velho.
 */
export const TELAS_POR_GRUPO: Record<GrupoRevalidacao, readonly string[]> = GRUPOS;

export function revalidar(...grupos: GrupoRevalidacao[]): void {
  const telas = new Set(grupos.flatMap((grupo) => GRUPOS[grupo]));

  // O segundo argumento e obrigatorio para rota com segmento dinamico:
  // `revalidatePath('/dashboard/[lojaId]')` sozinho nao alcanca nenhuma
  // instancia da rota. Para caminho fixo, 'page' ja e o padrao — passar
  // sempre custa nada e evita que a proxima rota dinamica entre sem efeito.
  for (const tela of telas) revalidatePath(tela, 'page');
}
