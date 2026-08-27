/**
 * Ciclo de cobranca da assinatura: avisa quem venceu, suspende quem nao pagou.
 *
 *   node scripts/cobranca.mjs          # avisa e suspende
 *   node scripts/cobranca.mjs --seco   # so lista, nao envia nem suspende
 *   node scripts/cobranca.mjs --data 2026-09-15   # finge que hoje e outro dia
 *
 * Feito para rodar uma vez por dia, de manha. Idempotente: o indice parcial
 * `cobrancas_evento_unico` impede registrar o mesmo evento duas vezes, e
 * `assinatura_avisado_em` impede reavisar quem ja foi avisado.
 *
 * SEM E-MAIL CONFIGURADO, ELE NAO SUSPENDE NINGUEM.
 * Esta e a decisao mais importante deste arquivo. A carencia so comeca
 * quando a mensagem sai; se nao ha por onde enviar, ninguem e avisado, e
 * cortar o acesso de quem nunca soube que devia seria o pior erro possivel
 * do sistema inteiro — o cliente perde a operacao por uma configuracao que
 * ele nao controla. Entao a rotina lista o que faria e para.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  CARENCIA_DIAS,
  dataPorExtensoCurta,
  hojeNaLoja,
  montarAvisoDeCobranca,
  montarAvisoDeSuspensao,
  somarDias,
  FUSO_LOJA as FUSO,
} from './compartilhado.mjs';

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

const argumentos = process.argv.slice(2);
const seco = argumentos.includes('--seco');
const posData = argumentos.indexOf('--data');
const dataForcada = posData !== -1 ? argumentos[posData + 1] : null;

if (dataForcada && !/^\d{4}-\d{2}-\d{2}$/.test(dataForcada)) {
  console.error(`--data espera AAAA-MM-DD, recebeu "${dataForcada}".`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const hoje = dataForcada ?? hojeNaLoja();

async function enviarEmail(para, { assunto, texto }) {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: REMETENTE, to: para, subject: assunto, text: texto }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Resend respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
}

/** Registro do evento. Falha aqui nao derruba a rotina: o efeito ja aconteceu. */
async function registrar(franqueadoId, vencimento, tipo, status, detalhe) {
  const { error } = await admin
    .from('cobrancas')
    .insert({ franqueado_id: franqueadoId, vencimento, tipo, status, detalhe: detalhe ?? null });

  // 23505 = o indice unico ja tem este evento. Acontece se a rotina rodar
  // duas vezes no mesmo dia, e e exatamente o que ele existe para impedir.
  if (error && error.code !== '23505') {
    console.warn(`  ! nao foi possivel registrar (${tipo}): ${error.message}`);
  }
}

console.log(`Cobranca em ${hoje} (fuso ${FUSO})`);
console.log(`E-mail:   ${temEmail ? 'Resend' : 'NAO CONFIGURADO'}`);
console.log(`Carencia: ${CARENCIA_DIAS} dias apos o aviso`);
console.log(seco ? 'Modo seco: nada sera enviado nem suspenso.\n' : '');

/* ------------------------------- Avisos ------------------------------ */

const { data: aAvisar, error: erroAvisar } = await admin.rpc('franqueados_a_avisar', {
  p_hoje: hoje,
});

if (erroAvisar) {
  console.error(`Nao foi possivel listar quem avisar: ${erroAvisar.message}`);
  process.exit(1);
}

let avisados = 0;
let falhas = 0;

console.log(`A avisar: ${aAvisar.length}`);

