/**
 * Lembrete de vespera: avisa quem tem atendimento marcado para amanha.
 *
 *   node scripts/lembrete-vespera.mjs          # envia
 *   node scripts/lembrete-vespera.mjs --seco   # so lista, nao envia
 *   node scripts/lembrete-vespera.mjs --data 2026-09-01   # data especifica
 *
 * Feito para rodar uma vez por dia, no fim da tarde. Idempotente: o indice
 * parcial `notificacoes_enviada_unica` garante no banco que ninguem recebe
 * a mesma mensagem duas vezes, mesmo se a rotina rodar em duplicidade.
 *
 * CANAIS
 * WhatsApp (Cloud API) tem precedencia sobre e-mail: e onde a pessoa
 * efetivamente le, e o telefone e obrigatorio no cadastro enquanto o e-mail
 * nao e. Sem provedor algum, opera no canal `registro`: anota o que teria
 * sido enviado e nao manda nada, o que permite acompanhar o volume e
 * validar a rotina antes de contratar.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env.local ausente: usa as variaveis ja exportadas no shell.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const REMETENTE = process.env.REMETENTE_EMAIL;
const temEmail = Boolean(RESEND_API_KEY && REMETENTE);

const WPP_API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
const WPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WPP_TEMPLATE = process.env.WHATSAPP_TEMPLATE_LEMBRETE ?? 'lembrete_vespera';
const WPP_IDIOMA = process.env.WHATSAPP_TEMPLATE_IDIOMA ?? 'pt_BR';
const temWhatsapp = Boolean(WPP_PHONE_ID && WPP_TOKEN);

const temProvedor = temEmail || temWhatsapp;

const argumentos = process.argv.slice(2);
const seco = argumentos.includes('--seco');
const indiceData = argumentos.indexOf('--data');
const dataForcada = indiceData >= 0 ? argumentos[indiceData + 1] : null;

const FUSO = 'America/Sao_Paulo';

/** Mesma logica de lib/notificacoes.ts. Ver o comentario de fuso de la. */
function dataDeAmanha(agora = new Date()) {
  const hojeLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);

  const base = new Date(`${hojeLocal}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

function diaEMes(iso) {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

function montarMensagem(destinatario) {
  const primeiroNome = destinatario.cliente_nome.trim().split(/\s+/)[0];
  return {
    assunto: `Seu atendimento na ${destinatario.loja_nome} e amanha`,
    texto:
      `Ola, ${primeiroNome}! Passando para lembrar do seu atendimento na ` +
      `${destinatario.loja_nome}, amanha (${diaEMes(destinatario.data_agendamento)}). ` +
      `Se precisar remarcar, e so responder esta mensagem. Ate breve!`,
  };
}

/** Espelha lib/whatsapp.ts. Ver la o porque da lista de DDDs. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function normalizarTelefoneBr(entrada) {
  let digitos = (entrada ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  if (digitos.startsWith('0055')) digitos = digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
  else if (digitos.length === 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length === 12 && digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.length === 11 && digitos.startsWith('0')) digitos = digitos.slice(1);

  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (!DDDS_VALIDOS.has(Number(digitos.slice(0, 2)))) return null;

  const assinante = digitos.slice(2);
  if (assinante.length === 9 ? !assinante.startsWith('9') : !/^[2-5]/.test(assinante)) return null;

  return `55${digitos}`;
}

/**
 * Template, nao texto livre: a Meta so permite texto livre dentro da janela
 * de 24h depois que o cliente escreveu. Lembrete e sempre iniciado pela
 * empresa.
 */
async function enviarWhatsapp(destinatario) {
  const destino = normalizarTelefoneBr(destinatario.cliente_telefone);
  if (!destino) throw new Error(`Telefone invalido: ${destinatario.cliente_telefone}`);

  const primeiroNome = destinatario.cliente_nome.trim().split(/\s+/)[0];

  const resposta = await fetch(
    `https://graph.facebook.com/${WPP_API_VERSION}/${WPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${WPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: WPP_TEMPLATE,
          language: { code: WPP_IDIOMA },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: primeiroNome },
                { type: 'text', text: destinatario.loja_nome },
                { type: 'text', text: diaEMes(destinatario.data_agendamento) },
              ],
            },
          ],
        },
      }),
    }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Meta respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
}

