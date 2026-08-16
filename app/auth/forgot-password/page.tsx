'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { enviarLinkDeRecuperacao } from '@/app/actions/auth';

export default function ForgotPasswordPage() {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    iniciar(async () => {
      const resultado = await enviarLinkDeRecuperacao(formData);
      setMensagem(resultado.mensagem ?? 'Verifique seu e-mail.');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar acesso</CardTitle>
        <CardDescription>Enviamos um link para voce definir uma nova senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={aoEnviar} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>

          {mensagem ? (
            <p className="rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">{mensagem}</p>
          ) : null}

          <Button type="submit" className="w-full" loading={enviando}>
            Enviar link
          </Button>

          <Link href="/auth/login" className="block text-center text-sm text-slate-500 hover:underline">
            Voltar para o login
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
