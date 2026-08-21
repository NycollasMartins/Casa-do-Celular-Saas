'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { registrarVenda, atualizarVenda } from '@/app/actions/agendamentos';
import { formatarBrl, lerValorBrl } from '@/lib/dinheiro';
import type { Venda } from '@/lib/types/database';
import { hojeNaLoja } from '@/lib/semana';

interface Props {
  agendamentoId: string;
  /** Presente quando esta editando uma venda ja registrada. */
  venda?: Pick<Venda, 'id' | 'valor' | 'descricao' | 'data_venda'>;
  onSalvo?: () => void;
}

export function VendaForm({ agendamentoId, venda, onSalvo }: Props) {
  const router = useRouter();
  const [valor, setValor] = useState(
    venda ? String(venda.valor).replace('.', ',') : ''
  );
  const [descricao, setDescricao] = useState(venda?.descricao ?? '');
  const [dataVenda, setDataVenda] = useState(
    venda?.data_venda ?? hojeNaLoja()
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  // Interpretado a cada tecla para a previa mostrar o que sera gravado —
  // "1.234" em portugues e mil duzentos e trinta e quatro, nao 1,234.
  const valorNumerico = lerValorBrl(valor);

  function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (valorNumerico === null || valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.');
      return;
    }

    iniciar(async () => {
      const formData = new FormData();
      formData.append('valor', String(valorNumerico));
      formData.append('descricao', descricao);
      formData.append('data_venda', dataVenda);

      const resultado = venda
        ? await atualizarVenda(venda.id, formData)
        : await registrarVenda(agendamentoId, formData);

      if (!resultado.sucesso) {
        setErro(resultado.mensagem ?? 'Nao foi possivel salvar.');
        return;
      }

      setErro(null);
      toast.success(resultado.mensagem ?? 'Venda registrada.');
      onSalvo?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="valor-venda">Valor</Label>
          <Input
            id="valor-venda"
            inputMode="decimal"
            placeholder="1.234,56"
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
            autoFocus
          />
          <p className="text-xs text-slate-400">
            {valorNumerico !== null && valorNumerico > 0
              ? `Sera gravado como ${formatarBrl(valorNumerico)}`
              : 'Use virgula para os centavos.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="data-venda">Data da venda</Label>
          <Input
            id="data-venda"
            type="date"
            value={dataVenda}
            onChange={(evento) => setDataVenda(evento.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao-venda">O que foi vendido (opcional)</Label>
        <Textarea
          id="descricao-venda"
          rows={2}
          maxLength={300}
          placeholder="Aparelho, plano, acessorio..."
          value={descricao}
          onChange={(evento) => setDescricao(evento.target.value)}
        />
      </div>

      {erro ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={salvando}>
          {venda ? 'Salvar alteracoes' : 'Registrar venda'}
        </Button>
      </div>
    </form>
  );
}
