import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
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

  const limite = await verificarRateLimit(`${usuario.id}:${rota}`);
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

/**
 * Resposta de erro das rotas de API.
 *
 * A MENSAGEM INTERNA NAO SAI NA RESPOSTA
 * Antes devolvia `excecao.message` direto. Erro vindo do PostgREST carrega
 * nome de coluna, nome de constraint e as vezes o valor que causou a
 * violacao — detalhe de schema entregue a qualquer pessoa autenticada,
 * inclusive um agendador, que e o papel de menor privilegio.
 *
 * As paginas ja se comportavam assim: o boundary de rota mostra so o `digest`
 * porque o Next redige a mensagem em producao. Aqui a redacao tinha sido
 * desfeita a mao.
 *
 * O `codigo` mantem o chamado rastreavel: e o mesmo id do evento no Sentry, e
 * vai para o log do servidor junto com a excecao inteira. A pessoa cita o
 * codigo, quem investiga acha o detalhe.
 */
export function erroServidor(excecao: unknown) {
  // Devolve id mesmo sem DSN configurado; sem DSN nada e enviado, e o log do
  // servidor passa a ser o unico destino — mas o codigo continua batendo.
  const codigo = Sentry.captureException(excecao);

  console.error(`[erro de rota ${codigo}]`, excecao);

  return NextResponse.json(
    { erro: 'Nao foi possivel completar a operacao.', codigo },
    { status: 500 }
  );
}
