import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgendamentosTable } from '@/components/dashboard/agendamentos-table';
import { LojaSelector } from '@/components/dashboard/loja-selector';
import { PeriodoSelector } from '@/components/dashboard/periodo-selector';
import { exigirUsuario } from '@/lib/auth/session';
import {
  buscarAgendadoresDoUsuario,
  buscarAgendamentos,
  buscarLojasDoUsuario,
} from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { createClient } from '@/lib/supabase/server';
import type { Venda } from '@/lib/types/database';

export const metadata = { title: 'Agendamentos · Casa do Celular' };

export default async function AgendamentosPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const usuario = await exigirUsuario();
  const filtros = lerFiltros(searchParams);

  const [agendamentos, lojas, agendadores] = await Promise.all([
    buscarAgendamentos({ ...filtros, limite: 1000 }),
    buscarLojasDoUsuario(),
    buscarAgendadoresDoUsuario(),
  ]);

  // Vendas dos atendimentos com comparecimento. Consulta separada porque a
  // maioria dos agendamentos nao tem venda: um join carregaria coluna nula
  // na maior parte das linhas.
  const comparecidos = agendamentos.filter((item) => item.status === 'compareceu').map((item) => item.id);

  const vendas: Record<string, Pick<Venda, 'id' | 'valor' | 'descricao' | 'data_venda'>> = {};

  if (comparecidos.length > 0) {
    const supabase = createClient();
    const { data } = await supabase
      .from('vendas')
      .select('id, agendamento_id, valor, descricao, data_venda')
      .in('agendamento_id', comparecidos.slice(0, 200));

    for (const venda of data ?? []) {
      vendas[venda.agendamento_id] = {
        id: venda.id,
        valor: Number(venda.valor),
        descricao: venda.descricao,
        data_venda: venda.data_venda,
      };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Agendamentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {agendamentos.length} registros no periodo selecionado.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <LojaSelector lojas={lojas} role={usuario.role} lojaSelecionada={filtros.lojaId} />
          <PeriodoSelector
            periodo={filtros.periodo ?? '30d'}
            dataInicio={filtros.dataInicio}
            dataFim={filtros.dataFim}
          />
          <Button asChild>
            <Link href="/dashboard/agendamentos/novo">
              <Plus className="h-4 w-4" aria-hidden />
              Novo agendamento
            </Link>
          </Button>
        </div>
      </div>

      <AgendamentosTable
        agendamentos={agendamentos}
        role={usuario.role}
        lojas={lojas}
        agendadores={agendadores}
        statusInicial={filtros.status}
        vendas={vendas}
      />
    </div>
  );
}
