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

export const metadata = { title: 'Agendamentos · Casa do Celular' };

export default async function AgendamentosPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const usuario = await exigirUsuario();
  const filtros = lerFiltros(searchParams);

  const [agendamentos, lojas, agendadores] = await Promise.all([
    buscarAgendamentos({ ...filtros, limite: 1000 }),
    buscarLojasDoUsuario(),
    buscarAgendadoresDoUsuario(),
  ]);

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
      />
    </div>
  );
}
