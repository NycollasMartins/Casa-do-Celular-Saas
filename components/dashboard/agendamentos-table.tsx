'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  BellOff,
  Download,
  Pencil,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusFilter } from './status-filter';
import { deletarAgendamento } from '@/app/actions/agendamentos';
import { STATUS_LABEL, cn, formatarDataIso } from '@/lib/utils';
import { hojeNaLoja } from '@/lib/semana';
import type { AgendamentoComRelacoes, AgendamentoStatus, UserRole, Venda } from '@/lib/types/database';
import { VendaForm } from '@/components/forms/venda-form';
import { formatarBrl } from '@/lib/dinheiro';

const ITENS_POR_PAGINA = 50;
const TODOS = 'todos';

type ColunaOrdenavel = 'cliente_nome' | 'data_agendamento' | 'status' | 'agendador';

const VARIANTE_BADGE: Record<AgendamentoStatus, 'default' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  contatado: 'default',
  agendado: 'warning',
  compareceu: 'success',
  nao_compareceu: 'danger',
  nao_agendado: 'neutral',
};

interface Props {
  agendamentos: AgendamentoComRelacoes[];
  role: UserRole;
  lojas: { id: string; nome: string }[];
  agendadores: { id: string; nome: string }[];
  /** Vem do clique nos cards de metrica. */
  statusInicial?: AgendamentoStatus[];
  /** Vendas ja registradas, por agendamento. Vazio quando ninguem lancou. */
  vendas?: Record<string, Pick<Venda, 'id' | 'valor' | 'descricao' | 'data_venda'>>;
  /** Lembrete de vespera por agendamento, quando a rotina ja passou por ele. */
  lembretes?: Record<string, { status: 'enviada' | 'falhou'; canal: string; detalhe: string | null }>;
}

