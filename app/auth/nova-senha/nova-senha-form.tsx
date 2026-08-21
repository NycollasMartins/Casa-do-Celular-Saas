'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MensagemErro } from '@/components/ui/campo';
import { definirNovaSenha } from '@/app/actions/auth';

export function NovaSenhaForm() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({});
  const [enviando, iniciar] = useTransition();

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    iniciar(async () => {
      const resultado = await definirNovaSenha(formData);

      if (!resultado.sucesso) {
        setErro(resultado.mensagem ?? 'Nao foi possivel salvar a senha.');
        setErros(resultado.erros ?? {});
        return;
      }

      setErro(null);
      setErros({});
      toast.success('Senha atualizada.');
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        {/*
          Este campo tem dois textos possiveis: a dica de formato e o erro.
          O leitor de tela deve anunciar um OU outro, entao o
          aria-describedby aponta para o que estiver visivel.
        */}
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={erros.senha?.[0] ? true : undefined}
          aria-describedby={erros.senha?.[0] ? 'senha-erro' : 'senha-dica'}
        />
        {erros.senha ? (
          <MensagemErro id="senha" mensagem={erros.senha[0]} />
        ) : (
          <p id="senha-dica" className="text-sm text-slate-500">
            Ao menos 8 caracteres, com letra e numero.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a nova senha</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={erros.confirmacao?.[0] ? true : undefined}
          aria-describedby={erros.confirmacao?.[0] ? 'confirmacao-erro' : undefined}
        />
        <MensagemErro id="confirmacao" mensagem={erros.confirmacao?.[0]} />
      </div>

      {erro ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={enviando}>
        Salvar senha
      </Button>
    </form>
  );
}
