'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entrar } from '@/app/actions/auth';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    iniciar(async () => {
      const resultado = await entrar(formData);
      if (!resultado.sucesso) {
        setErro(resultado.mensagem ?? 'Nao foi possivel entrar.');
        return;
      }

      setErro(null);
      toast.success('Bem-vindo de volta.');
      router.push(searchParams.get('redirect') ?? '/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@franqueado.com.br" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>

      {erro ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={enviando}>
        Entrar
      </Button>

      <div className="flex justify-between text-sm">
        <Link href="/auth/forgot-password" className="text-brand hover:underline">
          Esqueci a senha
        </Link>
        <Link href="/auth/register" className="text-slate-500 hover:underline">
          Nao tenho acesso
        </Link>
      </div>
    </form>
  );
}
