import { NextResponse, type NextRequest } from 'next/server';
import { autenticarRequisicao, erroServidor } from '@/lib/api-helpers';
import { calcularMetricas } from '@/lib/supabase/queries';
import { filtroMetricasSchema } from '@/lib/validations/agendamento';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { usuario, erro } = await autenticarRequisicao('metricas/resumo');
  if (erro) return erro;

  const params = request.nextUrl.searchParams;
  const parsed = filtroMetricasSchema.safeParse({
    lojaId: params.get('loja') ?? undefined,
    periodo: params.get('periodo') ?? '30d',
    dataInicio: params.get('inicio') ?? undefined,
    dataFim: params.get('fim') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ erro: 'Filtros invalidos' }, { status: 400 });
  }

  try {
    // O RLS restringe os dados ao escopo do usuario, sem filtro extra aqui.
    const metricas = await calcularMetricas(parsed.data);
    return NextResponse.json(metricas, {
      headers: { 'Cache-Control': 'private, max-age=30' },
      status: 200,
    });
  } catch (excecao) {
    return erroServidor(excecao);
  }
}
