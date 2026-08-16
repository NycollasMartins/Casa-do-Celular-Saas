import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';
import type { Usuario } from '@/lib/types/database';

export function Header({ usuario }: { usuario: Usuario }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <MobileNav role={usuario.role} />
        <Link href="/dashboard" className="text-sm font-semibold text-ink lg:hidden">
          Casa do Celular
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard/agendamentos/novo">
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Novo agendamento</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </Button>
        <UserMenu usuario={usuario} />
      </div>
    </header>
  );
}
