import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Usuario, UserRole } from '@/lib/types/database';

/**
 * Perfil do usuario logado (linha de public.usuarios).
 * `cache` evita repetir a query em cada componente da mesma renderizacao.
 */
export const buscarUsuarioAtual = cache(async (): Promise<Usuario | null> => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS permite que todo usuario leia a propria linha.
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', user.id).single();

  if (error || !data) return null;
  return data as Usuario;
});

/**
 * Usuario com acesso VIGENTE. E o que Server Action deve usar.
 *
 * POR QUE NAO BASTA `buscarUsuarioAtual`
 * Aquela devolve a linha de quem esta desligado — e devolve de proposito: o
 * RLS libera todo mundo a ler a PROPRIA linha, para a aplicacao conseguir
 * dizer "seu acesso foi encerrado" em vez de mostrar tela vazia.
 *
 * Nas acoes que gravam com o cliente normal isso nao fazia diferenca: o RLS
 * barra o desligado de qualquer jeito. Mas `criarUsuario` grava com SERVICE
 * ROLE — precisa, porque a Admin API cria a conta em auth.users — e service
 * role ignora RLS.
 *
 * O resultado era que um franqueado desligado, enquanto o access token dele
 * nao expirasse, ainda conseguia criar um usuario novo no proprio tenant,
 * com o papel que quisesse, e voltar a entrar por essa conta. O desligamento
 * virava temporario. `definirStatusUsuario` escapava por escrever com o
 * cliente normal, onde o RLS barra a reativacao.
 *
 * A revogacao de sessao (`admin.signOut` global) nao fecha essa janela: ela
 * invalida o refresh token, e o access token ja emitido vale ate expirar.
 */
export async function usuarioComAcesso(): Promise<Usuario | null> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario || usuario.status !== 'ativo') return null;
  return usuario;
}

/**
 * Usa em paginas protegidas: redireciona para o login se nao houver sessao.
 *
 * Usuario desligado tem a sessao encerrada aqui. O RLS ja devolveria tudo
 * vazio para ele, mas uma tela sem dados e sem explicacao parece defeito —
 * melhor deslogar dizendo o motivo.
 */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario) redirect('/auth/login');

  if (usuario.status === 'inativo') {
    const supabase = createClient();
    await supabase.auth.signOut();
    redirect('/auth/login?erro=acesso_revogado');
  }

  return usuario;
}

/** Restringe uma pagina a papeis especificos. */
export async function exigirRole(rolesPermitidos: UserRole[]): Promise<Usuario> {
  const usuario = await exigirUsuario();
  if (!rolesPermitidos.includes(usuario.role)) redirect('/dashboard');
  return usuario;
}

export function podeGerenciarCadastros(role: UserRole): boolean {
  return role === 'super_admin' || role === 'franqueado';
}

/** Agendador tem loja fixa: nao ve seletor nem filtro de loja. */
export function temSeletorDeLoja(role: UserRole): boolean {
  return role !== 'agendador';
}

export function podeExcluirAgendamento(role: UserRole): boolean {
  return role !== 'agendador';
}
