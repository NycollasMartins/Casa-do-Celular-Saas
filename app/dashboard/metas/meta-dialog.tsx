'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { salvarMeta, removerMeta } from '@/app/actions/cadastros';
import { lerValorBrl } from '@/lib/dinheiro';
import type { MetaAgendador } from '@/lib/types/database';

interface Props {
  agendador: { id: string; nome: string };
  competencia: string;
  meta?: MetaAgendador;
  aberto: boolean;
  onFechar: () => void;
}

/** Campo vazio significa "sem alvo", nao zero. */
function paraCampo(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

export function MetaDialog({ agendador, competencia, meta, aberto, onFechar }: Props) {
  const router = useRouter();
  const [agendamentos, setAgendamentos] = useState(paraCampo(meta?.meta_agendamentos));
  const [conversao, setConversao] = useState(paraCampo(meta?.meta_taxa_conversao));
  const [vendas, setVendas] = useState(paraCampo(meta?.meta_vendas));
  const [receita, setReceita] = useState(paraCampo(meta?.meta_receita));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [removendo, iniciarRemocao] = useTransition();

  function aoSalvar() {
    const formData = new FormData();
    formData.append('usuario_id', agendador.id);
    formData.append('competencia', competencia);
    formData.append('meta_agendamentos', agendamentos.trim());
    formData.append('meta_taxa_conversao', conversao.replace(',', '.').trim());
    formData.append('meta_vendas', vendas.trim());
    // Receita aceita o formato brasileiro, como no registro de venda.
    const valorReceita = lerValorBrl(receita);
    formData.append('meta_receita', valorReceita === null ? '' : String(valorReceita));

    iniciar(async () => {
      const resultado = await salvarMeta(formData);
      if (!resultado.sucesso) {
        setErro(resultado.mensagem ?? 'Nao foi possivel salvar.');
        return;
      }
      setErro(null);
      toast.success(resultado.mensagem ?? 'Meta salva.');
      onFechar();
      router.refresh();
    });
  }

  function aoRemover() {
    if (!meta) return;
    iniciarRemocao(async () => {
      const resultado = await removerMeta(meta.id);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel remover.');
        return;
      }
      toast.success(resultado.mensagem ?? 'Meta removida.');
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-brand" aria-hidden />
              Meta de {agendador.nome}
            </span>
          </DialogTitle>
          <DialogDescription>
            Deixe em branco o que nao quiser acompanhar. Ao menos um alvo precisa ser definido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-agendamentos">Agendamentos no mes</Label>
            <Input
              id="meta-agendamentos"
              inputMode="numeric"
              placeholder="60"
              value={agendamentos}
              onChange={(evento) => setAgendamentos(evento.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-conversao">Taxa de conversao (%)</Label>
            <Input
              id="meta-conversao"
              inputMode="decimal"
              placeholder="50"
              value={conversao}
              onChange={(evento) => setConversao(evento.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-vendas">Vendas no mes</Label>
            <Input
              id="meta-vendas"
              inputMode="numeric"
              placeholder="12"
              value={vendas}
              onChange={(evento) => setVendas(evento.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-receita">Faturamento (R$)</Label>
            <Input
              id="meta-receita"
              inputMode="decimal"
              placeholder="30.000,00"
              value={receita}
              onChange={(evento) => setReceita(evento.target.value)}
            />
          </div>
        </div>

        {erro ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        ) : null}

        <DialogFooter>
          {meta ? (
            <Button variant="ghost" onClick={aoRemover} loading={removendo} className="mr-auto text-danger">
              Remover meta
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={aoSalvar} loading={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
