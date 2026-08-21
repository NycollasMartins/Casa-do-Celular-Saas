'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usuarioEdicaoSchema, type UsuarioEdicaoInput } from '@/lib/validations/cadastros';
import { atualizarUsuario } from '@/app/actions/cadastros';
import type { Usuario } from '@/lib/types/database';

interface Props {
  usuario: Usuario;
  lojas: { id: string; nome: string }[];
  lojaAtualId?: string;
  onSalvo?: () => void;
}

/** Edita nome, papel e lotacao. O e-mail nao muda aqui: mexe em auth.users. */
export function UsuarioEdicaoForm({ usuario, lojas, lojaAtualId, onSalvo }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioEdicaoInput>({
    resolver: zodResolver(usuarioEdicaoSchema),
    defaultValues: {
      nome: usuario.nome,
      role: usuario.role === 'super_admin' ? 'franqueado' : usuario.role,
      loja_id: lojaAtualId ?? lojas[0]?.id,
      percentual_participacao: 30,
    },
  });

  const role = watch('role');

  async function aoEnviar(valores: UsuarioEdicaoInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null) formData.append(chave, String(valor));
    });

    const resultado = await atualizarUsuario(usuario.id, formData);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem ?? 'Nao foi possivel salvar.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Usuario atualizado.');
    onSalvo?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="edit-nome">Nome</Label>
        <Input id="edit-nome" {...register('nome')} />
        {errors.nome ? <p className="text-xs text-danger">{errors.nome.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-email">E-mail de acesso</Label>
        <Input id="edit-email" value={usuario.email} disabled readOnly />
        <p className="text-xs text-slate-400">Para trocar o e-mail, crie um novo acesso.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-role">Perfil</Label>
        <Select value={role} onValueChange={(valor) => setValue('role', valor as UsuarioEdicaoInput['role'])}>
          <SelectTrigger id="edit-role">
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
        <Label htmlFor="edit-loja">{role === 'agendador' ? 'Loja de atuacao' : 'Loja da participacao'}</Label>
        <Select value={watch('loja_id')} onValueChange={(valor) => setValue('loja_id', valor)}>
          <SelectTrigger id="edit-loja">
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
        <p className="text-xs text-slate-400">
          {role === 'agendador'
            ? 'Trocar de loja encerra a lotacao atual e abre uma nova, preservando o historico.'
            : 'Quem participa de mais de uma loja e transferido pela tela Societario, nao por aqui.'}
        </p>
      </div>

      {role !== 'agendador' ? (
        <div className="space-y-1.5">
          <Label htmlFor="edit-percentual">Participacao (%)</Label>
          <Input
            id="edit-percentual"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            {...register('percentual_participacao')}
          />
        </div>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          Salvar alteracoes
        </Button>
      </div>
    </form>
  );
}
