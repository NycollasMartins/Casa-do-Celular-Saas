import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatarNumero, formatarPercentual } from '@/lib/utils';
import { formatarBrl } from '@/lib/dinheiro';
import {
  ROTULO_SITUACAO,
  calcularAtingimento,
  situacaoGeral,
  type Atingimento,
  type Meta,
  type Realizado,
  type SituacaoMeta,
} from '@/lib/metas';

interface Props {
  meta: Meta;
  realizado: Realizado;
  competencia: string;
}

const VARIANTE: Record<SituacaoMeta, 'success' | 'warning' | 'danger' | 'neutral'> = {
  no_alvo: 'success',
  atencao: 'warning',
  abaixo: 'danger',
  sem_meta: 'neutral',
};

/** A barra so vai ate 100% mesmo quando o alvo e superado. */
const COR_BARRA: Record<Exclude<SituacaoMeta, 'sem_meta'>, string> = {
  no_alvo: 'bg-emerald-500',
  atencao: 'bg-amber-500',
  abaixo: 'bg-danger',
};

function valorFormatado(item: Atingimento, valor: number): string {
  if (item.chave === 'receita') return formatarBrl(valor);
  if (item.chave === 'taxaConversao') return formatarPercentual(valor);
  return formatarNumero(valor);
}

/**
 * A meta do proprio agendador, no dashboard dele.
 *
 * A policy `metas_select` sempre permitiu que ele lesse a propria meta —
 * esconder o alvo tornaria a meta instrumento de cobranca em vez de direcao.
 * Faltava a tela: sem ela, a permissao existia e ninguem usava.
 */
export function MinhaMeta({ meta, realizado, competencia }: Props) {
  const itens = calcularAtingimento(meta, realizado, competencia);
  if (itens.length === 0) return null;

  const situacao = situacaoGeral(itens);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-500">Minha meta do mes</h2>
          <Badge variant={VARIANTE[situacao]}>{ROTULO_SITUACAO[situacao]}</Badge>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {itens.map((item) => (
            <div key={item.chave} className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-slate-400">{item.rotulo}</p>

              <p className="text-lg font-semibold tabular-nums text-ink">
                {valorFormatado(item, item.realizado)}
                <span className="text-sm font-normal text-slate-400">
                  {' '}
                  / {valorFormatado(item, item.meta)}
                </span>
              </p>

              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={Math.round(item.percentual)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.rotulo}: ${formatarPercentual(item.percentual)} da meta`}
              >
                <div
                  className={`h-full rounded-full ${COR_BARRA[item.situacao]}`}
                  style={{ width: `${Math.min(100, Math.max(0, item.percentual))}%` }}
                />
              </div>

              <p className="text-xs text-slate-400">{formatarPercentual(item.percentual)} do alvo</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          A situacao compara o ritmo com o esperado ate hoje, nao com o alvo do mes fechado.
        </p>
      </CardContent>
    </Card>
  );
}
