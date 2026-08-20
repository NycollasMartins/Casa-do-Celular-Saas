import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { MESES_RETENCAO_PADRAO, dataLimiteRetencao } from '@/lib/lgpd';
import { formatarDataIso, formatarNumero } from '@/lib/utils';
import { BuscaTitular } from './busca-titular';

export const metadata = { title: 'Privacidade · Casa do Celular' };

export default async function PrivacidadePage() {
  await exigirRole(['super_admin', 'franqueado']);
  const supabase = createClient();

  const limite = dataLimiteRetencao();

  const [{ count: total }, { count: anonimizados }, { count: vencidos }] = await Promise.all([
    supabase.from('agendamentos').select('*', { count: 'exact', head: true }),
    supabase
      .from('agendamentos')
      .select('*', { count: 'exact', head: true })
      .not('anonimizado_em', 'is', null),
    supabase
      .from('agendamentos')
      .select('*', { count: 'exact', head: true })
      .is('anonimizado_em', null)
      .lt('data_agendamento', limite),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Privacidade</h1>
        <p className="mt-1 text-sm text-slate-500">
          Atendimento a pedidos de titular e politica de retencao.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{formatarNumero(total ?? 0)}</p>
            <p className="mt-1 text-sm text-slate-500">Agendamentos no seu escopo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {formatarNumero(anonimizados ?? 0)}
            </p>
            <p className="mt-1 text-sm text-slate-500">Ja anonimizados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p
              className={`text-2xl font-semibold tabular-nums ${
                (vencidos ?? 0) > 0 ? 'text-warning' : 'text-ink'
              }`}
            >
              {formatarNumero(vencidos ?? 0)}
            </p>
            <p className="mt-1 text-sm text-slate-500">Fora do prazo de retencao</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pedido de eliminacao do titular</CardTitle>
          <CardDescription>
            O titular pode exigir a eliminacao dos dados dele (LGPD art. 18, VI). Localize pelo CPF e
            anonimize todos os registros de uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BuscaTitular />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Politica de retencao</CardTitle>
          <CardDescription>
            Prazo atual: {MESES_RETENCAO_PADRAO} meses. Registros anteriores a{' '}
            {formatarDataIso(limite)} deveriam estar anonimizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            Os dados pessoais deixam de ter finalidade quando saem da janela de analise de
            desempenho — passado isso, o art. 15, I manda eliminar. A anonimizacao preserva loja,
            agendador, data e status, entao os relatorios historicos continuam corretos.
          </p>
          <p>
            A varredura roda pelo script <code className="rounded bg-slate-100 px-1">npm run lgpd:reter</code>,
            que pode ser agendado. O prazo de {MESES_RETENCAO_PADRAO} meses e uma sugestao tecnica:
            cabe ao controlador confirmar com base na finalidade declarada.
          </p>
          <p>
            A politica publica esta em{' '}
            <Link href="/privacidade" className="text-brand hover:underline" target="_blank">
              /privacidade
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
