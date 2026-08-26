'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
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
import { Skeleton } from '@/components/ui/skeleton';
import type { Loja } from '@/lib/types/database';

/**
 * O formulario so e baixado quando o dialogo abre.
 *
 * Ele arrasta a validacao e o controle de formulario — cerca de oitenta
 * kilobytes — e a tela de Lojas e uma LISTA: quem chega nela quer ver as
 * lojas, nao cadastrar. Carregar o formulario junto e pagar o cadastro em
 * toda visita para atender ao clique que acontece as vezes.
 */
const LojaForm = dynamic(
  () => import('@/components/forms/loja-form').then((modulo) => modulo.LojaForm),
  { loading: () => <Skeleton className="h-72 w-full" /> }
);

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
