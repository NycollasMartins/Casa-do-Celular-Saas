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
import { lojaSchema, type LojaInput } from '@/lib/validations/cadastros';
import { salvarLoja } from '@/app/actions/cadastros';
import type { Loja } from '@/lib/types/database';

interface Props {
  loja?: Loja;
  onSalvo?: () => void;
}

export function LojaForm({ loja, onSalvo }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LojaInput>({
    resolver: zodResolver(lojaSchema),
    defaultValues: {
      nome: loja?.nome ?? '',
      codigo_loja: loja?.codigo_loja ?? '',
      estado: loja?.estado ?? 'DF',
      cidade: loja?.cidade ?? 'Brasilia',
      endereco: loja?.endereco ?? '',
      telefone: loja?.telefone ?? '',
      gerente_nome: loja?.gerente_nome ?? '',
      status: loja?.status ?? 'ativo',
    },
  });

  async function aoEnviar(valores: LojaInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => formData.append(chave, String(valor ?? '')));

    const resultado = await salvarLoja(formData, loja?.id);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem ?? 'Nao foi possivel salvar.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Loja salva.');
    onSalvo?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="nome">Nome da loja</Label>
        <Input
          id="nome" placeholder="Casa do Celular Loja 10" {...register('nome')}
          {...propsDeValidacao('nome', errors.nome?.message)}
        />
        <MensagemErro id="nome" mensagem={errors.nome?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="codigo_loja">Codigo</Label>
        <Input
          id="codigo_loja" placeholder="LOJA-010" {...register('codigo_loja')}
          {...propsDeValidacao('codigo_loja', errors.codigo_loja?.message)}
        />
        <MensagemErro id="codigo_loja" mensagem={errors.codigo_loja?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="estado">Estado (UF)</Label>
        <Input
          id="estado" maxLength={2} placeholder="DF" {...register('estado')}
          {...propsDeValidacao('estado', errors.estado?.message)}
        />
        <MensagemErro id="estado" mensagem={errors.estado?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cidade">Cidade</Label>
        <Input
          id="cidade" placeholder="Brasilia" {...register('cidade')}
          {...propsDeValidacao('cidade', errors.cidade?.message)}
        />
        <MensagemErro id="cidade" mensagem={errors.cidade?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telefone">Telefone</Label>
        <Input id="telefone" placeholder="(61) 3333-0000" {...register('telefone')} />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="endereco">Endereco</Label>
        <Input id="endereco" placeholder="SCN Quadra 10" {...register('endereco')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gerente_nome">Gerente</Label>
        <Input id="gerente_nome" placeholder="Nome do gerente" {...register('gerente_nome')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select value={watch('status')} onValueChange={(valor) => setValue('status', valor as 'ativo' | 'inativo')}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativa</SelectItem>
            <SelectItem value="inativo">Inativa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          {loja ? 'Salvar alteracoes' : 'Criar loja'}
        </Button>
      </div>
    </form>
  );
}
