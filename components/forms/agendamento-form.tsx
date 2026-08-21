'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MensagemErro } from '@/components/ui/campo';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { agendamentoSchema, novoAgendamentoSchema, STATUS_AGENDAMENTO } from '@/lib/validations/agendamento';
import type { AgendamentoInput } from '@/lib/validations/agendamento';
import { criarAgendamento, atualizarAgendamento } from '@/app/actions/agendamentos';
import { STATUS_LABEL, mascararCpf, mascararTelefone } from '@/lib/utils';
import type { Agendamento, UserRole } from '@/lib/types/database';
import { hojeNaLoja } from '@/lib/semana';

interface Props {
  role: UserRole;
  lojas: { id: string; nome: string; codigo_loja: string }[];
  /** Preenchido em modo edicao. */
  agendamento?: Agendamento;
}

/**
 * Formulario de agendamento.
 * Campos derivados da sessao (franqueado_id, agendador_id) nao aparecem aqui:
 * a server action os resolve. A loja so e escolhida por quem tem mais de uma.
 */
export function AgendamentoForm({ role, lojas, agendamento }: Props) {
  const router = useRouter();
  const edicao = Boolean(agendamento);
  const lojaFixa = role === 'agendador' || lojas.length === 1;

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AgendamentoInput>({
    resolver: zodResolver(edicao ? agendamentoSchema : novoAgendamentoSchema),
    defaultValues: {
      cliente_nome: agendamento?.cliente_nome ?? '',
      cliente_email: agendamento?.cliente_email ?? '',
      cliente_cpf: agendamento?.cliente_cpf ?? '',
      cliente_telefone: agendamento?.cliente_telefone ?? '',
      data_agendamento: agendamento?.data_agendamento ?? hojeNaLoja(),
      status: agendamento?.status ?? 'contatado',
      observacoes: agendamento?.observacoes ?? '',
      loja_id: agendamento?.loja_id ?? lojas[0]?.id ?? '',
    },
  });

  const statusAtual = watch('status');
  const lojaAtual = watch('loja_id');

  async function aoEnviar(valores: AgendamentoInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => formData.append(chave, valor ?? ''));

    const resultado = agendamento
      ? await atualizarAgendamento(agendamento.id, formData)
      : await criarAgendamento(formData);

    if (!resultado.sucesso) {
      // Erros de campo vindos do servidor voltam para o formulario.
      Object.entries(resultado.erros ?? {}).forEach(([campo, mensagens]) => {
        setError(campo as keyof AgendamentoInput, { message: mensagens[0] });
      });
      toast.error(resultado.mensagem ?? 'Nao foi possivel salvar.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Agendamento salvo.');
    router.push('/dashboard/agendamentos');
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-5 sm:grid-cols-2" noValidate>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cliente_nome">Nome do cliente</Label>
            <Input
              id="cliente_nome"
              autoComplete="off"
              aria-invalid={Boolean(errors.cliente_nome)}
              aria-describedby={errors.cliente_nome ? 'cliente_nome-erro' : undefined}
              placeholder="Maria da Silva"
              {...register('cliente_nome')}
            />
            <MensagemErro id="cliente_nome" mensagem={errors.cliente_nome?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente_cpf">CPF</Label>
            <Input
              id="cliente_cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              aria-invalid={Boolean(errors.cliente_cpf)}
              aria-describedby={errors.cliente_cpf ? 'cliente_cpf-erro' : undefined}
              {...register('cliente_cpf')}
              onChange={(evento) => setValue('cliente_cpf', mascararCpf(evento.target.value))}
            />
            <MensagemErro id="cliente_cpf" mensagem={errors.cliente_cpf?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente_telefone">Telefone (WhatsApp)</Label>
            <Input
              id="cliente_telefone"
              inputMode="tel"
              placeholder="(61) 90000-0000"
              aria-invalid={Boolean(errors.cliente_telefone)}
              aria-describedby={errors.cliente_telefone ? 'cliente_telefone-erro' : undefined}
              {...register('cliente_telefone')}
              onChange={(evento) => setValue('cliente_telefone', mascararTelefone(evento.target.value))}
            />
            <MensagemErro id="cliente_telefone" mensagem={errors.cliente_telefone?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cliente_email">E-mail (opcional)</Label>
            <Input
              id="cliente_email"
              type="email"
              placeholder="cliente@email.com"
              aria-invalid={Boolean(errors.cliente_email)}
              aria-describedby={errors.cliente_email ? 'cliente_email-erro' : undefined}
              {...register('cliente_email')}
            />
            <MensagemErro id="cliente_email" mensagem={errors.cliente_email?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="data_agendamento">Data da visita</Label>
            <Input
              id="data_agendamento"
              type="date"
              aria-invalid={Boolean(errors.data_agendamento)}
              aria-describedby={errors.data_agendamento ? 'data_agendamento-erro' : undefined}
              {...register('data_agendamento')}
            />
            <MensagemErro id="data_agendamento" mensagem={errors.data_agendamento?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Situacao do contato</Label>
            <Select value={statusAtual} onValueChange={(valor) => setValue('status', valor as AgendamentoInput['status'])}>
              <SelectTrigger
                id="status"
                aria-invalid={Boolean(errors.status)}
                aria-describedby={errors.status ? 'status-erro' : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_AGENDAMENTO.map((status) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <MensagemErro id="status" mensagem={errors.status?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loja_id">Loja</Label>
            {lojaFixa ? (
              <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {lojas.find((loja) => loja.id === lojaAtual)?.nome ?? 'Sem loja atribuida'}
              </div>
            ) : (
              <Select value={lojaAtual} onValueChange={(valor) => setValue('loja_id', valor)}>
                <SelectTrigger
                id="loja_id"
                aria-invalid={Boolean(errors.loja_id)}
                aria-describedby={errors.loja_id ? 'loja_id-erro' : undefined}
              >
                  <SelectValue placeholder="Escolha a loja" />
                </SelectTrigger>
                <SelectContent>
                  {lojas.map((loja) => (
                    <SelectItem key={loja.id} value={loja.id}>
                      {loja.nome} · {loja.codigo_loja}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <MensagemErro id="loja_id" mensagem={errors.loja_id?.message} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="observacoes">Observacoes (opcional)</Label>
            <Textarea
              id="observacoes"
              aria-invalid={Boolean(errors.observacoes)}
              aria-describedby={errors.observacoes ? 'observacoes-erro' : undefined}
              maxLength={500}
              placeholder="Preferencia de horario, modelo procurado, etc."
              {...register('observacoes')}
            />
            <MensagemErro id="observacoes" mensagem={errors.observacoes?.message} />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {edicao ? 'Salvar alteracoes' : 'Registrar agendamento'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
