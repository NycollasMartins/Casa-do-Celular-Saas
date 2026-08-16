'use client';

import { Toaster as SonnerToaster } from 'sonner';

/** Toasts globais: 3.5s, verde para sucesso e vermelho para erro. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      duration={3500}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border border-slate-200 shadow-card-hover text-sm',
          success: 'text-emerald-700',
          error: 'text-red-700',
        },
      }}
    />
  );
}
