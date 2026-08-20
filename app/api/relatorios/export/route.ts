import { NextResponse, type NextRequest } from 'next/server';
import { autenticarRequisicao, erroServidor } from '@/lib/api-helpers';
import { calcularMetricas, calcularMetricasPorLoja, resolverIntervalo } from '@/lib/supabase/queries';
import { filtroMetricasSchema } from '@/lib/validations/agendamento';
import { gerarCsv, nomeDoArquivo, type ColunaCsv } from '@/lib/csv';
import type { DesempenhoAgendador } from '@/lib/types/metricas';

export const dynamic = 'force-dynamic';

type LinhaLoja = Awaited<ReturnType<typeof calcularMetricasPorLoja>>[number];

const COLUNAS_LOJA: ColunaCsv<LinhaLoja>[] = [
  { cabecalho: 'Loja', valor: (linha) => linha.nome },
  { cabecalho: 'Contatos', valor: (linha) => linha.contatos },
  { cabecalho: 'Agendados', valor: (linha) => linha.agendados },
  { cabecalho: 'Compareceram', valor: (linha) => linha.compareceram },
  { cabecalho: 'Vendas', valor: (linha) => linha.vendas },
  // Numero puro, sem "R$": planilha soma coluna de numero, nao de texto.
  { cabecalho: 'Faturamento (R$)', valor: (linha) => linha.receita },
  { cabecalho: 'Ticket medio (R$)', valor: (linha) => linha.ticketMedio },
  { cabecalho: 'Conversao (%)', valor: (linha) => linha.taxaConversao },
];

const COLUNAS_AGENDADOR: ColunaCsv<DesempenhoAgendador>[] = [
  { cabecalho: 'Agendador', valor: (linha) => linha.nome },
  { cabecalho: 'Contatos', valor: (linha) => linha.contatos },
  { cabecalho: 'Agendados', valor: (linha) => linha.agendados },
  { cabecalho: 'Compareceram', valor: (linha) => linha.compareceram },
  { cabecalho: 'Conversao (%)', valor: (linha) => linha.taxaConversao },
];

/**
 * Exporta o relatorio em CSV respeitando os mesmos filtros da tela.
 *
 * Nao ha filtro de escopo aqui: o RLS ja limita o que cada papel enxerga, e
 * repetir a regra na aplicacao criaria uma segunda fonte de verdade que
 * pode divergir da primeira.
 */
export async function GET(request: NextRequest) {
  const { erro } = await autenticarRequisicao('relatorios/export');
  if (erro) return erro;

  const params = request.nextUrl.searchParams;
  const tipo = params.get('tipo') === 'agendadores' ? 'agendadores' : 'lojas';

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
    const filtros = parsed.data;
    const { inicio, fim } = resolverIntervalo(filtros);

    const csv =
      tipo === 'agendadores'
        ? gerarCsv(COLUNAS_AGENDADOR, (await calcularMetricas(filtros)).dadosPorAgendador)
        : gerarCsv(COLUNAS_LOJA, await calcularMetricasPorLoja(filtros));

    const arquivo = nomeDoArquivo(
      tipo === 'agendadores' ? 'agendadores' : 'lojas',
      inicio,
      fim
    );

    return new NextResponse(csv, {
      headers: {
        // charset=utf-8 junto do BOM: navegadores e Excel leem os acentos.
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${arquivo}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (excecao) {
    return erroServidor(excecao);
  }
}
