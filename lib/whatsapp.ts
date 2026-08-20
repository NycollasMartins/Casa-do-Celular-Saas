/**
 * Envio pela WhatsApp Cloud API (Meta Graph API).
 *
 * Inerte sem WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN — mesmo padrao
 * do rate limit, do Sentry e do e-mail.
 *
 * POR QUE TEMPLATE, E NAO TEXTO LIVRE
 * A Meta so permite mensagem de texto livre dentro da janela de 24h depois
 * que o cliente escreveu para voce. Um lembrete de vespera e sempre iniciado
 * pela empresa, entao precisa de template aprovado previamente. Mandar texto
 * livre fora da janela retorna erro 131047 e, repetido, derruba a qualidade
 * do numero.
 */

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_LEMBRETE = process.env.WHATSAPP_TEMPLATE_LEMBRETE ?? 'lembrete_vespera';
const IDIOMA_TEMPLATE = process.env.WHATSAPP_TEMPLATE_IDIOMA ?? 'pt_BR';

export const whatsappConfigurado = Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);

/**
 * DDDs validos no Brasil. A lista existe porque o intervalo 11-99 nao e
 * continuo: 20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60,
 * 70, 72, 76, 78, 80 e 90 nunca foram atribuidos. Aceitar um deles produz
 * um numero que a Meta rejeita e que ninguem consegue explicar depois.
 */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normaliza para E.164 sem o "+", que e o formato que a Cloud API espera:
 * 55 + DDD + numero.
 *
 * Aceita o que o agendador digita na pratica: com mascara, sem mascara, com
 * +55, com 0 de operadora. Recusa em vez de adivinhar quando o resultado
 * seria ambiguo — um numero errado nao gera erro visivel, gera mensagem
 * entregue a um estranho.
 */
export function normalizarTelefoneBr(entrada: string): string | null {
  let digitos = (entrada ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  // Prefixo internacional discado: 00 55 ...
  if (digitos.startsWith('0055')) digitos = digitos.slice(2);

  // Ja veio com o codigo do pais.
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
  else if (digitos.length === 12 && digitos.startsWith('55')) digitos = digitos.slice(2);

  // Zero de operadora antes do DDD: 0 61 9...
  if (digitos.length === 12 && digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.length === 11 && digitos.startsWith('0')) digitos = digitos.slice(1);

  if (digitos.length !== 10 && digitos.length !== 11) return null;

  const ddd = Number(digitos.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return null;

  const assinante = digitos.slice(2);

  if (assinante.length === 9) {
    // Celular: o nono digito e sempre 9.
    if (!assinante.startsWith('9')) return null;
  } else {
    // Fixo: comeca em 2-5. WhatsApp em numero fixo e raro, mas existe, e
    // recusar aqui esconderia um cadastro valido.
    if (!/^[2-5]/.test(assinante)) return null;
  }

  return `55${digitos}`;
}

export interface ParametroTemplate {
  type: 'text';
  text: string;
}

/**
 * Monta o corpo do template. A ordem dos parametros e posicional na API da
 * Meta ({{1}}, {{2}}...), entao ela precisa casar exatamente com o template
 * aprovado — trocar dois parametros de lugar entrega uma mensagem que diz
 * a coisa errada sem erro nenhum.
 *
 * Template esperado (lembrete_vespera):
 *   "Ola, {{1}}! Lembrando do seu atendimento na {{2}}, amanha ({{3}})."
 */
export function montarTemplateLembrete(
  telefone: string,
  parametros: { nome: string; loja: string; data: string }
) {
  return {
    messaging_product: 'whatsapp',
    to: telefone,
    type: 'template',
    template: {
      name: TEMPLATE_LEMBRETE,
      language: { code: IDIOMA_TEMPLATE },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: parametros.nome },
            { type: 'text', text: parametros.loja },
            { type: 'text', text: parametros.data },
          ] satisfies ParametroTemplate[],
        },
      ],
    },
  };
}

export interface ResultadoWhatsapp {
  enviado: boolean;
  detalhe?: string;
}

export async function enviarTemplate(
  telefone: string,
  parametros: { nome: string; loja: string; data: string }
): Promise<ResultadoWhatsapp> {
  if (!whatsappConfigurado) {
    return { enviado: false, detalhe: 'WhatsApp nao configurado' };
  }

  const destino = normalizarTelefoneBr(telefone);
  if (!destino) {
    return { enviado: false, detalhe: `Telefone invalido: ${telefone}` };
  }

  const resposta = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(montarTemplateLembrete(destino, parametros)),
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    return { enviado: false, detalhe: `Meta respondeu ${resposta.status}: ${corpo.slice(0, 200)}` };
  }

  return { enviado: true };
}
