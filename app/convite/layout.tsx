/**
 * Mesmo enquadramento das telas de acesso.
 *
 * `/convite` nao fica sob `/auth` porque o middleware trata os dois de forma
 * diferente: rota sob `/auth` redireciona quem ja esta logado para o
 * dashboard, e um convite precisa abrir para qualquer um — inclusive para
 * voce, testando o proprio link com a sessao aberta.
 */
export default function ConviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            CC
          </span>
          <div>
            <p className="text-base font-semibold text-ink">Casa do Celular</p>
            <p className="text-sm text-slate-500">Performance de agendadores</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
