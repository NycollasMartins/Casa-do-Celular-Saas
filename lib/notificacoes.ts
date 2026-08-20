/**
 * Lembrete de vespera. Ataca direto o nao comparecimento, que e o numero
 * que o franqueado acompanha.
 *
 * O envio depende de provedor externo (e-mail, WhatsApp, SMS). Como nao ha
 * nenhum contratado ainda, o codigo entra pronto e escolhe o provedor pela
 * variavel de ambiente — mesmo padrao do rate limit e do Sentry. Sem
 * credencial, cai no canal `registro`, que apenas anota o que teria sido
 * enviado, sem mandar nada.
 */

export const FUSO_LOJA = 'America/Sao_Paulo';

/**
 * Data de amanha no fuso das lojas, em formato ISO curto.
 *
 * ESTE E O PONTO MAIS FACIL DE ERRAR da rotina. `data_agendamento` e um
 * `date` sem fuso, preenchido no horario de Brasilia. Se calcularmos amanha
 * a partir de UTC, toda execucao entre 21h e 00h (BRT) enxerga o dia
 * seguinte e notifica a data errada — e uma rotina noturna e exatamente o
 * caso de uso. `en-CA` produz AAAA-MM-DD, que e o formato que o banco usa.
 */
export function dataDeAmanha(agora = new Date(), fuso = FUSO_LOJA): string {
  const hojeLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);

  // Meio-dia UTC evita que o somar-um-dia cruze fronteira de fuso.
  const base = new Date(`${hojeLocal}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

export interface DestinatarioLembrete {
  id: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string;
  data_agendamento: string;
  loja_nome: string;
}

export type Canal = 'email' | 'whatsapp' | 'sms' | 'registro';

/** Formata AAAA-MM-DD como DD/MM sem depender de fuso do runtime. */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/**
 * Texto do lembrete. Curto de proposito: e lido no celular, muitas vezes de
 * relance. Nao repete o CPF nem qualquer dado alem do necessario para a
 * pessoa reconhecer o proprio agendamento.
 */
export function montarMensagem(destinatario: DestinatarioLembrete): {
  assunto: string;
  texto: string;
} {
  const primeiroNome = destinatario.cliente_nome.trim().split(/\s+/)[0];

  return {
    assunto: `Seu atendimento na ${destinatario.loja_nome} e amanha`,
    texto:
      `Ola, ${primeiroNome}! Passando para lembrar do seu atendimento na ` +
      `${destinatario.loja_nome}, amanha (${diaEMes(destinatario.data_agendamento)}). ` +
      `Se precisar remarcar, e so responder esta mensagem. Ate breve!`,
  };
}

export interface ProvedoresDisponiveis {
  whatsapp: boolean;
  email: boolean;
}

/**
 * Escolhe o canal do lembrete.
 *
 * WhatsApp na frente do e-mail de proposito: e onde a pessoa efetivamente
 * le, e o lembrete existe para ser lido. O telefone e obrigatorio no
 * cadastro e o e-mail nao, entao a cobertura tambem e maior.
 *
 * `registro` e o fim de linha — anota que o lembrete era devido e nao
 * manda nada, sem fingir que houve envio.
 */
export function canalDisponivel(
  destinatario: DestinatarioLembrete,
  provedores: ProvedoresDisponiveis | boolean
): Canal {
  // Compatibilidade com a assinatura antiga, de quando so havia e-mail.
  const disponiveis: ProvedoresDisponiveis =
    typeof provedores === 'boolean' ? { whatsapp: false, email: provedores } : provedores;

  if (disponiveis.whatsapp && destinatario.cliente_telefone) return 'whatsapp';
  if (disponiveis.email && destinatario.cliente_email) return 'email';
  return 'registro';
}

export interface ResultadoEnvio {
  agendamentoId: string;
  canal: Canal;
  status: 'enviada' | 'falhou';
  detalhe?: string;
}
