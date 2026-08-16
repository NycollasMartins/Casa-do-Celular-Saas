'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { NavLinks } from '@/components/dashboard/sidebar';
import type { UserRole } from '@/lib/types/database';

/** Menu hamburguer: a maioria dos agendadores acessa pelo celular. */
export function MobileNav({ role }: { role: UserRole }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-4 max-w-sm translate-y-0 sm:top-1/2 sm:-translate-y-1/2">
        <DialogTitle className="mb-4">Menu</DialogTitle>
        <NavLinks role={role} onNavigate={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
