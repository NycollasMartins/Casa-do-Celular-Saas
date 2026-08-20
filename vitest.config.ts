import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Carrega .env.local antes de qualquer suite: os testes de RLS precisam
    // da URL e da anon key para autenticar como os usuarios do seed.
    setupFiles: ['./tests/setup.ts'],
    // Os testes de RLS conversam com o mesmo banco. Rodar em paralelo faria
    // as sessoes disputarem estado; o ganho de tempo nao compensa o flake.
    fileParallelism: false,
    testTimeout: 20_000,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
});
