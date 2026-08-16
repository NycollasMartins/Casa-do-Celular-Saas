'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FranqueadoForm } from '@/components/forms/franqueado-form';
import type { Franqueado } from '@/lib/types/database';

export function FranqueadoDialog({ franqueado, gatilho }: { franqueado?: Franqueado; gatilho?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {gatilho ?? (
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Novo franqueado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{franqueado ? 'Editar franqueado' : 'Novo franqueado'}</DialogTitle>
          <DialogDescription>Cada franqueado e um tenant isolado dentro do sistema.</DialogDescription>
        </DialogHeader>
        <FranqueadoForm franqueado={franqueado} onSalvo={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
