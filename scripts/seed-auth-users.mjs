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
const SENHA_PADRAO = process.env.SEED_PASSWORD ?? 'CasaCelular@2025';

if (!url || !serviceKey) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
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
