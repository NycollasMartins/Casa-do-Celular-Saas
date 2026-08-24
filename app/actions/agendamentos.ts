'use server';

import { revalidar as revalidarTelas } from '@/lib/revalidacao';
import { createClient } from '@/lib/supabase/server';
import { usuarioComAcesso, podeGerenciarCadastros } from '@/lib/auth/session';
import { agendamentoSchema, novoAgendamentoSchema, vendaSchema } from '@/lib/validations/agendamento';
import { calcularMetricas, buscarLojasDoUsuario, lerPaginado } from '@/lib/supabase/queries';
import type { FiltroMetricas } from '@/lib/types/metricas';
import { camposAnonimizados, normalizarCpfParaBusca } from '@/lib/lgpd';

export interface ResultadoAction {
  sucesso: boolean;
  mensagem?: string;
  /** Erros por campo, no formato que o React Hook Form consome. */
  erros?: Record<string, string[]>;
  id?: string;
  /**
   * Senha de primeiro acesso, quando a acao gera uma.
   *
   * Vem em campo proprio, e nao embutida na mensagem, porque a tela precisa
   * exibi-la de forma copiavel e permanente — nao num aviso que some.
   */
  senhaProvisoria?: string;
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

/**
 * Metas entrou na lista: a tela mostra agendamentos, vendas e faturamento
 * por agendador, e ficava com numero velho depois de qualquer lancamento.
 */
function revalidar() {
  revalidarTelas('agendamento');
}

/**
 * Cria um agendamento.
 * franqueado_id, loja_id e agendador_id nunca vem do formulario visivel:
 * sao derivados da sessao. O RLS ainda revalida tudo no banco, mas
 * resolver aqui evita depender do cliente para a integridade do tenant.
 */
export async function criarAgendamento(formData: FormData): Promise<ResultadoAction> {
  const usuario = await usuarioComAcesso();
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
  const usuario = await usuarioComAcesso();
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
  const usuario = await usuarioComAcesso();
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


/* ------------------------------- LGPD -------------------------------- */

/**
 * Atende ao pedido de eliminacao do titular (LGPD art. 18, VI).
 *
 * Anonimiza TODOS os agendamentos do CPF dentro do escopo que o usuario
 * enxerga — o pedido do titular vale para todo o tratamento, nao para um
 * registro isolado. O RLS limita naturalmente ao tenant e as lojas
 * permitidas, sem precisarmos repetir a regra aqui.
 *
 * Restrito a quem gerencia: pedido de titular e responsabilidade do
 * controlador, nao do operador de balcao.
 */
export async function anonimizarPorCpf(cpf: string): Promise<ResultadoAction & { total?: number }> {
  const gestor = await usuarioComAcesso();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Apenas o franqueado atende pedidos de titular.' };
  }

  const cpfFormatado = normalizarCpfParaBusca(cpf);
  if (!cpfFormatado) {
    return { sucesso: false, mensagem: 'Informe um CPF com 11 digitos.' };
  }

  const supabase = createClient();

  // Paginado, e aqui o motivo pesa mais que em outras telas.
  //
  // Leitura sem paginar e cortada pelo teto de linhas do PostgREST sem
  // devolver erro. Numa lista isso mostra dado a menos; AQUI significaria
  // anonimizar parte dos registros do titular, responder "pronto" e deixar
  // dado pessoal para tras — num pedido que a LGPD obriga a atender por
  // inteiro (art. 18, VI).
  let alvos: { id: string }[];
  try {
    alvos = await lerPaginado<{ id: string }>(
      (de, ate) =>
        supabase
          .from('agendamentos')
          .select('id')
          .eq('cliente_cpf', cpfFormatado)
          .is('anonimizado_em', null)
          .range(de, ate),
      { oQue: 'os registros do titular' }
    );
  } catch (excecao) {
    return {
      sucesso: false,
      mensagem: excecao instanceof Error ? excecao.message : 'Nao foi possivel consultar.',
    };
  }

  if (alvos.length === 0) {
    return { sucesso: false, mensagem: 'Nenhum registro com dados pessoais para este CPF.' };
  }

  const { error } = await supabase
    .from('agendamentos')
    .update(camposAnonimizados())
    .in(
      'id',
      alvos.map((alvo) => alvo.id)
    );

  if (error) return { sucesso: false, mensagem: `Nao foi possivel anonimizar: ${error.message}` };

  revalidarTelas('privacidade');

  return {
    sucesso: true,
    total: alvos.length,
    mensagem: `${alvos.length} registro(s) anonimizado(s). A acao nao pode ser desfeita.`,
  };
}

/** Quantos registros o CPF tem, para a tela confirmar antes de anonimizar. */
export async function contarRegistrosDoCpf(
  cpf: string
): Promise<{ total: number; anonimizados: number; erro?: string }> {
  const gestor = await usuarioComAcesso();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { total: 0, anonimizados: 0, erro: 'Sem permissao.' };
  }

