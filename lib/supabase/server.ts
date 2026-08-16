import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/database';

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Sempre usa a anon key: toda a autorizacao continua sendo feita pelo RLS.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components nao podem escrever cookies. O middleware
            // renova a sessao, entao ignorar aqui e seguro.
          }
        },
      },
    }
  );
}
