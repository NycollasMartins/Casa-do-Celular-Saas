'use client';

import { useTransition } from 'react';
import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { sair } from '@/app/actions/auth';
import { ROLE_LABEL } from '@/lib/utils';
import type { Usuario } from '@/lib/types/database';

export function UserMenu({ usuario }: { usuario: Usuario }) {
  const [saindo, iniciar] = useTransition();

  const iniciais = usuario.nome
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 pl-2 pr-3" aria-label="Abrir menu do usuario">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand-dark">
            {iniciais || <User className="h-3.5 w-3.5" aria-hidden />}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{usuario.nome}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{ROLE_LABEL[usuario.role]}</DropdownMenuLabel>
        <div className="px-3 pb-2 text-sm text-slate-500">{usuario.email}</div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(evento) => {
            evento.preventDefault();
            iniciar(() => {
              void sair();
            });
          }}
          className="text-danger data-[highlighted]:bg-red-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {saindo ? 'Saindo...' : 'Sair da conta'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
