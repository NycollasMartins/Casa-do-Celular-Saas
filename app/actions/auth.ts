'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface ResultadoAuth {
  sucesso: boolean;
  mensagem?: string;
}

export async function entrar(formData: FormData): Promise<ResultadoAuth> {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (!email || !senha) return { sucesso: false, mensagem: 'Informe e-mail e senha.' };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Mensagem generica de proposito: nao revela se o e-mail existe.
    return { sucesso: false, mensagem: 'E-mail ou senha incorretos.' };
  }

  revalidatePath('/', 'layout');
  return { sucesso: true };
}

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/auth/login');
}

export async function enviarLinkDeRecuperacao(formData: FormData): Promise<ResultadoAuth> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { sucesso: false, mensagem: 'Informe o e-mail da conta.' };

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback?next=/dashboard`,
  });

  if (error) return { sucesso: false, mensagem: 'Nao foi possivel enviar o e-mail agora.' };
  return { sucesso: true, mensagem: 'Se a conta existir, o link chega em instantes.' };
}
