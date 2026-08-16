'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UsuarioForm } from '@/components/forms/usuario-form';

export function UsuarioDialog({ lojas }: { lojas: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" aria-hidden />
          Novo usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo usuario</DialogTitle>
          <DialogDescription>
            A senha provisoria aparece na confirmacao. Anote e repasse com seguranca.
          </DialogDescription>
        </DialogHeader>
        <UsuarioForm lojas={lojas} onSalvo={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
