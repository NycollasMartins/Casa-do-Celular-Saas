/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Necessario no Next 14 para o instrumentation.ts ser carregado.
    instrumentationHook: true,
  },
  eslint: { ignoreDuringBuilds: false },

  /**
   * Cabecalhos de seguranca.
   *
   * Medido em producao: a resposta trazia apenas `strict-transport-security`,
   * que a Netlify acrescenta sozinha. Nenhum dos demais — nem Next nem a
   * plataforma poem por conta propria.
   *
   * O que mais pesa aqui e o enquadramento. Sem `X-Frame-Options` e sem
   * `frame-ancestors`, qualquer site pode embutir o dashboard num iframe
   * invisivel e capturar cliques de quem esta autenticado. O alvo seria um
   * franqueado na tela de Equipe, onde os cliques criam e desligam acesso.
   *
   * A CSP fica DELIBERADAMENTE nesse unico item. Uma politica completa
   * precisaria liberar o inline que o Next usa para hidratacao e os domínios
   * do Supabase e do Sentry; errar qualquer um quebra a aplicacao em
   * producao, e uma CSP que quebra a tela e revertida as pressas — pior que
   * nao ter. `frame-ancestors` nao tem esse risco: ele so proibe o que ja
   * nao deveria acontecer.
   */
  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // Impede o navegador de adivinhar o tipo de um arquivo servido —
          // e por adivinhacao que um upload vira script executavel.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Sem isto, o caminho completo vai no Referer ao clicar num link
          // externo, e caminhos daqui carregam id de agendamento e de loja.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // O sistema nao usa nenhum destes. Negar por omissao evita que um
          // script de terceiro peca em nome da pagina.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
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
