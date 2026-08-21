'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarUsuarioAtual, podeGerenciarCadastros } from '@/lib/auth/session';
import {
  franqueadoSchema,
  lojaSchema,
  metaSchema,
  participacaoSchema,
  transferenciaSchema,
  usuarioEdicaoSchema,
  usuarioSchema,
} from '@/lib/validations/cadastros';
import { planejarVinculos, selecionarParaReabrir, tabelaDoVinculo } from '@/lib/vinculos';
import { hojeNaLoja } from '@/lib/semana';
import type { ResultadoAction } from './agendamentos';

/**
 * Hoje para as colunas `date`. Delega a fonte unica: toISOString devolveria
 * UTC, e o servidor roda em UTC — as 22h de Brasilia, os vinculos nasceriam
 * datados de amanha.
 */
function hoje(): string {
  return hojeNaLoja();
}

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

  // O tenant NAO vem do formulario para quem nao e super_admin.
  //
  // Esta action escreve com service role — necessario para a Admin API criar
  // a conta em auth.users — e service role ignora RLS. Confiar num campo que
  // o cliente envia permitia a um franqueado criar usuario dentro do tenant
  // de outro, sem nenhuma barreira no caminho.
  const franqueadoId =
    gestor.role === 'super_admin'
      ? String(formData.get('franqueado_id') ?? '')
      : String(gestor.franqueado_id ?? '');

  if (!franqueadoId) return { sucesso: false, mensagem: 'Franqueado nao identificado.' };

  // Mesma razao para a loja: sem RLS no caminho, um loja_id de outro tenant
  // criaria vinculo cruzado. O trigger vinculo_exige_mesmo_tenant barra no
  // banco; conferir aqui devolve mensagem legivel em vez de exception.
  if (dados.loja_id) {
    const { data: loja } = await createAdminClient()
      .from('lojas')
      .select('id, franqueado_id')
      .eq('id', dados.loja_id)
      .maybeSingle();

    if (!loja || loja.franqueado_id !== franqueadoId) {
      return { sucesso: false, mensagem: 'A loja escolhida nao pertence a este franqueado.' };
    }
  }

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
    // O erro do vinculo NAO pode ser ignorado. Sem ele, a conta e criada, a
    // mensagem diz "usuario criado" com a senha provisoria, e a pessoa entra
    // num sistema vazio: sem loja ativa, lojas_permitidas() nao devolve nada.
    // O gestor acharia que deu certo.
    const { error: erroVinculo } =
      dados.role === 'agendador'
        ? await admin.from('agendadores_lojas').insert({
            usuario_id: criado.user.id,
            loja_id: dados.loja_id,
            data_inicio: hoje(),
          })
        : await admin.from('participacoes_societarias').insert({
            usuario_id: criado.user.id,
            loja_id: dados.loja_id,
            percentual_participacao: dados.percentual_participacao ?? 100,
            cargo: dados.role === 'franqueado' ? 'franqueado' : 'diretor',
            data_inicio: hoje(),
          });

    if (erroVinculo) {
      // Desfaz a conta: melhor nao criar do que criar sem acesso a nada.
      //
      // O erro destas duas linhas e ignorado de proposito: ja estamos
      // devolvendo falha, e nada util o chamador faria com "a limpeza
      // tambem falhou". Sobraria uma conta orfa em auth.users, que o
      // franqueado resolve recriando com o mesmo e-mail.
      await admin.from('usuarios').delete().eq('id', criado.user.id);
      await admin.auth.admin.deleteUser(criado.user.id);
      return { sucesso: false, mensagem: `Nao foi possivel vincular a loja: ${erroVinculo.message}` };
    }
  }

  revalidatePath('/dashboard/usuarios');
  return { sucesso: true, mensagem: `Usuario criado. Senha provisoria: ${senhaProvisoria}` };
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

  // Le TODOS os vinculos ativos. Um diretor pode ter varias participacoes —
  // no seed, o diretor 1 tem cinco —, entao consultar com maybeSingle aqui
  // devolvia erro que era ignorado, e o plano era montado como se nao
  // houvesse participacao nenhuma.
  const [{ data: agendadorAtivos }, { data: participacaoAtivas }] = await Promise.all([
    supabase.from('agendadores_lojas').select('id, loja_id').eq('usuario_id', id).is('data_fim', null),
    supabase
      .from('participacoes_societarias')
      .select('id, loja_id')
      .eq('usuario_id', id)
      .is('data_fim', null),
  ]);

  const plano = planejarVinculos({
    papel: dados.role,
    lojaEscolhida: dados.loja_id,
    agendadorAtivos: agendadorAtivos ?? [],
    participacaoAtivas: participacaoAtivas ?? [],
  });

  // Recusa antes de escrever qualquer coisa: melhor nao fazer nada do que
  // fazer metade.
  if (plano.recusa) return { sucesso: false, mensagem: plano.recusa };

  const { error: erroPerfil } = await supabase
    .from('usuarios')
    .update({ nome: dados.nome, role: dados.role })
    .eq('id', id);

  if (erroPerfil) return { sucesso: false, mensagem: `Nao foi possivel salvar: ${erroPerfil.message}` };

  // A ORDEM E ABRIR ANTES DE ENCERRAR.
  //
  // Nao ha transacao entre chamadas do PostgREST. Se encerrar primeiro e a
  // abertura falhar — e ela PODE falhar, o trigger de tenant recusa loja de
  // outro franqueado —, a pessoa fica sem vinculo nenhum: entra no sistema e
  // nao ve nada, enquanto o gestor leu "Usuario atualizado". Abrindo antes, o
  // pior estado possivel e ter os dois vinculos por um instante.
  if (plano.abrirAgendador) {
    // `agendadores_lojas` tem unique (usuario_id, loja_id) sem filtro de
    // data_fim — diferente de participacoes_societarias, cujo indice e
    // parcial. Quem volta a uma loja onde ja esteve tem a linha antiga
    // reaberta; inserir de novo violaria a constraint.
    const { data: anterior, error: erroConsulta } = await supabase
      .from('agendadores_lojas')
      .select('id')
      .eq('usuario_id', id)
      .eq('loja_id', plano.abrirAgendador)
      .maybeSingle();

    if (erroConsulta) {
      return { sucesso: false, mensagem: `Nao foi possivel consultar a lotacao: ${erroConsulta.message}` };
    }

    const { error: erroAbertura } = anterior
      ? await supabase
          .from('agendadores_lojas')
          .update({ data_inicio: hoje(), data_fim: null })
          .eq('id', anterior.id)
      : await supabase
          .from('agendadores_lojas')
          .insert({ usuario_id: id, loja_id: plano.abrirAgendador, data_inicio: hoje() });

    if (erroAbertura) {
      return { sucesso: false, mensagem: `Nao foi possivel vincular a loja: ${erroAbertura.message}` };
    }
  }

  if (plano.abrirParticipacao) {
    const { error: erroAbertura } = await supabase.from('participacoes_societarias').insert({
      usuario_id: id,
      loja_id: plano.abrirParticipacao,
      percentual_participacao: dados.percentual_participacao ?? 100,
      cargo: dados.role === 'franqueado' ? 'franqueado' : 'diretor',
      data_inicio: hoje(),
    });

    if (erroAbertura) {
      return { sucesso: false, mensagem: `Nao foi possivel abrir a participacao: ${erroAbertura.message}` };
    }
  }

  // Encerramentos por ultimo, e com o erro conferido: falhar aqui deixa a
  // pessoa com vinculo duplicado, que e visivel na tela e corrigivel — bem
  // melhor que ficar sem nenhum, que parece o sistema estar quebrado.
  if (plano.encerrarAgendador.length > 0) {
    const { error } = await supabase
      .from('agendadores_lojas')
      .update({ data_fim: hoje() })
      .in('id', plano.encerrarAgendador);

    if (error) {
      return { sucesso: false, mensagem: `A nova lotacao foi criada, mas a antiga nao foi encerrada: ${error.message}` };
    }
  }

  if (plano.encerrarParticipacao.length > 0) {
    const { error } = await supabase
      .from('participacoes_societarias')
      .update({ data_fim: hoje() })
      .in('id', plano.encerrarParticipacao);

    if (error) {
      return { sucesso: false, mensagem: `A nova participacao foi criada, mas a antiga nao foi encerrada: ${error.message}` };
    }
  }

  revalidatePath('/dashboard/usuarios');
  revalidatePath('/dashboard/participacoes');
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
    // Erro aqui deixaria a pessoa marcada como inativa mas com vinculo
    // ativo. O RLS ja barraria pelo status, entao nao ha brecha de acesso —
    // mas o Societario mostraria um socio que saiu, e o desligamento
    // pareceria ter funcionado pela metade.
    const { error: erroLotacao } = await supabase
      .from('agendadores_lojas')
      .update({ data_fim: hoje() })
      .eq('usuario_id', id)
      .is('data_fim', null);

    const { error: erroParticipacao } = await supabase
      .from('participacoes_societarias')
      .update({ data_fim: hoje() })
      .eq('usuario_id', id)
      .is('data_fim', null);

    if (erroLotacao || erroParticipacao) {
      return {
        sucesso: false,
        mensagem: `Acesso bloqueado, mas os vinculos nao foram encerrados: ${
          (erroLotacao ?? erroParticipacao)?.message
        }`,
      };
    }

    // Derruba a sessao ativa. Se falhar, o RLS ja barra o acesso — por isso
    // o erro nao aborta a operacao.
    const admin = createAdminClient();
    await admin.auth.admin.signOut(id, 'global').catch(() => undefined);
  } else {
    // Reativar so o status devolveria o login sem devolver a lotacao: o
    // desligamento fechou os vinculos, e sem loja ativa o RLS entrega tela
    // vazia.
    //
    // Reabre o LOTE inteiro encerrado na ultima data — o mesmo que o
    // desligamento fechou junto. Reabrir so o mais recente fazia um diretor
    // de cinco lojas voltar com uma, perdendo quatro em silencio.
    const { data: alvo } = await supabase.from('usuarios').select('role').eq('id', id).maybeSingle();
    const tabela = tabelaDoVinculo(alvo?.role ?? 'agendador');

    if (tabela) {
      const { data: encerrados } = await supabase
        .from(tabela)
        .select('id, data_fim')
        .eq('usuario_id', id)
        .not('data_fim', 'is', null);

      const paraReabrir = selecionarParaReabrir(
        (encerrados ?? []).map((linha) => ({ id: linha.id, data_fim: linha.data_fim as string }))
      );

      if (paraReabrir.length > 0) {
        const { error } = await supabase.from(tabela).update({ data_fim: null }).in('id', paraReabrir);

        // Sem o vinculo de volta, a pessoa faz login e nao ve nada: sem loja
        // ativa, lojas_permitidas() devolve conjunto vazio. Dizer "acesso
        // reativado" nesse estado mandaria o gestor procurar defeito onde
        // nao ha.
        if (error) {
          return {
            sucesso: false,
            mensagem: `Acesso reativado, mas a loja nao foi devolvida: ${error.message}`,
          };
        }
      }
    }
  }

  revalidatePath('/dashboard/usuarios');
  revalidatePath('/dashboard/participacoes');
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

