'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Loja } from '@/lib/types/database';

export type LojaResumo = Pick<Loja, 'id' | 'nome' | 'codigo_loja' | 'cidade' | 'estado'>;

/**
 * Lojas visiveis para o usuario logado.
 * O filtro por papel e feito pelo RLS, nao aqui.
 *
 * NAO E USADO POR NENHUMA TELA HOJE: as paginas usam
 * `buscarLojasDoUsuario` no servidor. Fica para telas que precisem
 * recarregar sem navegacao.
 */
export function useLojas() {
  const [lojas, setLojas] = useState<LojaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    setCarregando(true);

    const { data, error } = await supabase
      .from('lojas')
      .select('id, nome, codigo_loja, cidade, estado')
      .eq('status', 'ativo')
      .order('nome');

    if (error) setErro(error.message);
    else {
      setLojas(data ?? []);
      setErro(null);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { lojas, carregando, erro, recarregar: carregar };
}
