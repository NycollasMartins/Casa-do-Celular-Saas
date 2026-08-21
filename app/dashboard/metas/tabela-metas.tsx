'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatarNumero, formatarPercentual } from '@/lib/utils';
import { formatarBrl } from '@/lib/dinheiro';
import {
  ROTULO_SITUACAO,
  calcularAtingimento,
  situacaoGeral,
  type SituacaoMeta,
} from '@/lib/metas';
import { MetaDialog } from './meta-dialog';
import type { MetaAgendador } from '@/lib/types/database';

interface Linha {
  agendadorId: string;
  nome: string;
  agendamentos: number;
  taxaConversao: number;
  vendas: number;
  receita: number;
}

interface Props {
  competencia: string;
  linhas: Linha[];
  metas: Record<string, MetaAgendador>;
}

const VARIANTE: Record<SituacaoMeta, 'success' | 'warning' | 'danger' | 'neutral'> = {
  no_alvo: 'success',
  atencao: 'warning',
  abaixo: 'danger',
  sem_meta: 'neutral',
};

export function TabelaMetas({ competencia, linhas, metas }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editando, setEditando] = useState<Linha | null>(null);

  function trocarCompetencia(valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('competencia', `${valor}-01`);
    router.push(`/dashboard/metas?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="competencia">Competencia</Label>
          <Input
            id="competencia"
            type="month"
            className="w-44"
            value={competencia.slice(0, 7)}
            onChange={(evento) => evento.target.value && trocarCompetencia(evento.target.value)}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agendador</TableHead>
            <TableHead>Agendamentos</TableHead>
            <TableHead>Conversao</TableHead>
            <TableHead>Vendas</TableHead>
            <TableHead>Faturamento</TableHead>
            <TableHead>Situacao</TableHead>
            <TableHead className="text-right">Meta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                Nenhum agendador com lotacao ativa. Cadastre a equipe em Equipe.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((linha) => {
              const meta = metas[linha.agendadorId];
              const itens = meta
                ? calcularAtingimento(meta, linha, competencia)
                : [];
              const situacao = situacaoGeral(itens);

              return (
                <TableRow key={linha.agendadorId}>
                  <TableCell className="font-medium">{linha.nome}</TableCell>

                  <TableCell className="tabular-nums">
                    {formatarNumero(linha.agendamentos)}
                    {meta?.meta_agendamentos ? (
                      <span className="text-slate-400"> / {formatarNumero(meta.meta_agendamentos)}</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="tabular-nums">
                    {formatarPercentual(linha.taxaConversao)}
                    {meta?.meta_taxa_conversao ? (
                      <span className="text-slate-400">
                        {' '}
                        / {formatarPercentual(Number(meta.meta_taxa_conversao))}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="tabular-nums">
                    {formatarNumero(linha.vendas)}
                    {meta?.meta_vendas ? (
                      <span className="text-slate-400"> / {formatarNumero(meta.meta_vendas)}</span>
                    ) : null}
                  </TableCell>

                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatarBrl(linha.receita)}
                    {meta?.meta_receita ? (
                      <span className="text-slate-400"> / {formatarBrl(Number(meta.meta_receita))}</span>
                    ) : null}
                  </TableCell>

                  <TableCell>
                    <Badge variant={VARIANTE[situacao]}>{ROTULO_SITUACAO[situacao]}</Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={meta ? `Editar meta de ${linha.nome}` : `Definir meta de ${linha.nome}`}
                        onClick={() => setEditando(linha)}
                      >
                        {meta ? (
                          <Pencil className="h-4 w-4" aria-hidden />
                        ) : (
                          <Plus className="h-4 w-4 text-slate-400" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {editando ? (
        <MetaDialog
          agendador={{ id: editando.agendadorId, nome: editando.nome }}
          competencia={competencia}
          meta={metas[editando.agendadorId]}
          aberto
          onFechar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}
