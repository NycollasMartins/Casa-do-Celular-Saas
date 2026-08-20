import { config } from 'dotenv';

// O Next carrega .env.local sozinho; o Vitest nao. Sem isto os testes de
// RLS nao teriam como autenticar.
config({ path: '.env.local' });
