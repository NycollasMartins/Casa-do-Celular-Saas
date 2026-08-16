import { NextResponse, type NextRequest } from 'next/server';
import { autenticarRequisicao, erroServidor } from '@/lib/api-helpers';
import { buscarAgendamentos } from '@/lib/supabase/queries';
import { criarAgendamento } from '@/app/actions/agendamentos';
import type { AgendamentoStatus } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { erro } = await autenticarRequisicao('agendamentos');
  if (erro) return erro;

  const params = request.nextUrl.searchParams;
  const status = params.getAll('status') as AgendamentoStatus[];

  try {
    const agendamentos = await buscarAgendamentos({
      lojaId: params.get('loja') ?? undefined,
      agendadorId: params.get('agendador') ?? undefined,
      periodo: (params.get('periodo') as '7d' | '30d' | '90d' | null) ?? '30d',
      dataInicio: params.get('inicio') ?? undefined,
      dataFim: params.get('fim') ?? undefined,
      status: status.length ? status : undefined,
      limite: Number(params.get('limite') ?? 200),
    });

    return NextResponse.json(agendamentos);
  } catch (excecao) {
    return erroServidor(excecao);
  }
}

export async function POST(request: NextRequest) {
  const { erro } = await autenticarRequisicao('agendamentos');
  if (erro) return erro;

  try {
    // Reaproveita a server action: validacao e regras de tenant em um lugar so.
    const formData = await request.formData();
    const resultado = await criarAgendamento(formData);

    return NextResponse.json(resultado, { status: resultado.sucesso ? 201 : 400 });
  } catch (excecao) {
    return erroServidor(excecao);
  }
}
