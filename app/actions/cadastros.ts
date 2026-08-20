'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarUsuarioAtual, podeGerenciarCadastros } from '@/lib/auth/session';
import {
  franqueadoSchema,
  lojaSchema,
  usuarioEdicaoSchema,
  usuarioSchema,
} from '@/lib/validations/cadastros';
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
    // `senha_provisoria` obriga a troca no primeiro acesso (ver middleware).
    user_metadata: { nome: dados.nome, senha_provisoria: true },
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

/** Data de hoje em ISO curto, formato aceito pelas colunas `date`. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atualiza nome, papel e lotacao. Escreve pelo cliente normal de proposito:
 * o RLS confere se o gestor pode mexer neste usuario e nesta loja, em vez de
 * confiarmos so na checagem de papel feita aqui em cima.
 *
 * Trocar de loja nao apaga o vinculo antigo — fecha com `data_fim` e abre um
 * novo. E o que preserva a leitura historica de quem respondia por qual loja.
 */
export async function atualizarUsuario(id: string, formData: FormData): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para editar usuarios.' };
  }

  const parsed = usuarioEdicaoSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }
  const dados = parsed.data;

  if (dados.role === 'agendador' && !dados.loja_id) {
    return { sucesso: false, mensagem: 'Escolha a loja do agendador.', erros: { loja_id: ['Campo obrigatorio'] } };
  }

  const supabase = createClient();

  const { error: erroPerfil } = await supabase
    .from('usuarios')
    .update({ nome: dados.nome, role: dados.role })
    .eq('id', id);

  if (erroPerfil) return { sucesso: false, mensagem: `Nao foi possivel salvar: ${erroPerfil.message}` };

  if (dados.loja_id) {
    if (dados.role === 'agendador') {
      const { data: vinculo } = await supabase
        .from('agendadores_lojas')
        .select('id, loja_id')
        .eq('usuario_id', id)
        .is('data_fim', null)
        .maybeSingle();

      if (vinculo?.loja_id !== dados.loja_id) {
        if (vinculo) {
          await supabase.from('agendadores_lojas').update({ data_fim: hoje() }).eq('id', vinculo.id);
        }

        // `agendadores_lojas` tem unique (usuario_id, loja_id) sem filtro de
        // data_fim — diferente de participacoes_societarias, cujo indice e
        // parcial. Quem volta a uma loja onde ja esteve tem a linha antiga
        // reaberta; inserir de novo violaria a constraint.
        const { data: anterior } = await supabase
          .from('agendadores_lojas')
          .select('id')
          .eq('usuario_id', id)
          .eq('loja_id', dados.loja_id)
          .maybeSingle();

        if (anterior) {
          await supabase
            .from('agendadores_lojas')
            .update({ data_inicio: hoje(), data_fim: null })
            .eq('id', anterior.id);
        } else {
          await supabase
            .from('agendadores_lojas')
            .insert({ usuario_id: id, loja_id: dados.loja_id, data_inicio: hoje() });
        }
      }
    } else {
      const { data: participacao } = await supabase
        .from('participacoes_societarias')
        .select('id, loja_id')
        .eq('usuario_id', id)
        .is('data_fim', null)
        .maybeSingle();

      if (participacao?.loja_id !== dados.loja_id) {
        if (participacao) {
          await supabase.from('participacoes_societarias').update({ data_fim: hoje() }).eq('id', participacao.id);
        }
        await supabase.from('participacoes_societarias').insert({
          usuario_id: id,
          loja_id: dados.loja_id,
          percentual_participacao: dados.percentual_participacao ?? 100,
          cargo: dados.role === 'franqueado' ? 'franqueado' : 'diretor',
          data_inicio: hoje(),
        });
      }
    }
  }

  revalidatePath('/dashboard/usuarios');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: 'Usuario atualizado.' };
}

/**
 * Liga e desliga o acesso. Desligar fecha os vinculos vigentes e revoga a
 * sessao no Auth — sem isso o token atual continua valido ate expirar.
 */
export async function definirStatusUsuario(
  id: string,
  status: 'ativo' | 'inativo'
): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para alterar acessos.' };
  }
  if (gestor.id === id) {
    return { sucesso: false, mensagem: 'Voce nao pode desativar a propria conta.' };
  }

  const supabase = createClient();
  const { error } = await supabase.from('usuarios').update({ status }).eq('id', id);
  if (error) return { sucesso: false, mensagem: `Nao foi possivel alterar: ${error.message}` };

  if (status === 'inativo') {
    await supabase.from('agendadores_lojas').update({ data_fim: hoje() }).eq('usuario_id', id).is('data_fim', null);
    await supabase
      .from('participacoes_societarias')
      .update({ data_fim: hoje() })
      .eq('usuario_id', id)
      .is('data_fim', null);

    // Derruba a sessao ativa. Se falhar, o RLS ja barra o acesso — por isso
    // o erro nao aborta a operacao.
    const admin = createAdminClient();
    await admin.auth.admin.signOut(id, 'global').catch(() => undefined);
  } else {
    // Reativar so o status devolveria o login sem devolver a lotacao: o
    // desligamento fechou os vinculos, e sem loja ativa o RLS entrega tela
    // vazia. Reabre o ultimo vinculo encerrado para restaurar o estado.
    const { data: vinculo } = await supabase
      .from('agendadores_lojas')
      .select('id')
      .eq('usuario_id', id)
      .not('data_fim', 'is', null)
      .order('data_fim', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vinculo) {
      await supabase.from('agendadores_lojas').update({ data_fim: null }).eq('id', vinculo.id);
    }

    const { data: participacao } = await supabase
      .from('participacoes_societarias')
      .select('id')
      .eq('usuario_id', id)
      .not('data_fim', 'is', null)
      .order('data_fim', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (participacao) {
      await supabase.from('participacoes_societarias').update({ data_fim: null }).eq('id', participacao.id);
    }
  }

  revalidatePath('/dashboard/usuarios');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: status === 'inativo' ? 'Acesso encerrado.' : 'Acesso reativado.' };
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
