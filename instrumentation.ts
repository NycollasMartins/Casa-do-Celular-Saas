/**
 * Carrega a configuracao do Sentry conforme o runtime. O Next chama `register`
 * uma vez, no boot do servidor.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
