'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { franqueadoSchema, type FranqueadoInput } from '@/lib/validations/cadastros';
import { salvarFranqueado } from '@/app/actions/cadastros';
import type { Franqueado } from '@/lib/types/database';

export function FranqueadoForm({ franqueado, onSalvo }: { franqueado?: Franqueado; onSalvo?: () => void }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FranqueadoInput>({
    resolver: zodResolver(franqueadoSchema),
    defaultValues: {
      nome: franqueado?.nome ?? '',
      cnpj: franqueado?.cnpj ?? '',
      email_contato: franqueado?.email_contato ?? '',
      telefone_contato: franqueado?.telefone_contato ?? '',
      status: franqueado?.status ?? 'ativo',
      data_contrato: franqueado?.data_contrato ?? '',
    },
  });

  async function aoEnviar(valores: FranqueadoInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => formData.append(chave, String(valor ?? '')));

    const resultado = await salvarFranqueado(formData, franqueado?.id);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem ?? 'Nao foi possivel salvar.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Franqueado salvo.');
    onSalvo?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="nome">Razao social</Label>
        <Input id="nome" placeholder="Franqueado Principal Ltda" {...register('nome')} />
        {errors.nome ? <p className="text-xs text-danger">{errors.nome.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" placeholder="00.000.000/0001-00" {...register('cnpj')} />
        {errors.cnpj ? <p className="text-xs text-danger">{errors.cnpj.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email_contato">E-mail de contato</Label>
        <Input id="email_contato" type="email" {...register('email_contato')} />
        {errors.email_contato ? <p className="text-xs text-danger">{errors.email_contato.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telefone_contato">Telefone</Label>
        <Input id="telefone_contato" placeholder="(61) 99999-9999" {...register('telefone_contato')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="data_contrato">Data do contrato</Label>
        <Input id="data_contrato" type="date" {...register('data_contrato')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Status</Label>
        <Select
          value={watch('status')}
          onValueChange={(valor) => setValue('status', valor as FranqueadoInput['status'])}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          {franqueado ? 'Salvar alteracoes' : 'Criar franqueado'}
        </Button>
      </div>
    </form>
  );
}
