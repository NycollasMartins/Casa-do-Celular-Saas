/** Sentry no servidor (Node). Inerte sem SENTRY_DSN. */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,

    beforeSend(evento) {
      // O corpo de uma server action pode conter o formulario inteiro de
      // agendamento — nome, CPF e telefone do cliente.
      const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
      const TELEFONE = /\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g;

      const texto = JSON.stringify(evento)
        .replace(CPF, '[cpf removido]')
        .replace(TELEFONE, '[telefone removido]');

      return JSON.parse(texto);
    },
  });
}
