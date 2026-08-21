'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AgendamentoComRelacoes, AgendamentoStatus } from '@/lib/types/database';

interface Filtros {
  lojaId?: string;
  agendadorId?: string;
  status?: AgendamentoStatus[];
  dataInicio?: string;
  dataFim?: string;
  limite?: number;
}

/**
 * Agendamentos com atualizacao em tempo real.
 * Pensado para telas abertas o dia inteiro (TV da loja, sala do diretor):
 * um insert de qualquer agendador aparece sem refresh.
 *
 * NAO E USADO POR NENHUMA TELA HOJE. As paginas buscam no servidor, que e
 * mais simples e evita expor a consulta ao cliente. Este hook fica como base
 * para a tela de acompanhamento ao vivo, se ela existir — e por nao ser
 * exercitado, nao tem a mesma cobertura de teste do resto.
 */
export function useAgendamentos(filtros: Filtros = {}) {
  const [agendamentos, setAgendamentos] = useState<AgendamentoComRelacoes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const { lojaId, agendadorId, dataInicio, dataFim, limite } = filtros;
  const statusChave = filtros.status?.join(',') ?? '';

  const carregar = useCallback(async () => {
    const supabase = createClient();
    setCarregando(true);

    let query = supabase
      .from('agendamentos')
      .select(
        `*,
         loja:lojas!agendamentos_loja_id_fkey (id, nome, codigo_loja),
         agendador:usuarios!agendamentos_agendador_id_fkey (id, nome)`
      )
      .order('data_agendamento', { ascending: false })
      .limit(limite ?? 500);

    if (lojaId) query = query.eq('loja_id', lojaId);
    if (agendadorId) query = query.eq('agendador_id', agendadorId);
    if (statusChave) query = query.in('status', statusChave.split(',') as AgendamentoStatus[]);
    if (dataInicio) query = query.gte('data_agendamento', dataInicio);
    if (dataFim) query = query.lte('data_agendamento', dataFim);

    const { data, error } = await query;
    if (error) setErro(error.message);
    else {
      setAgendamentos((data ?? []) as unknown as AgendamentoComRelacoes[]);
      setErro(null);
    }
    setCarregando(false);
  }, [lojaId, agendadorId, statusChave, dataInicio, dataFim, limite]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const supabase = createClient();
    let agendado: ReturnType<typeof setTimeout> | null = null;

    /**
     * Recarga agrupada, nao uma por evento.
     *
     * Sem isto, cada mudanca na tabela dispara uma consulta completa POR
     * TELA ABERTA. Com 18 agendadores lancando durante o dia e algumas telas
     * de acompanhamento ligadas, uma rajada de dez insercoes vira dezenas de
     * consultas — e o dado exibido no fim seria o mesmo de uma so.
     */
    function recarregarEmBreve() {
      if (agendado) clearTimeout(agendado);
      agendado = setTimeout(() => {
        agendado = null;
        void carregar();
      }, 400);
    }

    const canal = supabase
      .channel('agendamentos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, recarregarEmBreve)
      .subscribe();

    return () => {
      if (agendado) clearTimeout(agendado);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  return { agendamentos, carregando, erro, recarregar: carregar };
}
