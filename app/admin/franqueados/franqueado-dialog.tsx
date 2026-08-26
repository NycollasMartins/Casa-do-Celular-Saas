'use client';

import dynamic from 'next/dynamic';

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

import type { Franqueado } from '@/lib/types/database';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O formulario so e baixado quando o dialogo abre.
 *
 * Ele arrasta a validacao e o controle de formulario — cerca de oitenta
 * kilobytes. Esta tela e uma LISTA: quem chega nela quer ver o que existe,
 * nao cadastrar. Carregar o formulario junto e pagar o cadastro em toda
 * visita para atender ao clique que acontece as vezes.
 */
const FranqueadoForm = dynamic(
  () => import('@/components/forms/franqueado-form').then((modulo) => modulo.FranqueadoForm),
  { loading: () => <Skeleton className="h-72 w-full" /> }
);

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
