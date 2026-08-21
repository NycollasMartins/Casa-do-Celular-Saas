/**
 * Aplica a politica de retencao: anonimiza agendamentos mais antigos que o
 * prazo definido. Chama a funcao `anonimizar_agendamentos_antigos` criada na
 * migration 006.
 *
 *   node scripts/anonimizar-antigos.mjs           # 24 meses (padrao)
 *   node scripts/anonimizar-antigos.mjs 12        # outro prazo
 *   node scripts/anonimizar-antigos.mjs 24 --seco # so relata, nao altera
 *
 * Roda com service role porque precisa varrer o tenant inteiro, sem o
 * recorte de loja que o RLS aplica. Feito para ser agendado (cron mensal).
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

const argumentos = process.argv.slice(2);
const seco = argumentos.includes('--seco');
const meses = Number(argumentos.find((a) => /^\d+$/.test(a)) ?? 24);

if (!Number.isInteger(meses) || meses < 1) {
  console.error('Prazo invalido. Use um numero inteiro de meses.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

/**
 * Espelha subtrairMeses de lib/lgpd.ts. `setMonth` transborda quando o mes
 * de destino e mais curto — 31/03 menos 1 mes devolve 03/03, ainda em marco
 * —, e a funcao no banco usa a aritmetica do Postgres, que gruda no ultimo
 * dia. Com as duas diferentes, a tela contava uma coisa e o script
 * anonimizava outra.
 */
function subtrairMeses(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const total = ano * 12 + (mes - 1) - meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes + 1, 0)).getUTCDate();
  const dois = (n) => String(n).padStart(2, '0');
  return `${novoAno}-${dois(novoMes + 1)}-${dois(Math.min(dia, ultimoDia))}`;
}

const hojeNaLoja = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const dataLimite = subtrairMeses(hojeNaLoja, meses);

console.log(`Prazo de retencao: ${meses} meses (anteriores a ${dataLimite})`);

const { count, error: erroContagem } = await admin
  .from('agendamentos')
  .select('*', { count: 'exact', head: true })
  .is('anonimizado_em', null)
  .lt('data_agendamento', dataLimite);

if (erroContagem) {
  console.error('Nao foi possivel contar os registros:', erroContagem.message);
  process.exit(1);
}

if (!count) {
  console.log('Nenhum registro fora do prazo. Nada a fazer.');
  process.exit(0);
}

if (seco) {
  console.log(`[modo seco] ${count} registro(s) seriam anonimizados. Nada foi alterado.`);
  process.exit(0);
}

const { data, error } = await admin.rpc('anonimizar_agendamentos_antigos', { meses });

if (error) {
  console.error('Falha ao anonimizar:', error.message);
  console.error('A migration 006 (20250101000005_anonimizacao_lgpd.sql) foi executada?');
  process.exit(1);
}

console.log(`${data} registro(s) anonimizado(s). A acao nao pode ser desfeita.`);
