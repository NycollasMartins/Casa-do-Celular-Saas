'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MensagemErro, propsDeValidacao } from '@/components/ui/campo';
import {
  convitePrimeiroAcessoSchema,
  type ConvitePrimeiroAcessoInput,
} from '@/lib/validations/auth';
import { aceitarConvite } from '@/app/actions/convites';

export function ConviteForm({ token }: { token: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConvitePrimeiroAcessoInput>({
    resolver: zodResolver(convitePrimeiroAcessoSchema),
    defaultValues: { razao_social: '', cnpj: '', nome: '', email: '', senha: '', confirmacao: '' },
  });

  async function aoEnviar(valores: ConvitePrimeiroAcessoInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => formData.append(chave, String(valor ?? '')));

    const resultado = await aceitarConvite(token, formData);

    if (!resultado.sucesso) {
      // Erro por campo volta para o campo. O caso que importa e o e-mail ja
      // cadastrado: como aviso solto, a pessoa relê o formulario inteiro sem
      // achar o que corrigir.
      for (const [campo, mensagens] of Object.entries(resultado.erros ?? {})) {
        setError(campo as keyof ConvitePrimeiroAcessoInput, { message: mensagens[0] });
      }
      toast.error(resultado.mensagem ?? 'Nao foi possivel criar o acesso.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Acesso criado.');
    router.replace('/auth/login');
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="razao_social">Nome da empresa</Label>
        <Input
          id="razao_social" placeholder="Casa do Celular Goiania Ltda" {...register('razao_social')}
          {...propsDeValidacao('razao_social', errors.razao_social?.message)}
        />
        <MensagemErro id="razao_social" mensagem={errors.razao_social?.message} />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="cnpj">CNPJ (opcional)</Label>
        <Input
          id="cnpj" placeholder="00.000.000/0001-00" {...register('cnpj')}
          {...propsDeValidacao('cnpj', errors.cnpj?.message)}
        />
        <MensagemErro id="cnpj" mensagem={errors.cnpj?.message} />
        <p className="text-xs text-slate-400">Pode preencher depois, nas configuracoes.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nome">Seu nome</Label>
        <Input
          id="nome" placeholder="Maria Souza" {...register('nome')}
          {...propsDeValidacao('nome', errors.nome?.message)}
        />
        <MensagemErro id="nome" mensagem={errors.nome?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input
          id="email" type="email" autoComplete="username" placeholder="maria@empresa.com.br"
          {...register('email')}
          {...propsDeValidacao('email', errors.email?.message)}
        />
        <MensagemErro id="email" mensagem={errors.email?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha" type="password" autoComplete="new-password" {...register('senha')}
          {...propsDeValidacao('senha', errors.senha?.message)}
        />
        <MensagemErro id="senha" mensagem={errors.senha?.message} />
        <p className="text-xs text-slate-400">Ao menos 8 caracteres, com letra e numero.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a senha</Label>
        <Input
          id="confirmacao" type="password" autoComplete="new-password" {...register('confirmacao')}
          {...propsDeValidacao('confirmacao', errors.confirmacao?.message)}
        />
        <MensagemErro id="confirmacao" mensagem={errors.confirmacao?.message} />
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" loading={isSubmitting} className="w-full">
          Criar meu acesso
        </Button>
      </div>
    </form>
  );
}
