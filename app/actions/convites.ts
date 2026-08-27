'use server';

import { headers } from 'next/headers';
import { revalidar as revalidarTelas } from '@/lib/revalidacao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { usuarioComAcesso } from '@/lib/auth/session';
import { verificarRateLimit } from '@/lib/rate-limit';
import { ipDoCliente } from '@/lib/rede';
import { convitePrimeiroAcessoSchema } from '@/lib/validations/auth';
import { expiraEm, gerarToken, hashDoToken, linkDoConvite, pareceToken } from '@/lib/convites';
import type { ResultadoAction } from './agendamentos';

/**
 * Convite de rede: gerar e resgatar.
 *
 * Sao os dois lados de uma porta. O primeiro exige super admin; o segundo nao
 * exige sessao nenhuma — quem chega ali ainda nao tem conta, e o token e a
 * unica credencial.
 */

function objeto(formData: FormData): Record<string, string> {
  const saida: Record<string, string> = {};
  formData.forEach((valor, chave) => {
    saida[chave] = String(valor);
  });
  return saida;
}

/* ------------------------------- Gerar ------------------------------- */

export async function criarConvite(observacao?: string): Promise<ResultadoAction> {
  const gestor = await usuarioComAcesso();

  // Convidar rede nova e vender o produto. Nem franqueado nem diretor passam
  // — e a policy de insert exige o mesmo, para o caso de alguem chamar esta
  // action por fora do painel.
  if (!gestor || gestor.role !== 'super_admin') {
    return { sucesso: false, mensagem: 'Somente o administrador do sistema gera convites.' };
  }

  const token = gerarToken();

  const { error } = await createClient()
    .from('convites')
    .insert({
      token_hash: hashDoToken(token),
      observacao: observacao?.trim() || null,
      criado_por: gestor.id,
      expira_em: expiraEm().toISOString(),
    });

  if (error) {
    return { sucesso: false, mensagem: `Nao foi possivel gerar o convite: ${error.message}` };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';

  revalidarTelas('franqueado');

  // O link viaja no mesmo campo que a senha provisoria usa, e pelo mesmo
  // motivo: a tela precisa mostrar de forma copiavel e permanente, nao num
  // aviso que some. Ele nao volta — o banco tem so o hash.
  return { sucesso: true, mensagem: 'Convite gerado.', senhaProvisoria: linkDoConvite(base, token) };
}

export async function apagarConvite(id: string): Promise<ResultadoAction> {
  const gestor = await usuarioComAcesso();
  if (!gestor || gestor.role !== 'super_admin') {
    return { sucesso: false, mensagem: 'Somente o administrador do sistema apaga convites.' };
  }

  const { error } = await createClient().from('convites').delete().eq('id', id);
  if (error) return { sucesso: false, mensagem: `Nao foi possivel apagar: ${error.message}` };

  revalidarTelas('franqueado');
  return { sucesso: true, mensagem: 'Convite apagado.' };
}

/* ------------------------------ Resgatar ----------------------------- */

/** Resposta unica para token invalido, expirado ou ja usado. Ver a migration 016. */
const CONVITE_INVALIDO =
  'Este convite nao vale mais. Pode ter expirado ou ja ter sido usado — peca um novo.';

/**
 * Cria a rede e a conta do dono, a partir de um convite valido.
 *
 * NAO EXIGE SESSAO, e por isso escreve com service role: nao existe usuario
 * autenticado para o RLS avaliar. Toda a autorizacao esta no token.
 *
 * A ORDEM IMPORTA. O convite e reservado ANTES de qualquer criacao, por uma
 * funcao que confere e marca no mesmo update — sem isso, dois cliques no
 * mesmo link criariam duas redes. Se a criacao falhar depois, o convite e
 * devolvido; queimar o convite de um cliente que nem chegou a entrar seria
 * o pior desfecho possivel.
 */
export async function aceitarConvite(
  token: string,
  formData: FormData
): Promise<ResultadoAction> {
  // Rota publica que escreve no banco precisa de teto. O identificador e o
  // IP porque nao ha sessao — e nao sai do `x-forwarded-for` cru, que o
  // cliente controla.
  const limite = await verificarRateLimit(`convite:${ipDoCliente(headers())}`, 8);
  if (!limite.permitido) {
    return { sucesso: false, mensagem: 'Muitas tentativas seguidas. Tente de novo em instantes.' };
  }

  // Filtra antes de consultar: sem isto qualquer string vira uma consulta, e
  // a rota publica vira caminho barato de sondagem.
  if (!pareceToken(token)) return { sucesso: false, mensagem: CONVITE_INVALIDO };

  const parsed = convitePrimeiroAcessoSchema.safeParse(objeto(formData));
  if (!parsed.success) {
    return {
      sucesso: false,
      mensagem: 'Revise os campos.',
      erros: parsed.error.flatten().fieldErrors,
    };
  }
  const dados = parsed.data;
  const email = dados.email.toLowerCase();

  const admin = createAdminClient();

  const { data: convitId, error: erroReserva } = await admin.rpc('reservar_convite', {
    p_token_hash: hashDoToken(token),
  });

  if (erroReserva) {
    return { sucesso: false, mensagem: `Nao foi possivel validar o convite: ${erroReserva.message}` };
  }
  if (!convitId) return { sucesso: false, mensagem: CONVITE_INVALIDO };

  /** Devolve o convite e responde. Usada em toda saida por erro daqui para baixo. */
  async function desistir(mensagem: string, erros?: Record<string, string[]>) {
    await admin.rpc('liberar_convite', { p_id: convitId as string });
    return { sucesso: false as const, mensagem, erros };
  }

  const { data: franqueado, error: erroRede } = await admin
    .from('franqueados')
    .insert({
      nome: dados.razao_social,
      cnpj: dados.cnpj || null,
      email_contato: email,
      status: 'ativo',
    })
    .select('id')
    .single();

  if (erroRede || !franqueado) {
    return desistir(`Nao foi possivel criar a rede: ${erroRede?.message ?? 'motivo desconhecido'}`);
  }

  /** Desfaz a rede tambem. Rede orfa apareceria na sua lista sem dono nenhum. */
  async function desistirComRede(mensagem: string, erros?: Record<string, string[]>) {
    await admin.from('franqueados').delete().eq('id', franqueado!.id);
    return desistir(mensagem, erros);
  }

  // A senha e escolhida pela pessoa, entao NAO se marca `senha_provisoria`:
  // obrigar a trocar a senha que ela acabou de definir seria pedir duas vezes
  // a mesma coisa. `email_confirm` evita depender do SMTP do Supabase, que
  // pode nem estar configurado — e o convite ja provou que o e-mail e dela.
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome },
  });

  if (erroAuth || !criado.user) {
    const jaExiste = /already been registered|already exists/i.test(erroAuth?.message ?? '');
    return desistirComRede(
      jaExiste
        ? 'Ja existe uma conta com este e-mail. Use outro, ou entre pela tela de acesso.'
        : `Nao foi possivel criar a conta: ${erroAuth?.message ?? 'motivo desconhecido'}`,
      jaExiste ? { email: ['E-mail ja cadastrado'] } : undefined
    );
  }

  const { error: erroPerfil } = await admin.from('usuarios').insert({
    id: criado.user.id,
    email,
    nome: dados.nome,
    role: 'franqueado',
    franqueado_id: franqueado.id,
  });

  if (erroPerfil) {
    // `deleteUser` LANCA em vez de devolver erro; sem o try, uma falha aqui
    // troca a mensagem por um stack trace.
    try {
      await admin.auth.admin.deleteUser(criado.user.id);
    } catch {
      // Conta de login orfa nao entra em lugar nenhum: o middleware busca o
      // papel, nao acha e derruba. Nada util a fazer com a falha da limpeza.
    }
    return desistirComRede(`Nao foi possivel salvar o perfil: ${erroPerfil.message}`);
  }

  // So agora o convite e definitivamente consumido: `franqueado_id` cheio e o
  // que faz `liberar_convite` recusar devolve-lo.
  await admin.from('convites').update({ franqueado_id: franqueado.id }).eq('id', convitId);

  revalidarTelas('franqueado');
  return { sucesso: true, mensagem: 'Tudo pronto. Entre com o e-mail e a senha que voce escolheu.' };
}
