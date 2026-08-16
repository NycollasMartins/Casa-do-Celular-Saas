import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AgendamentoForm } from '@/components/forms/agendamento-form';
import { exigirUsuario } from '@/lib/auth/session';
import { buscarLojasDoUsuario } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import type { Agendamento } from '@/lib/types/database';

export const metadata = { title: 'Editar agendamento · Casa do Celular' };

export default async function EditarAgendamentoPage({ params }: { params: { id: string } }) {
  const usuario = await exigirUsuario();
  const supabase = createClient();

  // O RLS ja garante que so vem agendamento das lojas permitidas.
  const { data } = await supabase.from('agendamentos').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();

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
        <h1 className="text-2xl font-semibold text-ink">Editar agendamento</h1>
        <p className="mt-1 text-sm text-slate-500">Atualize a situacao do contato apos a visita.</p>
      </div>

      <AgendamentoForm role={usuario.role} lojas={lojas} agendamento={data as Agendamento} />
    </div>
  );
}
