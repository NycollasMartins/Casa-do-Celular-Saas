'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff, Search } from 'lucide-react';
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
import { anonimizarPorCpf, contarRegistrosDoCpf } from '@/app/actions/agendamentos';
import { mascararCpf } from '@/lib/utils';

interface Resultado {
  total: number;
  anonimizados: number;
}

export function BuscaTitular() {
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [buscando, iniciarBusca] = useTransition();
  const [anonimizando, iniciarAnonimizacao] = useTransition();

  function aoBuscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    iniciarBusca(async () => {
      const retorno = await contarRegistrosDoCpf(cpf);
      if (retorno.erro) {
        toast.error(retorno.erro);
        setResultado(null);
        return;
      }
      setResultado({ total: retorno.total, anonimizados: retorno.anonimizados });
    });
  }

  function aoAnonimizar() {
    iniciarAnonimizacao(async () => {
      const retorno = await anonimizarPorCpf(cpf);
      if (!retorno.sucesso) {
        toast.error(retorno.mensagem ?? 'Nao foi possivel anonimizar.');
        return;
      }

      toast.success(retorno.mensagem ?? 'Registros anonimizados.', { duration: 10000 });
      setConfirmando(false);
      setResultado(null);
      setCpf('');
      router.refresh();
    });
  }

  const pendentes = resultado ? resultado.total - resultado.anonimizados : 0;

  return (
    <div className="space-y-4">
      <form onSubmit={aoBuscar} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="cpf-titular">CPF do titular</Label>
          <Input
            id="cpf-titular"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(evento) => setCpf(mascararCpf(evento.target.value))}
          />
        </div>
        <Button type="submit" variant="secondary" loading={buscando} disabled={cpf.length < 14}>
          <Search className="h-4 w-4" aria-hidden />
          Localizar
        </Button>
      </form>

      {resultado ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          {resultado.total === 0 ? (
            <p className="text-slate-600">
              Nenhum agendamento encontrado para este CPF no seu escopo de acesso.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-700">
                <strong className="font-medium">{resultado.total}</strong> agendamento(s) encontrado(s).{' '}
                {resultado.anonimizados > 0 ? (
                  <>
                    <strong className="font-medium">{resultado.anonimizados}</strong> ja
                    anonimizado(s), <strong className="font-medium">{pendentes}</strong> com dados
                    pessoais.
                  </>
                ) : (
                  'Todos ainda com dados pessoais.'
                )}
              </p>

              {pendentes > 0 ? (
                <Button variant="danger" size="sm" onClick={() => setConfirmando(true)}>
                  <ShieldOff className="h-4 w-4" aria-hidden />
                  Anonimizar {pendentes} registro(s)
                </Button>
              ) : (
                <p className="text-slate-500">
                  Nada a fazer: o pedido deste titular ja foi atendido.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anonimizar dados deste titular?</DialogTitle>
            <DialogDescription>
              Nome, CPF, telefone, e-mail e observacoes serao substituidos por marcadores fixos em{' '}
              {pendentes} registro(s). Loja, agendador, data e status permanecem, para os relatorios
              do periodo continuarem corretos.
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            A acao e irreversivel. Nao ha como recuperar os dados depois.
          </p>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={aoAnonimizar} loading={anonimizando}>
              Anonimizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