for (const rede of aAvisar) {
  const limite = somarDias(rede.vencimento, CARENCIA_DIAS);
  const rotulo = `${rede.nome} (venceu ${dataPorExtensoCurta(rede.vencimento)}, ate ${dataPorExtensoCurta(limite)})`;

  if (!rede.email_contato) {
    // Sem endereco nao ha aviso, e sem aviso nao comeca carencia: esta rede
    // nunca sera suspensa pela rotina. E o desfecho certo — o furo esta no
    // cadastro, e cortar por causa dele puniria o cliente pelo nosso erro.
    console.log(`  - ${rotulo}: SEM E-MAIL DE CONTATO, nao avisado`);
    await registrar(rede.id, rede.vencimento, 'aviso', 'falhou', 'rede sem email_contato');
    falhas++;
    continue;
  }

  if (seco || !temEmail) {
    console.log(`  · ${rotulo} -> ${rede.email_contato}`);
    continue;
  }

  try {
    await enviarEmail(rede.email_contato, montarAvisoDeCobranca({ ...rede, limite }));
    // So agora a carencia comeca a contar.
    await admin.rpc('marcar_aviso_enviado', { p_id: rede.id, p_hoje: hoje });
    await registrar(rede.id, rede.vencimento, 'aviso', 'enviado', `limite ${limite}`);
    console.log(`  + ${rotulo}`);
    avisados++;
  } catch (erro) {
    // Nao marca `assinatura_avisado_em`: sem isso a rotina tenta de novo
    // amanha, e o prazo do cliente nao corre por uma falha nossa.
    console.log(`  ! ${rotulo}: ${erro.message}`);
    await registrar(rede.id, rede.vencimento, 'aviso', 'falhou', erro.message.slice(0, 300));
    falhas++;
  }
}

/* ----------------------------- Suspensoes ---------------------------- */

const { data: aSuspender, error: erroSuspender } = await admin.rpc('franqueados_a_suspender', {
  p_hoje: hoje,
  p_carencia: CARENCIA_DIAS,
});

if (erroSuspender) {
  console.error(`Nao foi possivel listar quem suspender: ${erroSuspender.message}`);
  process.exit(1);
}

let suspensos = 0;

console.log(`\nA suspender: ${aSuspender.length}`);

for (const rede of aSuspender) {
  const rotulo = `${rede.nome} (avisado ${dataPorExtensoCurta(rede.avisado_em)})`;

  if (seco) {
    console.log(`  · ${rotulo}`);
    continue;
  }

  const { error } = await admin.rpc('suspender_por_inadimplencia', { p_id: rede.id });

  if (error) {
    console.log(`  ! ${rotulo}: ${error.message}`);
    await registrar(rede.id, rede.vencimento, 'suspensao', 'falhou', error.message.slice(0, 300));
    falhas++;
    continue;
  }

  await registrar(rede.id, rede.vencimento, 'suspensao', 'registrado', `avisado em ${rede.avisado_em}`);
  console.log(`  + ${rotulo}: SUSPENSA`);
  suspensos++;

  // O e-mail do corte vem DEPOIS de suspender, e a falha dele nao desfaz
  // nada: a suspensao ja e visivel na tela de entrada, com o motivo.
  if (temEmail) {
    const { data: contato } = await admin
      .from('franqueados')
      .select('email_contato')
      .eq('id', rede.id)
      .maybeSingle();

    if (contato?.email_contato) {
      try {
        await enviarEmail(contato.email_contato, montarAvisoDeSuspensao(rede));
      } catch (erro) {
        console.log(`    (aviso de suspensao nao saiu: ${erro.message})`);
      }
    }
  }
}

/* ------------------------------- Resumo ------------------------------ */

console.log('');

if (!temEmail && aAvisar.length > 0) {
  console.log(
    'NENHUM AVISO FOI ENVIADO e nenhuma carencia comecou: falta RESEND_API_KEY e\n' +
      'REMETENTE_EMAIL. Enquanto isso, ninguem sera suspenso automaticamente —\n' +
      'de proposito, para nao cortar o acesso de quem nunca foi avisado.'
  );
}

console.log(
  seco
    ? `Modo seco: ${aAvisar.length} aviso(s) e ${aSuspender.length} suspensao(oes) pendentes.`
    : `${avisados} avisado(s), ${suspensos} suspensa(s), ${falhas} falha(s).`
);
