/**
 * Sentry no navegador. Inerte sem NEXT_PUBLIC_SENTRY_DSN: sem DSN o init nao
 * roda, nenhuma requisicao sai e nada e coletado. Isso mantem o ambiente de
 * desenvolvimento silencioso e permite subir o projeto sem conta no Sentry.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,

    // 10% das transacoes. O volume aqui e de 20 pessoas, nao de milhoes:
    // amostrar menos economiza cota sem esconder problema recorrente.
    tracesSampleRate: 0.1,

    // Replay so quando ja houve erro — gravar sessao inteira de todo mundo
    // capturaria CPF e telefone de cliente digitados em tela.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Dados pessoais nao vao para servico de terceiro. O sistema trata CPF
    // de cliente final e isso e obrigacao de LGPD, nao preferencia.
    sendDefaultPii: false,

    beforeSend(evento) {
      // Ultima barreira: o mesmo CPF que a tela mascara nao pode vazar pela
      // URL de um breadcrumb ou pela mensagem de uma excecao.
      return removerDadosPessoais(evento);
    },
  });
}

/** Substitui CPF e telefone em qualquer texto do evento. */
function removerDadosPessoais<T>(evento: T): T {
  const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const TELEFONE = /\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g;

  const texto = JSON.stringify(evento)
    .replace(CPF, '[cpf removido]')
    .replace(TELEFONE, '[telefone removido]');

  return JSON.parse(texto) as T;
}
