'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { criarParticipacao } from '@/app/actions/cadastros';

interface Props {
  socios: { id: string; nome: string; role: string }[];
  lojas: { id: string; nome: string }[];
}

export function NovaParticipacaoDialog({ socios, lojas }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [usuarioId, setUsuarioId] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [percentual, setPercentual] = useState('30');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [processando, iniciar] = useTransition();

  function aoSalvar() {
    iniciar(async () => {
      const socio = socios.find((item) => item.id === usuarioId);

      const formData = new FormData();
      formData.append('usuario_id', usuarioId);
      formData.append('loja_id', lojaId);
      formData.append('percentual_participacao', percentual);
      // O cargo acompanha o papel: quem e franqueado entra como franqueado.
      formData.append('cargo', socio?.role === 'franqueado' ? 'franqueado' : 'diretor');
      formData.append('data_inicio', dataInicio);

      const resultado = await criarParticipacao(formData);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel abrir a participacao.');
        return;
      }

      toast.success(resultado.mensagem ?? 'Participacao aberta.');
      setAberto(false);
      setUsuarioId('');
      setLojaId('');
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button disabled={socios.length === 0}>
          <Plus className="h-4 w-4" aria-hidden />
          Nova participacao
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova participacao</DialogTitle>
          <DialogDescription>
            Define quais lojas a pessoa enxerga. Diretor so acessa os dados das lojas em que tem
            participacao ativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="socio">Pessoa</Label>
            <Select value={usuarioId} onValueChange={setUsuarioId}>
              <SelectTrigger id="socio">
                <SelectValue placeholder="Escolha entre diretores e franqueados" />
              </SelectTrigger>
              <SelectContent>
                {socios.map((socio) => (
                  <SelectItem key={socio.id} value={socio.id}>
                    {socio.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loja-nova">Loja</Label>
            <Select value={lojaId} onValueChange={setLojaId}>
              <SelectTrigger id="loja-nova">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pct-novo">Participacao (%)</Label>
              <Input
                id="pct-novo"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={percentual}
                onChange={(evento) => setPercentual(evento.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inicio-novo">Inicio</Label>
              <Input
                id="inicio-novo"
                type="date"
                value={dataInicio}
                onChange={(evento) => setDataInicio(evento.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button onClick={aoSalvar} loading={processando} disabled={!usuarioId || !lojaId}>
            Abrir participacao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
