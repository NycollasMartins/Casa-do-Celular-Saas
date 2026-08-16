'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Usuario, UserRole } from '@/lib/types/database';

/** Usuarios visiveis para quem esta logado (RLS aplica o recorte). */
export function useUsuarios(role?: UserRole) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    setCarregando(true);

    let query = supabase.from('usuarios').select('*').order('nome');
    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) setErro(error.message);
    else {
      setUsuarios((data ?? []) as Usuario[]);
      setErro(null);
    }
    setCarregando(false);
  }, [role]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { usuarios, carregando, erro, recarregar: carregar };
}
