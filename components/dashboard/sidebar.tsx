'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  Handshake,
  Target,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/types/database';

interface ItemNav {
  href: string;
  label: string;
  icone: typeof LayoutDashboard;
  roles: UserRole[];
}

export const ITENS_NAVEGACAO: ItemNav[] = [
  {
    href: '/dashboard',
    label: 'Visao geral',
    icone: LayoutDashboard,
    roles: ['super_admin', 'franqueado', 'diretor', 'agendador'],
  },
  {
    href: '/dashboard/agendamentos',
    label: 'Agendamentos',
    icone: CalendarDays,
    roles: ['super_admin', 'franqueado', 'diretor', 'agendador'],
  },
  {
    href: '/dashboard/relatorios',
    label: 'Relatorios',
    icone: LineChart,
    roles: ['super_admin', 'franqueado', 'diretor'],
  },
  { href: '/dashboard/lojas', label: 'Lojas', icone: Store, roles: ['super_admin', 'franqueado'] },
  {
    href: '/dashboard/metas',
    label: 'Metas',
    icone: Target,
    roles: ['super_admin', 'franqueado'],
  },
  { href: '/dashboard/usuarios', label: 'Equipe', icone: Users, roles: ['super_admin', 'franqueado'] },
  {
    href: '/dashboard/participacoes',
    label: 'Societario',
    icone: Handshake,
    roles: ['super_admin', 'franqueado'],
  },
  {
    href: '/dashboard/privacidade',
    label: 'Privacidade',
    icone: ShieldCheck,
    roles: ['super_admin', 'franqueado'],
  },
  { href: '/admin/franqueados', label: 'Franqueados', icone: Building2, roles: ['super_admin'] },
];

export function itensParaRole(role: UserRole): ItemNav[] {
  return ITENS_NAVEGACAO.filter((item) => item.roles.includes(role));
}

export function NavLinks({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Navegacao principal">
      {itensParaRole(role).map((item) => {
        const Icone = item.icone;
        const ativo = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200',
              ativo ? 'bg-brand-light text-brand-dark' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
            )}
          >
            <Icone className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar fixa em telas grandes. No mobile quem assume e o MobileNav. */
export function Sidebar({ role }: { role: UserRole }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-sm font-bold text-white">
            CC
          </span>
          <span className="text-sm font-semibold leading-tight text-ink">
            Casa do Celular
            <span className="block text-xs font-normal text-slate-400">Performance</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks role={role} />
        </div>
      </div>
    </aside>
  );
}
