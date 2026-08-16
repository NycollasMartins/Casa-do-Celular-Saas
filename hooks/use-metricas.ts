'use client';

import { useEffect, useState } from 'react';
import type { FiltroMetricas, ResumoMetricas } from '@/lib/types/metricas';

/** Consome /api/metricas/resumo. Use quando os filtros mudam sem navegacao. */
export function useMetricas(filtros: FiltroMetricas = {}) {
  const [metricas, setMetricas] = useState<ResumoMetricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const { lojaId, periodo, dataInicio, dataFim } = filtros;

  useEffect(() => {
    const controlador = new AbortController();

    async function carregar() {
      setCarregando(true);
      const params = new URLSearchParams();
      if (lojaId) params.set('loja', lojaId);
      if (periodo) params.set('periodo', periodo);
      if (dataInicio) params.set('inicio', dataInicio);
      if (dataFim) params.set('fim', dataFim);

      try {
        const resposta = await fetch(`/api/metricas/resumo?${params.toString()}`, {
          signal: controlador.signal,
        });
        if (!resposta.ok) throw new Error('Falha ao carregar metricas');
        setMetricas((await resposta.json()) as ResumoMetricas);
        setErro(null);
      } catch (excecao) {
        if ((excecao as Error).name !== 'AbortError') setErro((excecao as Error).message);
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
    return () => controlador.abort();
  }, [lojaId, periodo, dataInicio, dataFim]);

  return { metricas, carregando, erro };
}
