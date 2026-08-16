'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarUsuarioAtual, podeGerenciarCadastros } from '@/lib/auth/session';
import { franqueadoSchema, lojaSchema, usuarioSchema } from '@/lib/validations/cadastros';
import type { ResultadoAction } from './agendamentos';

function objeto(formData: FormData): Record<string, string> {
  const saida: Record<string, string> = {};
  formData.forEach((valor, chave) => {
    saida[chave] = String(valor);
  });
  return saida;
}

/* ------------------------------- Lojas ------------------------------- */

export async function salvarLoja(formData: FormData, id?: string): Promise<ResultadoAction> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario || !podeGerenciarCadastros(usuario.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para gerenciar lojas.' };
  }
  if (!usuario.franqueado_id && usuario.role !== 'super_admin') {
    return { sucesso: false, mensagem: 'Usuario sem franqueado vinculado.' };
  }

  const parsed = lojaSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const dados = {
    ...parsed.data,
    endereco: parsed.data.endereco || null,
    telefone: parsed.data.telefone || null,
    gerente_nome: parsed.data.gerente_nome || null,
  };

  const { error } = id
    ? await supabase.from('lojas').update(dados).eq('id', id)
    : await supabase
        .from('lojas')
        .insert({ ...dados, franqueado_id: String(formData.get('franqueado_id') ?? usuario.franqueado_id) });

  if (error) {
    const duplicado = error.code === '23505';
    return {
      sucesso: false,
      mensagem: duplicado ? 'Ja existe uma loja com esse codigo.' : `Nao foi possivel salvar: ${error.message}`,
    };
  }

  revalidatePath('/dashboard/lojas');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: id ? 'Loja atualizada.' : 'Loja criada.' };
}

/* ------------------------------ Usuarios ----------------------------- */

/**
 * Cria um usuario: primeiro em auth.users (Admin API), depois o espelho em
 * public.usuarios e o vinculo com a loja. Se o espelho falhar, o usuario de
 * auth e removido para nao deixar conta orfa.
 */
export async function criarUsuario(formData: FormData): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para criar usuarios.' };
  }

  const parsed = usuarioSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }
  const dados = parsed.data;

  if (dados.role === 'agendador' && !dados.loja_id) {
    return { sucesso: false, mensagem: 'Escolha a loja do agendador.', erros: { loja_id: ['Campo obrigatorio'] } };
  }

  const franqueadoId = String(formData.get('franqueado_id') ?? gestor.franqueado_id ?? '');
  if (!franqueadoId) return { sucesso: false, mensagem: 'Franqueado nao identificado.' };

  const admin = createAdminClient();
  const senhaProvisoria = crypto.randomUUID().slice(0, 12) + 'A1!';

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: dados.email,
    password: senhaProvisoria,
    email_confirm: true,
    user_metadata: { nome: dados.nome },
  });

  if (erroAuth || !criado.user) {
    return { sucesso: false, mensagem: erroAuth?.message ?? 'Nao foi possivel criar a conta.' };
  }

  const { error: erroPerfil } = await admin.from('usuarios').insert({
    id: criado.user.id,
    email: dados.email,
    nome: dados.nome,
    role: dados.role,
    franqueado_id: franqueadoId,
  });

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { sucesso: false, mensagem: `Nao foi possivel salvar o perfil: ${erroPerfil.message}` };
  }

  if (dados.loja_id) {
    if (dados.role === 'agendador') {
      await admin.from('agendadores_lojas').insert({
        usuario_id: criado.user.id,
        loja_id: dados.loja_id,
        data_inicio: new Date().toISOString().slice(0, 10),
      });
    } else {
      await admin.from('participacoes_societarias').insert({
        usuario_id: criado.user.id,
        loja_id: dados.loja_id,
        percentual_participacao: dados.percentual_participacao ?? 100,
        cargo: dados.role === 'franqueado' ? 'franqueado' : 'diretor',
        data_inicio: new Date().toISOString().slice(0, 10),
      });
    }
  }

  revalidatePath('/dashboard/usuarios');
  return { sucesso: true, mensagem: `Usuario criado. Senha provisoria: ${senhaProvisoria}` };
}

/* ---------------------------- Franqueados ---------------------------- */

export async function salvarFranqueado(formData: FormData, id?: string): Promise<ResultadoAction> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario || usuario.role !== 'super_admin') {
    return { sucesso: false, mensagem: 'Apenas o super admin gerencia franqueados.' };
  }

  const parsed = franqueadoSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const dados = {
    nome: parsed.data.nome,
    cnpj: parsed.data.cnpj || null,
    email_contato: parsed.data.email_contato || null,
    telefone_contato: parsed.data.telefone_contato || null,
    status: parsed.data.status,
    data_contrato: parsed.data.data_contrato || null,
  };

  const { error } = id
    ? await supabase.from('franqueados').update(dados).eq('id', id)
    : await supabase.from('franqueados').insert(dados);

  if (error) return { sucesso: false, mensagem: `Nao foi possivel salvar: ${error.message}` };

  revalidatePath('/admin/franqueados');
  return { sucesso: true, mensagem: id ? 'Franqueado atualizado.' : 'Franqueado criado.' };
}
