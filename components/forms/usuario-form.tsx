'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usuarioSchema, type UsuarioInput } from '@/lib/validations/cadastros';
import { criarUsuario } from '@/app/actions/cadastros';

interface Props {
  lojas: { id: string; nome: string }[];
  onSalvo?: () => void;
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

    // A senha provisoria vem na mensagem: fica visivel por mais tempo.
    toast.success(resultado.mensagem ?? 'Usuario criado.', { duration: 12000 });
    onSalvo?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" placeholder="Ana Souza" {...register('nome')} />
        {errors.nome ? <p className="text-xs text-danger">{errors.nome.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail de acesso</Label>
        <Input id="email" type="email" placeholder="ana@franqueado.com.br" {...register('email')} />
        {errors.email ? <p className="text-xs text-danger">{errors.email.message}</p> : null}
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
          <SelectTrigger id="loja_id">
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
        {errors.loja_id ? <p className="text-xs text-danger">{errors.loja_id.message}</p> : null}
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