async function enviarEmail(destinatario) {
  const { assunto, texto } = montarMensagem(destinatario);

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: destinatario.cliente_email,
      subject: assunto,
      text: texto,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Resend respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const data = dataForcada ?? dataDeAmanha();

console.log(`Lembretes para ${data} (fuso ${FUSO})`);
console.log(`WhatsApp: ${temWhatsapp ? 'Cloud API' : 'nao configurado'}`);
console.log(`E-mail:   ${temEmail ? 'Resend' : 'nao configurado'}`);
if (!temProvedor) console.log('Nenhum provedor — modo registro.');

const { data: destinatarios, error } = await admin.rpc('agendamentos_para_lembrete', {
  p_data: data,
});

if (error) {
  console.error('Nao foi possivel consultar:', error.message);
  console.error('A migration 007 (20250101000006_notificacoes.sql) foi executada?');
  process.exit(1);
}

if (!destinatarios || destinatarios.length === 0) {
  console.log('Ninguem para lembrar. Nada a fazer.');
  process.exit(0);
}

console.log(`${destinatarios.length} pessoa(s) a lembrar.\n`);

/** WhatsApp na frente: e onde a pessoa efetivamente le. */
function escolherCanal(item) {
  if (temWhatsapp && item.cliente_telefone) return 'whatsapp';
  if (temEmail && item.cliente_email) return 'email';
  return 'registro';
}

if (seco) {
  for (const item of destinatarios) {
    console.log(`  [${escolherCanal(item)}] ${item.cliente_nome} — ${item.loja_nome}`);
  }
  console.log('\n[modo seco] Nada foi enviado nem registrado.');
  process.exit(0);
}

let enviadas = 0;
let falhas = 0;
let registradas = 0;

for (const destinatario of destinatarios) {
  const canal = escolherCanal(destinatario);
  const podeEnviar = canal !== 'registro';

  let status = 'enviada';
  let detalhe = null;

  if (podeEnviar) {
    try {
      if (canal === 'whatsapp') await enviarWhatsapp(destinatario);
      else await enviarEmail(destinatario);
      enviadas++;
    } catch (excecao) {
      status = 'falhou';
      detalhe = String(excecao.message ?? excecao).slice(0, 300);
      falhas++;
    }
  } else {
    registradas++;
    detalhe = temProvedor ? 'Cliente sem canal de contato utilizavel' : 'Sem provedor configurado';
  }

  const { error: erroRegistro } = await admin.from('notificacoes').insert({
    agendamento_id: destinatario.id,
    tipo: 'vespera',
    canal,
    status,
    detalhe,
  });

  // 23505 = o indice parcial barrou uma segunda tentativa bem sucedida.
  // Isso e a idempotencia funcionando, nao um erro.
  if (erroRegistro && erroRegistro.code !== '23505') {
    console.error(`  ! ${destinatario.cliente_nome}: falha ao registrar — ${erroRegistro.message}`);
  }

  const marca = status === 'falhou' ? '!' : podeEnviar ? '+' : '.';
  console.log(`  ${marca} [${canal}] ${destinatario.cliente_nome} (${destinatario.loja_nome})`);
}

console.log(
  `\n${enviadas} enviada(s), ${registradas} registrada(s) sem envio, ${falhas} falha(s).`
);

if (!temProvedor) {
  console.log(
    'Para enviar de verdade, defina WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN,\n' +
      'ou RESEND_API_KEY e REMETENTE_EMAIL.'
  );
}
