/**
 * Relatorio semanal por e-mail para cada franqueado.
 *
 *   node scripts/relatorio-semanal.mjs           # semana fechada anterior
 *   node scripts/relatorio-semanal.mjs --seco    # so mostra, nao envia
 *   node scripts/relatorio-semanal.mjs --semana 2026-08-10
 *
 * Feito para rodar toda segunda-feira de manha. Idempotente: o indice
 * parcial `envios_relatorio_unico` garante no banco que ninguem recebe o
 * mesmo relatorio duas vezes.
 *
 * O e-mail leva os numeros e um link para o relatorio ao vivo, em vez de um
 * CSV anexado. O franqueado clica e ve dado fresco, com os filtros da tela —
 * e a logica de CSV, que e testada em lib/csv.ts, nao precisa ser duplicada
 * aqui.
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
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const temProvedor = Boolean(RESEND_API_KEY && REMETENTE);

const argumentos = process.argv.slice(2);
const seco = argumentos.includes('--seco');
const indiceSemana = argumentos.indexOf('--semana');
const semanaForcada = indiceSemana >= 0 ? argumentos[indiceSemana + 1] : null;

const FUSO = 'America/Sao_Paulo';

/** Espelha lib/semana.ts. Ver os comentarios de fuso e de segunda-feira la. */
function dataLocal(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function somarDias(iso, dias) {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function segundaFeiraDa(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  const diaIso = dia === 0 ? 7 : dia;
  return somarDias(iso, -(diaIso - 1));
}

function semanaAnterior(agora = new Date()) {
  const inicio = somarDias(segundaFeiraDa(dataLocal(agora)), -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

function diaEMes(iso) {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

function brl(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(valor ?? 0)
  );
}

function pct(numerador, denominador) {
  if (!denominador) return '0,0%';
  return `${((numerador / denominador) * 100).toFixed(1).replace('.', ',')}%`;
}

function montarCorpo(franqueado, resumo, semana) {
  const linhas = [
    `Resumo de ${diaEMes(semana.inicio)} a ${diaEMes(semana.fim)}`,
    '',
    `Contatos:        ${resumo.contatos}`,
    `Agendamentos:    ${resumo.agendados} (${pct(resumo.agendados, resumo.contatos)} dos contatos)`,
    `Compareceram:    ${resumo.compareceram} (${pct(resumo.compareceram, resumo.agendados)} dos agendados)`,
    `Nao apareceram:  ${resumo.nao_compareceram}`,
  ];

  if (Number(resumo.vendas) > 0) {
    linhas.push(
      `Vendas:          ${resumo.vendas}`,
      `Faturamento:     ${brl(resumo.receita)}`,
      `Ticket medio:    ${brl(Number(resumo.receita) / Number(resumo.vendas))}`
    );
  }

  if (resumo.melhor_loja) {
    linhas.push('', `Loja com mais comparecimentos: ${resumo.melhor_loja}`);
  }

  linhas.push(
    '',
    `Relatorio completo: ${SITE}/dashboard/relatorios?periodo=personalizado&inicio=${semana.inicio}&fim=${semana.fim}`,
    '',
    `— Casa do Celular · ${franqueado.nome}`
  );

  return linhas.join('\n');
}

async function enviarEmail(destino, assunto, texto) {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: REMETENTE, to: destino, subject: assunto, text: texto }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Resend respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const semana = semanaForcada
  ? { inicio: semanaForcada, fim: somarDias(semanaForcada, 6) }
  : semanaAnterior();

console.log(`Semana de ${semana.inicio} a ${semana.fim} (fuso ${FUSO})`);
console.log(`Provedor de e-mail: ${temProvedor ? 'Resend' : 'nenhum — modo registro'}\n`);

const { data: franqueados, error: erroFranqueados } = await admin
  .from('franqueados')
  .select('id, nome, email_contato')
  .eq('status', 'ativo');

if (erroFranqueados) {
  console.error('Nao foi possivel listar os franqueados:', erroFranqueados.message);
  process.exit(1);
}

if (!franqueados || franqueados.length === 0) {
  console.log('Nenhum franqueado ativo. Nada a fazer.');
  process.exit(0);
}

let enviados = 0;
let falhas = 0;
let pulados = 0;

for (const franqueado of franqueados) {
  const { data: resumoBruto, error: erroResumo } = await admin.rpc('resumo_do_periodo', {
    p_franqueado_id: franqueado.id,
    p_inicio: semana.inicio,
    p_fim: semana.fim,
  });

  if (erroResumo) {
    console.error(`  ! ${franqueado.nome}: ${erroResumo.message}`);
    console.error('    A migration 010 (20250101000009_relatorio_semanal.sql) foi executada?');
    falhas++;
    continue;
  }

  const resumo = Array.isArray(resumoBruto) ? resumoBruto[0] : resumoBruto;

  if (!resumo || Number(resumo.contatos) === 0) {
    console.log(`  . ${franqueado.nome}: sem movimento na semana, nao enviado`);
    pulados++;
    continue;
  }

  const assunto = `Casa do Celular · resumo de ${diaEMes(semana.inicio)} a ${diaEMes(semana.fim)}`;
  const texto = montarCorpo(franqueado, resumo, semana);

  if (seco) {
    console.log(`  [seco] ${franqueado.nome} -> ${franqueado.email_contato ?? 'SEM E-MAIL'}`);
    console.log(texto.split('\n').map((l) => `         ${l}`).join('\n'));
    continue;
  }

  let status = 'enviado';
  let detalhe = null;

  if (temProvedor && franqueado.email_contato) {
    try {
      await enviarEmail(franqueado.email_contato, assunto, texto);
      enviados++;
    } catch (excecao) {
      status = 'falhou';
      detalhe = String(excecao.message ?? excecao).slice(0, 300);
      falhas++;
    }
  } else {
    detalhe = temProvedor ? 'Franqueado sem e-mail de contato' : 'Sem provedor configurado';
    pulados++;
  }

  const { error: erroRegistro } = await admin.from('envios_relatorio').insert({
    franqueado_id: franqueado.id,
    semana_inicio: semana.inicio,
    status,
    detalhe,
  });

  // 23505: o indice parcial barrou um segundo envio da mesma semana. E a
  // idempotencia funcionando, nao um erro.
  if (erroRegistro && erroRegistro.code === '23505') {
    console.log(`  . ${franqueado.nome}: ja recebeu o relatorio desta semana`);
    continue;
  }
  if (erroRegistro) {
    console.error(`  ! ${franqueado.nome}: falha ao registrar — ${erroRegistro.message}`);
  }

  const marca = status === 'falhou' ? '!' : temProvedor && franqueado.email_contato ? '+' : '.';
  console.log(`  ${marca} ${franqueado.nome}`);
}

if (seco) {
  console.log('\n[modo seco] Nada foi enviado nem registrado.');
} else {
  console.log(`\n${enviados} enviado(s), ${pulados} sem envio, ${falhas} falha(s).`);
  if (!temProvedor) {
    console.log('Para enviar de verdade, defina RESEND_API_KEY e REMETENTE_EMAIL.');
  }
}
