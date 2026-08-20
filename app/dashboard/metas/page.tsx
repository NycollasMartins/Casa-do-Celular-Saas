import { Card, CardContent } from '@/components/ui/card';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { desempenhoNaCompetencia } from '@/lib/supabase/queries';
import { competenciaDe, fimDaCompetencia } from '@/lib/metas';
import { formatarDataIso } from '@/lib/utils';
import type { ParametrosBusca } from '@/lib/filtros';
import type { MetaAgendador } from '@/lib/types/database';
import { TabelaMetas } from './tabela-metas';

export const metadata = { title: 'Metas · Casa do Celular' };

/** Aceita AAAA-MM-01 vindo da URL; qualquer outra coisa cai no mes corrente. */
function lerCompetencia(searchParams: ParametrosBusca): string {
  const bruto = Array.isArray(searchParams.competencia)
    ? searchParams.competencia[0]
    : searchParams.competencia;

  return bruto && /^\d{4}-\d{2}-01$/.test(bruto) ? bruto : competenciaDe();
}

export default async function MetasPage({ searchParams }: { searchParams: ParametrosBusca }) {
  await exigirRole(['super_admin', 'franqueado']);

  const competencia = lerCompetencia(searchParams);
  const supabase = createClient();

  const [linhas, { data: metasBrutas }] = await Promise.all([
    desempenhoNaCompetencia(competencia),
    supabase.from('metas').select('*').eq('competencia', competencia),
  ]);

  const metas: Record<string, MetaAgendador> = {};
  for (const meta of (metasBrutas ?? []) as MetaAgendador[]) {
    metas[meta.usuario_id] = meta;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Metas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Periodo de {formatarDataIso(competencia)} a {formatarDataIso(fimDaCompetencia(competencia))}.
          A situacao compara o realizado com o esperado ate hoje, nao com o alvo cheio.
        </p>
      </div>

      <Card>
        <CardContent className="px-0 pt-0 sm:px-4 sm:pt-4">
          <TabelaMetas competencia={competencia} linhas={linhas} metas={metas} />
        </CardContent>
      </Card>
    </div>
  );
}