export function AgendamentosTable({
  agendamentos,
  role,
  lojas,
  agendadores,
  statusInicial = [],
  vendas = {},
  lembretes = {},
}: Props) {
  const [busca, setBusca] = useState('');
  const [lojaId, setLojaId] = useState<string>(TODOS);
  const [agendadorId, setAgendadorId] = useState<string>(TODOS);
  const [status, setStatus] = useState<AgendamentoStatus[]>(statusInicial);
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenavel; direcao: 'asc' | 'desc' }>({
    coluna: 'data_agendamento',
    direcao: 'desc',
  });
  const [pagina, setPagina] = useState(1);
  const [paraExcluir, setParaExcluir] = useState<AgendamentoComRelacoes | null>(null);
  const [vendaDe, setVendaDe] = useState<AgendamentoComRelacoes | null>(null);
  const [excluindo, iniciarExclusao] = useTransition();

  const podeExcluir = role !== 'agendador';
  const mostrarColunaLoja = role !== 'agendador';

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const lista = agendamentos.filter((item) => {
      if (lojaId !== TODOS && item.loja_id !== lojaId) return false;
      if (agendadorId !== TODOS && item.agendador_id !== agendadorId) return false;
      if (status.length > 0 && !status.includes(item.status)) return false;
      if (!termo) return true;
      return (
        item.cliente_nome.toLowerCase().includes(termo) ||
        item.cliente_telefone.includes(termo) ||
        item.cliente_cpf.includes(termo)
      );
    });

    const fator = ordenacao.direcao === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      const valorA =
        ordenacao.coluna === 'agendador' ? (a.agendador?.nome ?? '') : String(a[ordenacao.coluna] ?? '');
      const valorB =
        ordenacao.coluna === 'agendador' ? (b.agendador?.nome ?? '') : String(b[ordenacao.coluna] ?? '');
      return valorA.localeCompare(valorB, 'pt-BR') * fator;
    });
  }, [agendamentos, busca, lojaId, agendadorId, status, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA);

  function alternarOrdenacao(coluna: ColunaOrdenavel) {
    setOrdenacao((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: 'asc' }
    );
  }

  function exportarCsv() {
    const cabecalho = ['Cliente', 'CPF', 'Telefone', 'Loja', 'Data', 'Status', 'Agendador', 'Observacoes'];
    const linhas = filtrados.map((item) => [
      item.cliente_nome,
      item.cliente_cpf,
      item.cliente_telefone,
      item.loja?.nome ?? '',
      formatarDataIso(item.data_agendamento),
      STATUS_LABEL[item.status],
      item.agendador?.nome ?? '',
      (item.observacoes ?? '').replace(/[\r\n]+/g, ' '),
    ]);

    // Aspas duplicadas evitam quebra quando o texto contem ';' ou '"'.
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Fonte unica tambem aqui. O nome do arquivo e cosmetico, mas deixar a
    // excecao convida a proxima: quem copiar esta linha copia o bug.
    link.download = `agendamentos-${hojeNaLoja()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtrados.length} agendamentos exportados.`);
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    const alvo = paraExcluir;

    iniciarExclusao(async () => {
      const resultado = await deletarAgendamento(alvo.id);
      if (resultado.sucesso) toast.success(resultado.mensagem ?? 'Agendamento excluido.');
      else toast.error(resultado.mensagem ?? 'Nao foi possivel excluir.');
      setParaExcluir(null);
    });
  }

  function IconeOrdenacao({ coluna }: { coluna: ColunaOrdenavel }) {
    if (ordenacao.coluna !== coluna) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" aria-hidden />;
    return ordenacao.direcao === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-brand" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-brand" aria-hidden />
    );
  }

  return (
    <div className="rounded-lg border border-slate-200/70 bg-card shadow-card">
      {/* Filtros */}
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value);
                setPagina(1);
              }}
              placeholder="Buscar por nome, telefone ou CPF"
              className="pl-9"
              aria-label="Buscar agendamentos"
            />
          </div>

          {mostrarColunaLoja ? (
            <Select
              value={lojaId}
              onValueChange={(valor) => {
                setLojaId(valor);
                setPagina(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por loja">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as lojas</SelectItem>
                {lojas.map((loja) => (
                  <SelectItem key={loja.id} value={loja.id}>
                    {loja.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={agendadorId}
            onValueChange={(valor) => {
              setAgendadorId(valor);
              setPagina(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por agendador">
              <SelectValue placeholder="Agendador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os agendadores</SelectItem>
              {agendadores.map((agendador) => (
                <SelectItem key={agendador.id} value={agendador.id}>
                  {agendador.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="secondary" onClick={exportarCsv} disabled={filtrados.length === 0}>
            <Download className="h-4 w-4" aria-hidden />
            Exportar CSV
          </Button>
        </div>

        <StatusFilter
          selecionados={status}
          onChange={(novos) => {
            setStatus(novos);
            setPagina(1);
          }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button
                type="button"
                onClick={() => alternarOrdenacao('cliente_nome')}
                className="inline-flex items-center gap-1 uppercase"
              >
                Cliente <IconeOrdenacao coluna="cliente_nome" />
              </button>
            </TableHead>
            <TableHead>Telefone</TableHead>
            {mostrarColunaLoja ? <TableHead>Loja</TableHead> : null}
            <TableHead>
              <button
                type="button"
                onClick={() => alternarOrdenacao('data_agendamento')}
                className="inline-flex items-center gap-1 uppercase"
              >
                Data <IconeOrdenacao coluna="data_agendamento" />
              </button>
            </TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() => alternarOrdenacao('status')}
                className="inline-flex items-center gap-1 uppercase"
              >
                Status <IconeOrdenacao coluna="status" />
              </button>
            </TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() => alternarOrdenacao('agendador')}
                className="inline-flex items-center gap-1 uppercase"
              >
                Agendador <IconeOrdenacao coluna="agendador" />
              </button>
            </TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {visiveis.length === 0 ? (
            <TableRow>
              <TableCell colSpan={mostrarColunaLoja ? 7 : 6} className="py-12 text-center text-sm text-slate-500">
                Nenhum agendamento com esses filtros. Ajuste o periodo ou registre um novo contato.
              </TableCell>
            </TableRow>
          ) : (
            visiveis.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.cliente_nome}</div>
                  <div className="text-xs text-slate-400">{item.cliente_cpf}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{item.cliente_telefone}</TableCell>
                {mostrarColunaLoja ? (
                  <TableCell className="whitespace-nowrap text-slate-600">{item.loja?.nome ?? '-'}</TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    {formatarDataIso(item.data_agendamento)}
                    {/* Sem o indicador, a unica forma de saber se o lembrete
                        saiu era ler a saida do script no terminal. */}
                    {lembretes[item.id] ? (
                      lembretes[item.id].status === 'enviada' ? (
                        <BellRing
                          className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                          aria-label={`Lembrete enviado por ${lembretes[item.id].canal}`}
                        />
                      ) : (
                        <BellOff
                          className="h-3.5 w-3.5 shrink-0 text-danger"
                          aria-label={`Lembrete falhou: ${lembretes[item.id].detalhe ?? 'motivo nao registrado'}`}
                        />
                      )
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE_BADGE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-slate-600">{item.agendador?.nome ?? '-'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {/* Venda so existe onde houve comparecimento — o mesmo
                        que o trigger do banco exige. */}
                    {item.status === 'compareceu' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          vendas[item.id]
                            ? `Editar venda de ${item.cliente_nome}`
                            : `Registrar venda de ${item.cliente_nome}`
                        }
                        title={vendas[item.id] ? formatarBrl(vendas[item.id].valor) : 'Registrar venda'}
                        onClick={() => setVendaDe(item)}
                      >
                        <Wallet
                          className={cn('h-4 w-4', vendas[item.id] ? 'text-teal-600' : 'text-slate-400')}
                          aria-hidden
                        />
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost" size="icon" aria-label={`Editar ${item.cliente_nome}`}>
                      <Link href={`/dashboard/agendamentos/${item.id}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Link>
                    </Button>
                    {podeExcluir ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ${item.cliente_nome}`}
                        onClick={() => setParaExcluir(item)}
                        className="text-slate-400 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Paginacao */}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 p-4 sm:flex-row">
        <p className="text-sm text-slate-500">
          {filtrados.length === 0
            ? 'Nenhum resultado'
            : `Mostrando ${(paginaAtual - 1) * ITENS_POR_PAGINA + 1}-${Math.min(
                paginaAtual * ITENS_POR_PAGINA,
                filtrados.length
              )} de ${filtrados.length}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={paginaAtual === 1}
          >
            Anterior
          </Button>
          <span className={cn('text-sm tabular-nums text-slate-500')}>
            {paginaAtual} / {totalPaginas}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaAtual === totalPaginas}
          >
            Proxima
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(paraExcluir)} onOpenChange={(aberto) => !aberto && setParaExcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir agendamento</DialogTitle>
            <DialogDescription>
              O registro de {paraExcluir?.cliente_nome} sai do historico e das metricas. Nao da para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setParaExcluir(null)}>
              Manter
            </Button>
            <Button variant="danger" loading={excluindo} onClick={confirmarExclusao}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(vendaDe)} onOpenChange={(aberto) => !aberto && setVendaDe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {vendaDe && vendas[vendaDe.id] ? 'Editar venda' : 'Registrar venda'}
            </DialogTitle>
            <DialogDescription>
              Atendimento de {vendaDe?.cliente_nome} na {vendaDe?.loja?.nome ?? 'loja'}.
            </DialogDescription>
          </DialogHeader>
          {vendaDe ? (
            <VendaForm
              agendamentoId={vendaDe.id}
              venda={vendas[vendaDe.id]}
              onSalvo={() => setVendaDe(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AgendamentosTableSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200/70 bg-card p-4 shadow-card">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
