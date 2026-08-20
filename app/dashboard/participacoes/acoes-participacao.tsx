'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CircleSlash } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { encerrarParticipacao, transferirParticipacao } from '@/app/actions/cadastros';

interface Props {
  id: string;
  pessoa: string;
  lojaAtual: string;
  lojaAtualId: string;
  percentual: number;
  lojas: { id: string; nome: string }[];
}

const hoje = () => new Date().toISOString().slice(0, 10);

export function AcoesParticipacao({ id, pessoa, lojaAtual, lojaAtualId, percentual, lojas }: Props) {
  const router = useRouter();
  const [encerrando, setEncerrando] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [dataFim, setDataFim] = useState(hoje());
  const [destino, setDestino] = useState('');
  const [novoPercentual, setNovoPercentual] = useState(String(percentual));
  const [processando, iniciar] = useTransition();

  const outrasLojas = lojas.filter((loja) => loja.id !== lojaAtualId);

  function aoEncerrar() {
    iniciar(async () => {
      const resultado = await encerrarParticipacao(id, dataFim);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel encerrar.');
        return;
      }
      toast.success(resultado.mensagem ?? 'Participacao encerrada.');
      setEncerrando(false);
      router.refresh();
    });
  }

  function aoTransferir() {
    iniciar(async () => {
      const formData = new FormData();
      formData.append('loja_id', destino);
      formData.append('percentual_participacao', novoPercentual);
      formData.append('data_inicio', dataFim);

      const resultado = await transferirParticipacao(id, formData);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel transferir.');
        return;
      }
      toast.success(resultado.mensagem ?? 'Participacao transferida.');
      setTransferindo(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Transferir participacao de ${pessoa}`}
        onClick={() => setTransferindo(true)}
        disabled={outrasLojas.length === 0}
        title={outrasLojas.length === 0 ? 'Nao ha outra loja para transferir' : undefined}
      >
        <ArrowRightLeft className="h-4 w-4" aria-hidden />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Encerrar participacao de ${pessoa}`}
        onClick={() => setEncerrando(true)}
      >
        <CircleSlash className="h-4 w-4 text-danger" aria-hidden />
      </Button>

      <Dialog open={encerrando} onOpenChange={setEncerrando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encerrar participacao</DialogTitle>
            <DialogDescription>
              {pessoa} deixa de responder pela {lojaAtual} e perde o acesso aos dados dela. O
              historico do periodo em que participou continua nos relatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`fim-${id}`}>Data de encerramento</Label>
            <Input
              id={`fim-${id}`}
              type="date"
              value={dataFim}
              onChange={(evento) => setDataFim(evento.target.value)}
            />
            <p className="text-xs text-slate-400">
              Nao pode ser anterior ao inicio da participacao.
            </p>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setEncerrando(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={aoEncerrar} loading={processando}>
              Encerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferindo} onOpenChange={setTransferindo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir participacao</DialogTitle>
            <DialogDescription>
              Encerra na {lojaAtual} e abre na loja escolhida, na mesma data. Os dois passos andam
              juntos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`destino-${id}`}>Loja de destino</Label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger id={`destino-${id}`}>
                  <SelectValue placeholder="Escolha a loja" />
                </SelectTrigger>
                <SelectContent>
                  {outrasLojas.map((loja) => (
                    <SelectItem key={loja.id} value={loja.id}>
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`pct-${id}`}>Participacao (%)</Label>
                <Input
                  id={`pct-${id}`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={novoPercentual}
                  onChange={(evento) => setNovoPercentual(evento.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`data-${id}`}>Data</Label>
                <Input
                  id={`data-${id}`}
                  type="date"
                  value={dataFim}
                  onChange={(evento) => setDataFim(evento.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setTransferindo(false)}>
              Cancelar
            </Button>
            <Button onClick={aoTransferir} loading={processando} disabled={!destino}>
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
