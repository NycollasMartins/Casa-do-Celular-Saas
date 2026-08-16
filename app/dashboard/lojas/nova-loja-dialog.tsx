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
import { LojaForm } from '@/components/forms/loja-form';
import type { Loja } from '@/lib/types/database';

export function LojaDialog({ loja, gatilho }: { loja?: Loja; gatilho?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {gatilho ?? (
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Nova loja
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{loja ? 'Editar loja' : 'Nova loja'}</DialogTitle>
          <DialogDescription>
            O codigo identifica a loja nos relatorios e precisa ser unico na rede.
          </DialogDescription>
        </DialogHeader>
        <LojaForm loja={loja} onSalvo={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
