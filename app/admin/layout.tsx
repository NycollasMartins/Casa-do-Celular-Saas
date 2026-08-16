import Link from 'next/link';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/layout/header';
import { exigirRole } from '@/lib/auth/session';

const ABAS = [
  { href: '/admin/franqueados', label: 'Franqueados' },
  { href: '/admin/lojas', label: 'Todas as lojas' },
  { href: '/admin/metricas-gerais', label: 'Metricas da rede' },
];

/** Area exclusiva do super admin (dono do SaaS). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirRole(['super_admin']);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar role={usuario.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header usuario={usuario} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <nav className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-card" aria-label="Secoes do admin">
            {ABAS.map((aba) => (
              <Link
                key={aba.href}
                href={aba.href}
                className="whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
              >
                {aba.label}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
