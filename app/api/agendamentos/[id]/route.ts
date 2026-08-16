import { NextResponse, type NextRequest } from 'next/server';
import { autenticarRequisicao, erroServidor } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/server';
import { atualizarAgendamento, deletarAgendamento } from '@/app/actions/agendamentos';

export const dynamic = 'force-dynamic';

interface Contexto {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Contexto) {
  const { erro } = await autenticarRequisicao('agendamentos/id');
  if (erro) return erro;

  try {
    const supabase = createClient();
    const { data } = await supabase.from('agendamentos').select('*').eq('id', params.id).maybeSingle();

    // maybeSingle + RLS: sem permissao o retorno e o mesmo de "nao existe".
    if (!data) return NextResponse.json({ erro: 'Agendamento nao encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (excecao) {
    return erroServidor(excecao);
  }
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { erro } = await autenticarRequisicao('agendamentos/id');
  if (erro) return erro;

  try {
    const formData = await request.formData();
    const resultado = await atualizarAgendamento(params.id, formData);
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 400 });
  } catch (excecao) {
    return erroServidor(excecao);
  }
}

export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const { erro } = await autenticarRequisicao('agendamentos/id');
  if (erro) return erro;

  try {
    const resultado = await deletarAgendamento(params.id);
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 400 });
  } catch (excecao) {
    return erroServidor(excecao);
  }
}
