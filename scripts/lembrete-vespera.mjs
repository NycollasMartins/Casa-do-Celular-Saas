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
 * PROVEDOR
 * Com RESEND_API_KEY e REMETENTE_EMAIL definidos, envia e-mail de verdade.
 * Sem eles, opera no canal `registro`: anota o que teria sido enviado e nao
 * manda nada. Isso permite acompanhar o volume e validar a rotina antes de
 * contratar provedor.
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
const temProvedor = Boolean(RESEND_API_KEY && REMETENTE);

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
console.log(`Provedor de e-mail: ${temProvedor ? 'Resend' : 'nenhum — modo registro'}`);

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

if (seco) {
  for (const item of destinatarios) {
    const canal = temProvedor && item.cliente_email ? 'email' : 'registro';
    console.log(`  [${canal}] ${item.cliente_nome} — ${item.loja_nome}`);
  }
  console.log('\n[modo seco] Nada foi enviado nem registrado.');
  process.exit(0);
}

let enviadas = 0;
let falhas = 0;
let registradas = 0;

for (const destinatario of destinatarios) {
  const podeEnviar = temProvedor && destinatario.cliente_email;
  const canal = podeEnviar ? 'email' : 'registro';

  let status = 'enviada';
  let detalhe = null;

  if (podeEnviar) {
    try {
      await enviarEmail(destinatario);
      enviadas++;
    } catch (excecao) {
      status = 'falhou';
      detalhe = String(excecao.message ?? excecao).slice(0, 300);
      falhas++;
    }
  } else {
    registradas++;
    detalhe = temProvedor ? 'Cliente sem e-mail cadastrado' : 'Sem provedor configurado';
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
  console.log(`  ${marca} ${destinatario.cliente_nome} (${destinatario.loja_nome})`);
}

console.log(
  `\n${enviadas} enviada(s), ${registradas} registrada(s) sem envio, ${falhas} falha(s).`
);

if (!temProvedor) {
  console.log('Para enviar de verdade, defina RESEND_API_KEY e REMETENTE_EMAIL.');
}
