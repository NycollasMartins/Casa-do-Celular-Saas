'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { STATUS_CORES } from '@/lib/utils';
import type { AgendamentoStatus } from '@/lib/types/database';
import type { ResumoMetricas } from '@/lib/types/metricas';

const EIXO = { fontSize: 12, fill: '#64748B' } as const;

const estiloTooltip = {
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 12px rgba(16,24,40,0.08)',
  fontSize: 12,
};

function VazioOuGrafico({ vazio, children }: { vazio: boolean; children: React.ReactNode }) {
  if (vazio) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-400">
        Sem dados no periodo selecionado.
      </div>
    );
  }
  return <>{children}</>;
}

/** Os 4 graficos do dashboard. Todos responsivos via ResponsiveContainer. */
export function ChartsContainer({ metricas }: { metricas: ResumoMetricas }) {
  const semDados = metricas.totalContatos === 0;
  // Dez cabem no grafico; mais que isso vira barra de um pixel. Mas o corte
  // precisa APARECER: sem dizer, "Ranking de agendadores" com dez linhas
  // parece a equipe inteira — e quem o franqueado precisa ver e justamente
  // quem ficou de fora, no fim da lista.
  const LIMITE_DO_GRAFICO = 10;
  const rankingTop = metricas.dadosPorAgendador.slice(0, LIMITE_DO_GRAFICO);
  const foraDoGrafico = metricas.dadosPorAgendador.length - rankingTop.length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* 1. Volume diario */}
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos por dia</CardTitle>
          <CardDescription>Contatos e agendamentos ao longo do periodo</CardDescription>
        </CardHeader>
        <CardContent>
          <VazioOuGrafico vazio={semDados}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={metricas.dadosDiarios} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={estiloTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="contatos" name="Contatos" stroke="#0066CC" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="agendados" name="Agendados" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </VazioOuGrafico>
        </CardContent>
      </Card>

      {/* 2. Ranking de agendadores */}
      <Card>
        <CardHeader>
          <CardTitle>
            {foraDoGrafico > 0 ? `Ranking de agendadores · top ${LIMITE_DO_GRAFICO}` : 'Ranking de agendadores'}
          </CardTitle>
          <CardDescription>
            Taxa de conversao, do maior para o menor
            {foraDoGrafico > 0
              ? ` · outros ${foraDoGrafico} em Relatorios, que lista a equipe inteira`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VazioOuGrafico vazio={rankingTop.length === 0}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rankingTop} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" horizontal={false} />
                <XAxis type="number" unit="%" tick={EIXO} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nome" width={120} tick={EIXO} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={estiloTooltip} formatter={(valor: number) => [`${valor}%`, 'Conversao']} />
                <Bar dataKey="taxaConversao" name="Conversao" fill="#0066CC" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </VazioOuGrafico>
        </CardContent>
      </Card>

      {/* 3. Distribuicao de status */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuicao por status</CardTitle>
          <CardDescription>Como os contatos terminaram no periodo</CardDescription>
        </CardHeader>
        <CardContent>
          <VazioOuGrafico vazio={metricas.distribuicaoStatus.length === 0}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={metricas.distribuicaoStatus}
                  dataKey="total"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {metricas.distribuicaoStatus.map((fatia) => (
                    <Cell key={fatia.status} fill={STATUS_CORES[fatia.status as AgendamentoStatus]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={estiloTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </VazioOuGrafico>
        </CardContent>
      </Card>

      {/* 4. Comparecimento vs agendamento */}
      <Card>
        <CardHeader>
          <CardTitle>Comparecimentos x agendamentos</CardTitle>
          <CardDescription>Quanto do agendado virou visita na loja</CardDescription>
        </CardHeader>
        <CardContent>
          <VazioOuGrafico vazio={semDados}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={metricas.dadosDiarios} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAgendados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066CC" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0066CC" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCompareceram" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="label" tick={EIXO} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={estiloTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="agendados"
                  name="Agendados"
                  stroke="#0066CC"
                  fill="url(#gradAgendados)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="compareceram"
                  name="Compareceram"
                  stroke="#10B981"
                  fill="url(#gradCompareceram)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </VazioOuGrafico>
        </CardContent>
      </Card>
    </div>
  );
}
