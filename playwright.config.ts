import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do fluxo critico. Sobe a aplicacao de verdade e navega como usuario.
 *
 * Porta 3100, nao 3000: a 3000 costuma estar ocupada por outro projeto na
 * maquina de desenvolvimento, e um teste que conversa com o app errado falha
 * de um jeito confuso — 404 em toda pagina, sem explicacao aparente.
 */
const PORTA = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Um worker: as suites autenticadas compartilham o mesmo banco e
  // disputariam os registros que criam.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Sem E2E_BASE_URL externo, sobe o dev server local. `reuseExistingServer`
  // evita subir um segundo quando ja ha um rodando na porta.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORTA}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
