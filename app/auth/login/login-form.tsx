'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entrar } from '@/app/actions/auth';
import { destinoSeguro } from '@/lib/rede';

/** Motivos que outras rotas repassam pela query string. */
const ERRO_NA_URL: Record<string, string> = {
  link_invalido: 'O link expirou ou ja foi usado. Peca um novo.',
  acesso_revogado: 'Seu acesso foi encerrado. Fale com o responsavel pela sua loja.',
  rede_suspensa:
    'A assinatura da sua rede esta suspensa. Os dados continuam guardados: fale com quem contratou o sistema para reativar.',
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const erroDaUrl = ERRO_NA_URL[searchParams.get('erro') ?? ''] ?? null;
  const mensagem = erro ?? erroDaUrl;

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
      // O `redirect` vem da URL, entao vem de fora: `?redirect=//evil.com`
      // levaria a pessoa para outro site logo depois de ela autenticar aqui.
      router.push(destinoSeguro(searchParams.get('redirect')));
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

      {mensagem ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {mensagem}
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