/* ---------------------- Participacao societaria ---------------------- */

/**
 * As tabelas ja suportavam vigencia (`data_fim`) e o RLS ja filtrava por
 * participacao ativa desde o inicio — faltava a tela. Sem ela, um diretor
 * que saia da sociedade continuava enxergando as lojas, porque a regra
 * existia no banco e nao tinha como ser acionada.
 *
 * Encerrar preserva a linha: e o que mantem a leitura historica de quem
 * respondia por qual loja em cada periodo.
 */
export async function encerrarParticipacao(id: string, dataFim?: string): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para gerenciar participacoes.' };
  }

  const supabase = createClient();
  const { data: atual, error: erroLeitura } = await supabase
    .from('participacoes_societarias')
    .select('id, data_inicio, data_fim')
    .eq('id', id)
    .maybeSingle();

  if (erroLeitura || !atual) return { sucesso: false, mensagem: 'Participacao nao encontrada.' };
  if (atual.data_fim) return { sucesso: false, mensagem: 'Esta participacao ja esta encerrada.' };

  const fim = dataFim || hoje();

  // A constraint participacao_periodo_valido rejeitaria no banco; avisar
  // aqui devolve mensagem legivel em vez de erro de constraint.
  if (fim < atual.data_inicio) {
    return {
      sucesso: false,
      mensagem: 'A data de encerramento nao pode ser anterior ao inicio da participacao.',
      erros: { data_fim: ['Anterior ao inicio'] },
    };
  }

  const { error } = await supabase
    .from('participacoes_societarias')
    .update({ data_fim: fim })
    .eq('id', id);

  if (error) return { sucesso: false, mensagem: `Nao foi possivel encerrar: ${error.message}` };

  revalidatePath('/dashboard/participacoes');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: 'Participacao encerrada.' };
}

