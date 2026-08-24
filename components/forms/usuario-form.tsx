'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MensagemErro, propsDeValidacao } from '@/components/ui/campo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usuarioSchema, type UsuarioInput } from '@/lib/validations/cadastros';
import { criarUsuario } from '@/app/actions/cadastros';

interface Props {
  lojas: { id: string; nome: string }[];
  /** Recebe a credencial gerada: quem exibe e o pai, num dialogo que fica. */
  onSalvo?: (credencial?: { email: string; senha: string }) => void;
}

/** Cria um usuario e ja monta o vinculo com a loja (agendador) ou a participacao (diretor). */
export function UsuarioForm({ lojas, onSalvo }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioInput>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: { nome: '', email: '', role: 'agendador', loja_id: lojas[0]?.id, percentual_participacao: 30 },
  });

  const role = watch('role');

  async function aoEnviar(valores: UsuarioInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null) formData.append(chave, String(valor));
    });

    const resultado = await criarUsuario(formData);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem ?? 'Nao foi possivel criar o usuario.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Usuario criado.');
    // A senha nao vai para o toast: some antes de ser anotada, e some para
    // sempre — nao ha onde consulta-la depois.
    onSalvo?.(
      resultado.senhaProvisoria
        ? { email: valores.email, senha: resultado.senhaProvisoria }
        : undefined
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome" placeholder="Ana Souza" {...register('nome')}
          {...propsDeValidacao('nome', errors.nome?.message)}
        />
        <MensagemErro id="nome" mensagem={errors.nome?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail de acesso</Label>
        <Input
          id="email" type="email" placeholder="ana@franqueado.com.br" {...register('email')}
          {...propsDeValidacao('email', errors.email?.message)}
        />
        <MensagemErro id="email" mensagem={errors.email?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Perfil</Label>
        <Select value={role} onValueChange={(valor) => setValue('role', valor as UsuarioInput['role'])}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agendador">Agendador</SelectItem>
            <SelectItem value="diretor">Diretor</SelectItem>
            <SelectItem value="franqueado">Franqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loja_id">{role === 'agendador' ? 'Loja de atuacao' : 'Loja da participacao'}</Label>
        <Select value={watch('loja_id')} onValueChange={(valor) => setValue('loja_id', valor)}>
          <SelectTrigger id="loja_id" {...propsDeValidacao('loja_id', errors.loja_id?.message)}>
            <SelectValue placeholder="Escolha a loja" />
          </SelectTrigger>
          <SelectContent>
            {lojas.map((loja) => (
              <SelectItem key={loja.id} value={loja.id}>
                {loja.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MensagemErro id="loja_id" mensagem={errors.loja_id?.message} />
      </div>

      {role !== 'agendador' ? (
        <div className="space-y-1.5">
          <Label htmlFor="percentual_participacao">Participacao (%)</Label>
          <Input
            id="percentual_participacao"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            {...register('percentual_participacao')}
          />
          <p className="text-xs text-slate-400">Define quais lojas o diretor enxerga no dashboard.</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          Criar usuario
        </Button>
      </div>
    </form>
  );
}
