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
  emLotes,
  lerPaginado,
} from '@/lib/supabase/queries';
import { lerFiltros, type ParametrosBusca } from '@/lib/filtros';
import { createClient } from '@/lib/supabase/server';
import type { Venda } from '@/lib/types/database';

export const metadata = { title: 'Agendamentos · Casa do Celular' };

/**
 * A tabela pagina no cliente, entao carrega uma janela em vez do periodo
 * inteiro. Quando a janela enche, a tela DIZ que encheu — antes o rotulo
 * afirmava "N registros no periodo" mostrando o teto, o que e mentira
 * quando ha mais.
 */
const TETO_DA_TABELA = 1000;

export default async function AgendamentosPage({ searchParams }: { searchParams: ParametrosBusca }) {
  const usuario = await exigirUsuario();
  const filtros = lerFiltros(searchParams);

  const [agendamentos, lojas, agendadores] = await Promise.all([
    buscarAgendamentos({ ...filtros, limite: TETO_DA_TABELA }),
    buscarLojasDoUsuario(),
    buscarAgendadoresDoUsuario(),
  ]);

  // Vendas dos atendimentos com comparecimento. Consulta separada porque a
  // maioria dos agendamentos nao tem venda: um join carregaria coluna nula
  // na maior parte das linhas.
  const comparecidos = agendamentos.filter((item) => item.status === 'compareceu').map((item) => item.id);

  const vendas: Record<string, Pick<Venda, 'id' | 'valor' | 'descricao' | 'data_venda'>> = {};
  const lembretes: Record<string, { status: 'enviada' | 'falhou'; canal: string; detalhe: string | null }> =
    {};

  // Lembretes so fazem sentido para quem tem visita marcada. Buscar para a
  // lista inteira traria linha para agendamento que a rotina nunca alcanca.
  const comVisita = agendamentos
    .filter((item) => item.status === 'agendado' || item.status === 'compareceu' || item.status === 'nao_compareceu')
    .map((item) => item.id);

  if (comVisita.length > 0) {
    const supabase = createClient();

    // Em lotes ate o fim, nao so o primeiro. Cortar em 200 fazia o sininho
    // sumir do 201o em diante — o lembrete tinha saido e a tela dizia que
    // nao.
    // DUAS paginacoes, e as duas sao necessarias.
    //
    // `emLotes` divide os IDs para a URL nao estourar. Dentro de cada lote,
    // `lerPaginado` existe porque notificacoes tem VARIAS linhas por
    // agendamento: o indice unico e parcial, so cobre `status = 'enviada'`,
    // e falhas precisam poder se repetir para uma queda do provedor nao
    // impedir a reentrega para sempre.
    //
    // Duzentos agendamentos com seis tentativas cada passam do teto de linhas
    // do servidor. Como a ordem e decrescente, o corte levaria as mais antigas
    // — e agendamento inteiro ficaria sem sininho. Exatamente o defeito que o
    // comentario acima diz ter corrigido, voltando por outra porta.
    const linhas = await emLotes(comVisita, (lote) =>
      lerPaginado<{ agendamento_id: string; status: string; canal: string; detalhe: string | null }>(
        (de, ate) =>
          supabase
            .from('notificacoes')
            .select('agendamento_id, status, canal, detalhe')
            .eq('tipo', 'vespera')
            .in('agendamento_id', lote)
            .order('criada_em', { ascending: false })
            .range(de, ate),
        { oQue: 'os lembretes' }
      )
    );

    // A consulta vem da mais recente para a mais antiga e a tabela permite
    // varias falhas por agendamento; a primeira ocorrencia de cada id e a
    // que vale.
    for (const linha of linhas) {
      if (lembretes[linha.agendamento_id]) continue;
      lembretes[linha.agendamento_id] = {
        status: linha.status as 'enviada' | 'falhou',
        canal: linha.canal,
        detalhe: linha.detalhe,
      };
    }
  }

  if (comparecidos.length > 0) {
    const supabase = createClient();

    // Mesmo motivo do bloco acima: cortar em 200 mostrava a carteira cinza —
    // "registrar venda" — em atendimentos que ja tinham venda, e o clique
    // devolvia "ja tem venda registrada" sem o usuario entender por que.
    // Aqui uma venda por agendamento e garantido por trigger, entao o lote de
    // 200 nao alcanca o teto do servidor. Mesmo assim passa por `lerPaginado`:
    // depender desse raciocinio e o que faz a proxima consulta parecida nascer
    // sem protecao. E o erro deixa de ser engolido — mostrar "sem venda" por
    // falha de consulta e afirmar algo falso na tela.
    const linhas = await emLotes(comparecidos, (lote) =>
      lerPaginado<{
        id: string;
        agendamento_id: string;
        valor: number;
        descricao: string | null;
        data_venda: string;
      }>(
        (de, ate) =>
          supabase
            .from('vendas')
            .select('id, agendamento_id, valor, descricao, data_venda')
            .in('agendamento_id', lote)
            .range(de, ate),
        { oQue: 'as vendas' }
      )
    );

    for (const venda of linhas) {
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
            {agendamentos.length >= TETO_DA_TABELA
              ? `Mostrando os ${TETO_DA_TABELA.toLocaleString('pt-BR')} mais recentes. Refine o periodo ou a loja para ver o resto.`
              : `${agendamentos.length} registros no periodo selecionado.`}
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
        lembretes={lembretes}
      />
    </div>
  );
}