/**
 * Abre uma participacao. O indice `participacoes_ativa_unica` e parcial
 * (`where data_fim is null`), entao a mesma dupla usuario/loja pode voltar
 * depois de encerrada — o que torna a transferencia de volta possivel.
 */
export async function criarParticipacao(formData: FormData): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para gerenciar participacoes.' };
  }

  const parsed = participacaoSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }
  const dados = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from('participacoes_societarias').insert({
    usuario_id: dados.usuario_id,
    loja_id: dados.loja_id,
    percentual_participacao: dados.percentual_participacao,
    cargo: dados.cargo,
    data_inicio: dados.data_inicio || hoje(),
  });

  if (error) {
    const duplicado = error.code === '23505';
    return {
      sucesso: false,
      mensagem: duplicado
        ? 'Esta pessoa ja tem participacao ativa nesta loja. Encerre a atual antes de abrir outra.'
        : `Nao foi possivel salvar: ${error.message}`,
    };
  }

  revalidatePath('/dashboard/participacoes');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: 'Participacao aberta.' };
}

/**
 * Transferencia: encerra na loja de origem e abre na de destino, na mesma
 * data. Os dois passos precisam andar juntos — encerrar sem abrir tira o
 * acesso do diretor, e abrir sem encerrar o deixa somando participacao em
 * duas lojas.
 *
 * Nao ha transacao entre chamadas do PostgREST, entao a ordem escolhida e a
 * que falha de forma segura: abre primeiro e, se o encerramento falhar,
 * desfaz a abertura. O estado ruim possivel e "continua na origem", nunca
 * "perdeu as duas".
 */
