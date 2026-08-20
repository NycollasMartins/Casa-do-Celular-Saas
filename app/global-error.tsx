'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Ultima linha de defesa: pega erros do proprio layout raiz, que o
 * app/error.tsx nao alcanca. Substitui <html> e <body>, entao nao pode
 * depender de nada do layout — inclusive do CSS global.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F5F5F5',
          color: '#333333',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 .5rem' }}>
            O sistema nao pode ser carregado
          </h1>
          <p style={{ fontSize: '.875rem', color: '#64748B', margin: '0 0 1rem', lineHeight: 1.6 }}>
            A falha aconteceu antes da aplicacao subir. Tente recarregar; se
            continuar, avise o suporte com o codigo abaixo.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: '.8125rem',
                fontFamily: 'ui-monospace, monospace',
                background: '#F8FAFC',
                padding: '.5rem .75rem',
                borderRadius: '6px',
                margin: '0 0 1rem',
              }}
            >
              {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              width: '100%',
              height: '2.5rem',
              background: '#0066CC',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
