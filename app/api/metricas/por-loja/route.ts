import { NextResponse, type NextRequest } from 'next/server';
import { autenticarRequisicao, erroServidor } from '@/lib/api-helpers';
import { calcularMetricasPorLoja } from '@/lib/supabase/queries';
import { filtroMetricasSchema } from '@/lib/validations/agendamento';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { erro } = await autenticarRequisicao('metricas/por-loja');
  if (erro) return erro;

  const params = request.nextUrl.searchParams;
  const parsed = filtroMetricasSchema.safeParse({
    periodo: params.get('periodo') ?? '30d',
    dataInicio: params.get('inicio') ?? undefined,
    dataFim: params.get('fim') ?? undefined,
  });

  if (!parsed.success) return NextResponse.json({ erro: 'Filtros invalidos' }, { status: 400 });

  try {
    return NextResponse.json(await calcularMetricasPorLoja(parsed.data));
  } catch (excecao) {
    return erroServidor(excecao);
  }
}
