'use client';

import dynamic from 'next/dynamic';

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

import { CredencialProvisoria } from '@/components/forms/credencial-provisoria';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * O formulario so e baixado quando o dialogo abre.
 *
 * Ele arrasta a validacao e o controle de formulario — cerca de oitenta
 * kilobytes. Esta tela e uma LISTA: quem chega nela quer ver o que existe,
 * nao cadastrar. Carregar o formulario junto e pagar o cadastro em toda
 * visita para atender ao clique que acontece as vezes.
 */
const UsuarioForm = dynamic(
  () => import('@/components/forms/usuario-form').then((modulo) => modulo.UsuarioForm),
  { loading: () => <Skeleton className="h-72 w-full" /> }
);

export function UsuarioDialog({ lojas }: { lojas: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);

  return (
    <>
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
            A senha de primeiro acesso aparece ao salvar, numa janela propria. Anote e repasse
            com seguranca.
          </DialogDescription>
        </DialogHeader>
        <UsuarioForm
          lojas={lojas}
          onSalvo={(nova) => {
            setAberto(false);
            if (nova) setCredencial(nova);
          }}
        />
      </DialogContent>
    </Dialog>

    <CredencialProvisoria
      email={credencial?.email ?? ''}
      senha={credencial?.senha ?? null}
      aoFechar={() => setCredencial(null)}
    />
    </>
  );
}
