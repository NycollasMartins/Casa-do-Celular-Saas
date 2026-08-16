import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Cliente com service role: IGNORA o RLS.
 * Use somente em server actions ja protegidas por checagem de papel
 * (hoje: criacao de usuarios na Admin API). Nunca importe em client components.
 */
export function createAdminClient() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY nao configurada.');

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
