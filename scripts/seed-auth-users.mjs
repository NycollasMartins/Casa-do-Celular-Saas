/**
 * Cria os usuarios do MVP em auth.users usando a Admin API do Supabase.
 * Rode ANTES do arquivo supabase/migrations/20250101000002_seed.sql.
 *
 *   node scripts/seed-auth-users.mjs
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY no .env.local. Nunca rode em producao.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Carrega .env.local sem dependencia externa.
try {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env.local ausente: usa variaveis ja exportadas no shell.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA_EMBUTIDA = 'CasaCelular@2025';
const SENHA_PADRAO = process.env.SEED_PASSWORD ?? SENHA_EMBUTIDA;

if (!url || !serviceKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

// Este seed cria 21 contas com e-mails previsiveis, `email_confirm: true` e
// uma senha compartilhada. Diferente do cadastro feito pela aplicacao, ele NAO
// marca `senha_provisoria`, entao o middleware nunca obriga a troca: a senha
// fica valendo indefinidamente.
//
// Num Supabase local isso e conveniencia. Num projeto hospedado, sao 21 contas
// ativas e privilegiadas com uma senha escrita no repositorio — e a mais
// poderosa delas, `dono@franqueado.com.br`, enxerga o tenant inteiro.
//
// O erro e facil de cometer: `npm run seed:auth` le o mesmo .env.local que
// aponta para producao. Por isso a senha embutida so vale para banco local;
// contra qualquer outro host, e preciso escolher uma.
const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

if (!ehLocal && SENHA_PADRAO === SENHA_EMBUTIDA) {
  console.error(
    `Recusando criar usuarios em ${new URL(url).host} com a senha embutida no repositorio.\n` +
      '\n' +
      'Defina SEED_PASSWORD com uma senha propria antes de rodar:\n' +
      '  SEED_PASSWORD="..." npm run seed:auth\n' +
      '\n' +
      'E considere se este banco deve mesmo receber contas de exemplo: o seed e\n' +
      'material de desenvolvimento, com e-mails previsiveis e senha compartilhada.'
  );
  process.exit(1);
}

if (!ehLocal) {
  console.warn(`Atencao: criando contas de exemplo em ${new URL(url).host}, que nao e local.\n`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const usuarios = [
  { email: 'dono@franqueado.com.br', nome: 'Nome do Dono' },
  { email: 'diretor1@franqueado.com.br', nome: 'Diretor 1' },
  { email: 'diretor2@franqueado.com.br', nome: 'Diretor 2' },
];

for (let loja = 1; loja <= 9; loja++) {
  for (let n = 1; n <= 2; n++) {
    usuarios.push({
      email: `agendador${n}.loja${loja}@franqueado.com.br`,
      nome: `Agendador ${n} Loja ${loja}`,
    });
  }
}

let criados = 0;
for (const usuario of usuarios) {
  const { error } = await admin.auth.admin.createUser({
    email: usuario.email,
    password: SENHA_PADRAO,
    email_confirm: true,
    user_metadata: { nome: usuario.nome },
  });

  if (error) {
    // Usuario ja existente nao e erro fatal: o seed e idempotente.
    console.warn(`- ${usuario.email}: ${error.message}`);
  } else {
    criados++;
    console.log(`+ ${usuario.email}`);
  }
}

console.log(`\n${criados} usuarios criados. Senha padrao: ${SENHA_PADRAO}`);
console.log('Agora rode supabase/migrations/20250101000002_seed.sql no SQL Editor.');
