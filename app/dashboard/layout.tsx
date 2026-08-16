import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/layout/header';
import { exigirUsuario } from '@/lib/auth/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar role={usuario.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header usuario={usuario} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
