'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { novaSenhaSchema } from '@/lib/validations/auth';

export interface ResultadoAuth {
  sucesso: boolean;
  mensagem?: string;
  erros?: Record<string, string[] | undefined>;
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

  const envio = supabase.auth.resetPasswordForEmail(email, {
    // O link precisa cair na tela de definir senha. Mandar para /dashboard
    // apenas loga a pessoa e a senha antiga continua valendo.
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback?next=/auth/nova-senha`,
  });

  // O envio depende do SMTP do Supabase, que tem limite de taxa baixo e pode
  // demorar. Sem teto, a promessa fica pendurada e o botao do formulario
  // permanece em "carregando" para sempre: o usuario nao recebe resposta
  // nenhuma e nao sabe se pode tentar de novo.
  const ESPERA_MAXIMA_MS = 10_000;
  const resultado = await Promise.race([
    envio.then(({ error }) => (error ? ('erro' as const) : ('ok' as const))),
    new Promise<'expirou'>((resolve) => setTimeout(() => resolve('expirou'), ESPERA_MAXIMA_MS)),
  ]).catch(() => 'erro' as const);

  // Mensagem condicional de proposito: confirmar o envio revelaria que a
  // conta existe.
  if (resultado === 'ok') {
    return { sucesso: true, mensagem: 'Se a conta existir, o link chega em instantes.' };
  }

  // Nem "enviado" nem "conta inexistente" — apenas que nao deu para
  // concluir. Continua sem revelar se o e-mail esta cadastrado.
  return {
    sucesso: false,
    mensagem: 'Nao conseguimos concluir agora. Tente de novo em alguns minutos.',
  };
}

/**
 * Define a senha definitiva. Serve tanto para a recuperacao por e-mail
 * quanto para a troca obrigatoria do primeiro acesso — nos dois casos ja
 * existe sessao ativa quando o formulario e enviado.
 *
 * Limpar `senha_provisoria` e o que libera o usuario do bloqueio aplicado
 * pelo middleware.
 */
export async function definirNovaSenha(formData: FormData): Promise<ResultadoAuth> {
  const parsed = novaSenhaSchema.safeParse({
    senha: String(formData.get('senha') ?? ''),
    confirmacao: String(formData.get('confirmacao') ?? ''),
  });

  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { sucesso: false, mensagem: 'Sessao expirada. Peca um novo link.' };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.senha,
    data: { senha_provisoria: false },
  });

  if (error) {
    // O Supabase recusa reutilizar a senha atual; vale dizer isso em vez de
    // repetir a mensagem generica.
    const mesmaSenha = error.message.toLowerCase().includes('different from the old');
    return {
      sucesso: false,
      mensagem: mesmaSenha ? 'A nova senha precisa ser diferente da atual.' : 'Nao foi possivel salvar a senha.',
    };
  }

  revalidatePath('/', 'layout');
  return { sucesso: true, mensagem: 'Senha atualizada.' };
}