export async function transferirParticipacao(
  id: string,
  formData: FormData
): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para gerenciar participacoes.' };
  }

  const parsed = transferenciaSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }
  const dados = parsed.data;

  const supabase = createClient();
  const { data: origem } = await supabase
    .from('participacoes_societarias')
    .select('id, usuario_id, loja_id, cargo, percentual_participacao, data_inicio, data_fim')
    .eq('id', id)
    .maybeSingle();

  if (!origem) return { sucesso: false, mensagem: 'Participacao de origem nao encontrada.' };
  if (origem.data_fim) return { sucesso: false, mensagem: 'Esta participacao ja esta encerrada.' };
  if (origem.loja_id === dados.loja_id) {
    return { sucesso: false, mensagem: 'A loja de destino e a mesma da origem.' };
  }

  const data = dados.data_inicio || hoje();
  if (data < origem.data_inicio) {
    return {
      sucesso: false,
      mensagem: 'A data da transferencia nao pode ser anterior ao inicio da participacao.',
      erros: { data_inicio: ['Anterior ao inicio'] },
    };
  }

  const { data: aberta, error: erroAbertura } = await supabase
    .from('participacoes_societarias')
    .insert({
      usuario_id: origem.usuario_id,
      loja_id: dados.loja_id,
      percentual_participacao: dados.percentual_participacao ?? origem.percentual_participacao,
      cargo: origem.cargo,
      data_inicio: data,
    })
    .select('id')
    .single();

  if (erroAbertura || !aberta) {
    const duplicado = erroAbertura?.code === '23505';
    return {
      sucesso: false,
      mensagem: duplicado
        ? 'Ja existe participacao ativa na loja de destino.'
        : `Nao foi possivel abrir na loja de destino: ${erroAbertura?.message}`,
    };
  }

  const { error: erroEncerramento } = await supabase
    .from('participacoes_societarias')
    .update({ data_fim: data })
    .eq('id', id);

  if (erroEncerramento) {
    // Erro ignorado de proposito, como no rollback de criarUsuario: a falha
    // que importa e a do encerramento, e ela ja esta sendo devolvida.
    await supabase.from('participacoes_societarias').delete().eq('id', aberta.id);
    return { sucesso: false, mensagem: `Nao foi possivel encerrar a origem: ${erroEncerramento.message}` };
  }

  revalidatePath('/dashboard/participacoes');
  revalidatePath('/dashboard');
  return { sucesso: true, mensagem: 'Participacao transferida.' };
}

/* -------------------------------- Metas ------------------------------- */

/**
 * Grava a meta do agendador para a competencia. Upsert por (usuario_id,
 * competencia): redefinir a meta do mes e operacao comum — o alvo muda
 * quando a loja entra em campanha — e obrigar a apagar antes so criaria
 * passo extra.
 */
export async function salvarMeta(formData: FormData): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para definir metas.' };
  }

  const parsed = metaSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return { sucesso: false, mensagem: 'Revise os campos.', erros: parsed.error.flatten().fieldErrors };
  }
  const dados = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from('metas').upsert(
    {
      usuario_id: dados.usuario_id,
      competencia: dados.competencia,
      meta_agendamentos: dados.meta_agendamentos,
      meta_taxa_conversao: dados.meta_taxa_conversao,
      meta_vendas: dados.meta_vendas,
      meta_receita: dados.meta_receita,
      definida_por: gestor.id,
    },
    { onConflict: 'usuario_id,competencia' }
  );

  if (error) return { sucesso: false, mensagem: `Nao foi possivel salvar: ${error.message}` };

  revalidatePath('/dashboard/metas');
  return { sucesso: true, mensagem: 'Meta salva.' };
}

export async function removerMeta(id: string): Promise<ResultadoAction> {
  const gestor = await buscarUsuarioAtual();
  if (!gestor || !podeGerenciarCadastros(gestor.role)) {
    return { sucesso: false, mensagem: 'Voce nao tem permissao para remover metas.' };
  }

  const supabase = createClient();
  const { error } = await supabase.from('metas').delete().eq('id', id);
  if (error) return { sucesso: false, mensagem: `Nao foi possivel remover: ${error.message}` };

  revalidatePath('/dashboard/metas');
  return { sucesso: true, mensagem: 'Meta removida.' };
}
