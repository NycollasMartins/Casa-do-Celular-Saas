'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { buscarUsuarioAtual } from '@/lib/auth/session';
import { agendamentoSchema, novoAgendamentoSchema } from '@/lib/validations/agendamento';
import { calcularMetricas, buscarLojasDoUsuario } from '@/lib/supabase/queries';
import type { FiltroMetricas } from '@/lib/types/metricas';

export interface ResultadoAction {
  sucesso: boolean;
  mensagem?: string;
  /** Erros por campo, no formato que o React Hook Form consome. */
  erros?: Record<string, string[]>;
  id?: string;
}

function extrair(formData: FormData) {
  return {
    cliente_nome: String(formData.get('cliente_nome') ?? ''),
    cliente_email: String(formData.get('cliente_email') ?? ''),
    cliente_cpf: String(formData.get('cliente_cpf') ?? ''),
    cliente_telefone: String(formData.get('cliente_telefone') ?? ''),
    data_agendamento: String(formData.get('data_agendamento') ?? ''),
    status: String(formData.get('status') ?? 'contatado'),
    observacoes: String(formData.get('observacoes') ?? ''),
    loja_id: String(formData.get('loja_id') ?? ''),
  };
}

function revalidar() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/agendamentos');
  revalidatePath('/dashboard/relatorios');
}

/**
 * Cria um agendamento.
 * franqueado_id, loja_id e agendador_id nunca vem do formulario visivel:
 * sao derivados da sessao. O RLS ainda revalida tudo no banco, mas
 * resolver aqui evita depender do cliente para a integridade do tenant.
 */
export async function criarAgendamento(formData: FormData): Promise<ResultadoAction> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada. Entre novamente.' };

  const parsed = novoAgendamentoSchema.safeParse(extrair(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos destacados.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const dados = parsed.data;

  // Agendador so lanca na propria loja, independente do que veio no form.
  const lojasPermitidas = await buscarLojasDoUsuario();
  const lojaEscolhida =
    usuario.role === 'agendador' ? lojasPermitidas[0]?.id : dados.loja_id;

  if (!lojaEscolhida || !lojasPermitidas.some((loja) => loja.id === lojaEscolhida)) {
    return { sucesso: false, mensagem: 'Voce nao tem acesso a esta loja.' };
  }

  // franqueado_id sai da loja: e a fonte de verdade do tenant.
  const { data: loja, error: erroLoja } = await supabase
    .from('lojas')
    .select('franqueado_id')
    .eq('id', lojaEscolhida)
    .single();

  if (erroLoja || !loja) return { sucesso: false, mensagem: 'Loja nao encontrada.' };

  const { data, error } = await supabase
    .from('agendamentos')
    .insert({
      franqueado_id: loja.franqueado_id,
      loja_id: lojaEscolhida,
      agendador_id: usuario.id,
      cliente_nome: dados.cliente_nome,
      cliente_email: dados.cliente_email ?? null,
      cliente_cpf: dados.cliente_cpf,
      cliente_telefone: dados.cliente_telefone,
      data_agendamento: dados.data_agendamento,
      status: dados.status,
      observacoes: dados.observacoes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { sucesso: false, mensagem: `Nao foi possivel salvar: ${error.message}` };
  }

  revalidar();
  return { sucesso: true, mensagem: 'Agendamento salvo.', id: data.id };
}

/** Atualiza um agendamento existente. O RLS bloqueia o que nao for do usuario. */
export async function atualizarAgendamento(id: string, formData: FormData): Promise<ResultadoAction> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada. Entre novamente.' };

  // Na edicao a data pode ser passada (marcar comparecimento retroativo).
  const parsed = agendamentoSchema.safeParse(extrair(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos destacados.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const dados = parsed.data;

  const { data: existente } = await supabase
    .from('agendamentos')
    .select('id, loja_id')
    .eq('id', id)
    .maybeSingle();

  if (!existente) return { sucesso: false, mensagem: 'Agendamento nao encontrado ou sem permissao.' };

  const { error } = await supabase
    .from('agendamentos')
    .update({
      cliente_nome: dados.cliente_nome,
      cliente_email: dados.cliente_email ?? null,
      cliente_cpf: dados.cliente_cpf,
      cliente_telefone: dados.cliente_telefone,
      data_agendamento: dados.data_agendamento,
      status: dados.status,
      observacoes: dados.observacoes ?? null,
    })
    .eq('id', id);

  if (error) return { sucesso: false, mensagem: `Nao foi possivel atualizar: ${error.message}` };

  revalidar();
  return { sucesso: true, mensagem: 'Agendamento atualizado.', id };
}

/** Exclui um agendamento. Agendador nao tem essa permissao (bloqueado no RLS). */
export async function deletarAgendamento(id: string): Promise<ResultadoAction> {
  const usuario = await buscarUsuarioAtual();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada. Entre novamente.' };

  if (usuario.role === 'agendador') {
    return { sucesso: false, mensagem: 'Agendadores nao podem excluir agendamentos.' };
  }

  const supabase = createClient();
  const { error, count } = await supabase
    .from('agendamentos')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) return { sucesso: false, mensagem: `Nao foi possivel excluir: ${error.message}` };
  if (!count) return { sucesso: false, mensagem: 'Agendamento nao encontrado ou sem permissao.' };

  revalidar();
  return { sucesso: true, mensagem: 'Agendamento excluido.' };
}

/** Metricas do dashboard (usada tambem pelos filtros client-side). */
export async function buscarMetricas(filtros: FiltroMetricas = {}) {
  return calcularMetricas(filtros);
}

export async function listarLojasDoUsuario() {
  return buscarLojasDoUsuario();
}
