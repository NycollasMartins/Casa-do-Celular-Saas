import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AgendamentoForm } from '@/components/forms/agendamento-form';
import { exigirUsuario } from '@/lib/auth/session';
import { buscarLojasDoUsuario } from '@/lib/supabase/queries';

export const metadata = { title: 'Novo agendamento · Casa do Celular' };

export default async function NovoAgendamentoPage() {
  const usuario = await exigirUsuario();
  const lojas = await buscarLojasDoUsuario();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/agendamentos"
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar
        </Link>
        <h1 className="text-2xl font-semibold text-ink">Novo agendamento</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registre o contato feito no WhatsApp. Loja e agendador sao preenchidos pelo seu acesso.
        </p>
      </div>

      {lojas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          Voce ainda nao tem loja atribuida. Peca ao franqueado para vincular seu usuario a uma loja.
        </p>
      ) : (
        <AgendamentoForm role={usuario.role} lojas={lojas} />
      )}
    </div>
  );
}
