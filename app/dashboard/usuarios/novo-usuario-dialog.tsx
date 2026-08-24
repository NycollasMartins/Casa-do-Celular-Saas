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
import { CredencialProvisoria } from '@/components/forms/credencial-provisoria';

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
