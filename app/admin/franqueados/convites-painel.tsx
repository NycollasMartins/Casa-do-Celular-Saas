'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LinhaVazia } from '@/components/ui/linha-vazia';
import { formatarDataIso } from '@/lib/utils';
import { apagarConvite, criarConvite } from '@/app/actions/convites';
import type { Convite } from '@/lib/types/database';

/**
 * Convites de rede.
 *
 * O link aparece UMA vez, aqui, e nao volta: o banco guarda so o hash. Por
 * isso ele nasce num dialogo que fica aberto ate alguem fecha-lo, e nao num
 * aviso que some — mesma decisao da senha de primeiro acesso, pelo mesmo
 * motivo pratico.
 */

type Situacao = { texto: string; variante: 'success' | 'neutral' | 'warning' };

function situacaoDo(convite: Convite, agora: number): Situacao {
  if (convite.franqueado_id) return { texto: 'Usado', variante: 'neutral' };
  // Reservado mas sem rede: alguem comecou o cadastro e nao terminou. Some
  // sozinho quando a action devolve o convite, entao so aparece numa janela
  // curta — mas se ficar, e sinal de que algo falhou no meio.
  if (convite.usado_em) return { texto: 'Em uso', variante: 'warning' };
  if (new Date(convite.expira_em).getTime() <= agora) return { texto: 'Expirado', variante: 'neutral' };
  return { texto: 'Valido', variante: 'success' };
}

export function ConvitesPainel({ convites }: { convites: Convite[] }) {
  const [abrindo, setAbrindo] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  // Calculado uma vez por render, e nao dentro do map: `Date.now()` por linha
  // faria linhas da mesma tabela responderem a instantes diferentes.
  const agora = Date.now();

  function gerar() {
    iniciar(async () => {
      const resultado = await criarConvite(observacao);
      if (!resultado.sucesso || !resultado.senhaProvisoria) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel gerar o convite.');
        return;
      }
      setAbrindo(false);
      setObservacao('');
      setLink(resultado.senhaProvisoria);
    });
  }

  function apagar(id: string) {
    iniciar(async () => {
      const resultado = await apagarConvite(id);
      toast[resultado.sucesso ? 'success' : 'error'](resultado.mensagem ?? '');
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link ?? '');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem area de transferencia o texto continua na tela, selecionavel.
      setCopiado(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Convites</h2>
          <p className="mt-1 text-sm text-slate-500">
            Quem abre o link cria a propria rede e entra sozinho. Sem link, ninguem se cadastra.
          </p>
        </div>

        <Dialog open={abrindo} onOpenChange={setAbrindo}>
          <Button onClick={() => setAbrindo(true)} variant="secondary">
            <Link2 className="h-4 w-4" aria-hidden />
            Gerar convite
          </Button>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Gerar convite</DialogTitle>
              <DialogDescription>
                O link vale por 30 dias e serve para um cadastro so.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="observacao">Para se achar depois (opcional)</Label>
              <Input
                id="observacao"
                value={observacao}
                onChange={(evento) => setObservacao(evento.target.value)}
                placeholder="Casa do Celular Goiania"
              />
              <p className="text-xs text-slate-400">
                So voce ve. Quem recebe o convite nao enxerga este texto.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={gerar} loading={pendente}>
                Gerar link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Observacao</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Situacao</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {convites.length === 0 ? (
                <LinhaVazia colunas={5}>
                  Nenhum convite gerado. Crie um para um cliente entrar sem depender de voce.
                </LinhaVazia>
              ) : (
                convites.map((convite) => {
                  const situacao = situacaoDo(convite, agora);
                  return (
                    <TableRow key={convite.id}>
                      <TableCell className="font-medium">
                        {convite.observacao ?? <span className="text-slate-400">sem anotacao</span>}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatarDataIso(convite.criado_em.slice(0, 10))}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatarDataIso(convite.expira_em.slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={situacao.variante}>{situacao.texto}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => apagar(convite.id)}
                          disabled={pendente}
                          aria-label={`Apagar convite ${convite.observacao ?? ''}`.trim()}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={link !== null} onOpenChange={(aberto) => !aberto && setLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convite gerado</DialogTitle>
            <DialogDescription>
              Copie agora e envie ao cliente. O link nao fica guardado e nao da para consultar
              depois — se perder, gere outro.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            {/* `break-all` para o link nao estourar a caixa, e `select-all`
                para um clique pegar tudo quando nao houver area de
                transferencia disponivel. */}
            <p className="select-all break-all font-mono text-sm text-ink">{link}</p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="secondary" onClick={copiar}>
              {copiado ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden /> Copiar
                </>
              )}
            </Button>
            <Button onClick={() => setLink(null)}>Ja copiei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
