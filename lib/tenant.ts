import type { UserRole } from '@/lib/types/database';

/**
 * De quem e o registro que esta sendo criado.
 *
 * POR QUE ISTO E UMA FUNCAO, E NAO DUAS LINHAS EM CADA ACTION
 * A regra vale para loja e para usuario, e as duas escrevem em nome do
 * sistema — `criarUsuario` usa service role, que ignora RLS por natureza.
 * Onde a policy nao alcanca, esta decisao e a unica fronteira entre tenants.
 *
 * Ela ja esteve escrita duas vezes e as duas versoes divergiram: a de usuario
 * so aceitava o campo do formulario vindo de super admin, a de loja aceitava
 * de qualquer papel. A de loja era salva por `lojas_insert` no banco — mas
 * depender da policy para uma regra que a aplicacao acha que esta aplicando
 * e como ter a trava so na segunda porta e deixar a primeira encostada.
 *
 * DUAS REGRAS, E O MOTIVO DE CADA UMA
 *
 * Quem tem tenant na sessao usa o dela, e o formulario e IGNORADO. Nao e
 * conferido: ignorado. Conferir e recusar daria o mesmo resultado hoje e
 * viraria uma comparacao a mais para alguem afrouxar depois.
 *
 * Super admin nao pertence a rede nenhuma, entao para ele o formulario e a
 * unica fonte — e sem escolha nao ha palpite razoavel. Devolver null aqui e
 * o que faz a tela pedir a escolha em vez de o banco recusar com "violates
 * not-null constraint".
 */
export function resolverTenant(
  ator: { role: UserRole; franqueado_id: string | null },
  escolhidoNoFormulario?: string | null
): string | null {
  if (ator.role === 'super_admin') return escolhidoNoFormulario || null;
  return ator.franqueado_id || null;
}
