/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Necessario no Next 14 para o instrumentation.ts ser carregado.
    instrumentationHook: true,
  },
  eslint: { ignoreDuringBuilds: false },
};

/**
 * O wrapper do Sentry so entra quando ha DSN configurado.
 *
 * Sem essa guarda, `withSentryConfig` roda em todo build — inclusive no de
 * quem clonou o projeto e nao tem conta no Sentry — e emite avisos sobre
 * source map e token de autenticacao ausentes. O projeto precisa subir
 * limpo sem depender de servico externo.
 */
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (!dsn) {
  module.exports = nextConfig;
} else {
  const { withSentryConfig } = require('@sentry/nextjs');

  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,

    // Sem token nao ha upload de source map; o build segue, apenas com o
    // stack trace menos legivel no painel.
    silent: !process.env.CI,

    // Encaminha os eventos por uma rota da propria aplicacao, para
    // bloqueador de anuncio nao descartar o relatorio de erro.
    tunnelRoute: '/monitoring',

    disableLogger: true,
    widenClientFileUpload: true,
  });
}
