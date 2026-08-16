import { NextResponse } from 'next/server';
import { buscarUsuarioAtual } from '@/lib/auth/session';
import { verificarRateLimit } from '@/lib/rate-limit';
import type { Usuario } from '@/lib/types/database';

/**
 * Autentica e aplica rate limit. Devolve o usuario ou uma resposta de erro
 * pronta para o handler retornar.
 */
export async function autenticarRequisicao(
  rota: string
): Promise<{ usuario: Usuario; erro?: never } | { usuario?: never; erro: NextResponse }> {
  const usuario = await buscarUsuarioAtual();

  if (!usuario) {
    return { erro: NextResponse.json({ erro: 'Nao autenticado' }, { status: 401 }) };
  }

  const limite = verificarRateLimit(`${usuario.id}:${rota}`);
  if (!limite.permitido) {
    return {
      erro: NextResponse.json(
        { erro: 'Muitas requisicoes. Tente de novo em instantes.' },
        { status: 429, headers: { 'Retry-After': String(limite.resetEmSegundos) } }
      ),
    };
  }

  return { usuario };
}

export function erroServidor(excecao: unknown) {
  const mensagem = excecao instanceof Error ? excecao.message : 'Erro inesperado';
  return NextResponse.json({ erro: mensagem }, { status: 500 });
}