  const cpfFormatado = normalizarCpfParaBusca(cpf);
  if (!cpfFormatado) return { total: 0, anonimizados: 0, erro: 'Informe um CPF com 11 digitos.' };

  const supabase = createClient();

  // E o numero que a tela mostra ANTES de confirmar. Cortado, ele diria "3
  // registros" onde ha mais, e quem confirma acha que sabe o tamanho do que
  // esta fazendo.
  let linhas: { anonimizado_em: string | null }[];
  try {
    linhas = await lerPaginado<{ anonimizado_em: string | null }>(
      (de, ate) =>
        supabase
          .from('agendamentos')
          .select('anonimizado_em')
          .eq('cliente_cpf', cpfFormatado)
          .range(de, ate),
      { oQue: 'os registros do titular' }
    );
  } catch (excecao) {
    return {
      total: 0,
      anonimizados: 0,
      erro: excecao instanceof Error ? excecao.message : 'Nao foi possivel consultar.',
    };
  }
  return {
    total: linhas.length,
    anonimizados: linhas.filter((linha) => linha.anonimizado_em !== null).length,
  };
}

/* ------------------------------- Vendas ------------------------------- */

/**
 * Registra a venda de um atendimento. Fecha o funil: ate aqui o sistema
 * media quem apareceu, nao quem comprou.
 *
 * Escreve pelo cliente normal para o RLS conferir o escopo, e `registrada_por`
 * vai como auth.uid() porque a policy de insert exige que sejam iguais — o
 * lancamento financeiro fica com autoria de quem realmente lancou.
 */
export async function registrarVenda(
  agendamentoId: string,
  formData: FormData
): Promise<ResultadoAction> {
  const usuario = await usuarioComAcesso();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada.' };

  const parsed = vendaSchema.safeParse({
    valor: formData.get('valor'),
    descricao: formData.get('descricao') ?? '',
    data_venda: formData.get('data_venda'),
  });

  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase.from('vendas').insert({
    agendamento_id: agendamentoId,
    valor: parsed.data.valor,
    descricao: parsed.data.descricao || null,
    data_venda: parsed.data.data_venda,
    registrada_por: usuario.id,
  });

  if (error) {
    // 23505: ja existe venda para este atendimento (unique agendamento_id).
    if (error.code === '23505') {
      return { sucesso: false, mensagem: 'Este atendimento ja tem venda registrada.' };
    }
    // 23514: o trigger barrou porque o agendamento nao esta como compareceu.
    if (error.code === '23514') {
      return {
        sucesso: false,
        mensagem: 'Marque o comparecimento antes de registrar a venda.',
      };
    }
    return { sucesso: false, mensagem: `Nao foi possivel registrar: ${error.message}` };
  }

  revalidarTelas('venda');
  return { sucesso: true, mensagem: 'Venda registrada.' };
}

export async function atualizarVenda(id: string, formData: FormData): Promise<ResultadoAction> {
  const usuario = await usuarioComAcesso();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada.' };

  const parsed = vendaSchema.safeParse({
    valor: formData.get('valor'),
    descricao: formData.get('descricao') ?? '',
    data_venda: formData.get('data_venda'),
  });

  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('vendas')
    .update({
      valor: parsed.data.valor,
      descricao: parsed.data.descricao || null,
      data_venda: parsed.data.data_venda,
    })
    .eq('id', id);

  if (error) return { sucesso: false, mensagem: `Nao foi possivel salvar: ${error.message}` };

  revalidarTelas('venda');
  return { sucesso: true, mensagem: 'Venda atualizada.' };
}

/** Apagar venda e gestor: e historico financeiro, nao rascunho. */
export async function removerVenda(id: string): Promise<ResultadoAction> {
  const usuario = await usuarioComAcesso();
  if (!usuario) return { sucesso: false, mensagem: 'Sessao expirada.' };
  if (usuario.role === 'agendador') {
    return { sucesso: false, mensagem: 'Apenas gestores removem venda registrada.' };
  }

  const supabase = createClient();
  const { error } = await supabase.from('vendas').delete().eq('id', id);
  if (error) return { sucesso: false, mensagem: `Nao foi possivel remover: ${error.message}` };

  revalidarTelas('venda');
  return { sucesso: true, mensagem: 'Venda removida.' };
}
