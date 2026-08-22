import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { buscarLojasDoUsuario, lerPaginado } from '@/lib/supabase/queries';
import { formatarDataIso, formatarPercentual } from '@/lib/utils';
import { AcoesParticipacao } from './acoes-participacao';
import { NovaParticipacaoDialog } from './nova-participacao-dialog';
import type { Usuario } from '@/lib/types/database';

export const metadata = { title: 'Societario · Casa do Celular' };

interface LinhaParticipacao {
  id: string;
  usuario_id: string;
  loja_id: string;
  percentual_participacao: number;
  cargo: 'franqueado' | 'diretor';
  data_inicio: string;
  data_fim: string | null;
}

export default async function ParticipacoesPage() {
  await exigirRole(['super_admin', 'franqueado']);
  const supabase = createClient();

  const [participacoes, pessoas, lojas] = await Promise.all([
    lerPaginado(
      (de, ate) =>
        supabase
          .from('participacoes_societarias')
          .select('id, usuario_id, loja_id, percentual_participacao, cargo, data_inicio, data_fim')
          .order('data_fim', { ascending: true, nullsFirst: true })
          .order('data_inicio', { ascending: false })
          .range(de, ate),
      { oQue: 'as participacoes' }
    ),
    lerPaginado(
      (de, ate) =>
        supabase
          .from('usuarios')
          .select('*')
          .in('role', ['franqueado', 'diretor'])
          .order('nome')
          .range(de, ate),
      { oQue: 'os gestores' }
    ),
    buscarLojasDoUsuario(),
  ]);

  const linhas = (participacoes ?? []) as LinhaParticipacao[];
  const socios = (pessoas ?? []) as Usuario[];

  const nomePorUsuario = new Map(socios.map((socio) => [socio.id, socio.nome]));
  const nomePorLoja = new Map(lojas.map((loja) => [loja.id, loja.nome]));

  const ativas = linhas.filter((linha) => !linha.data_fim);
  const encerradas = linhas.filter((linha) => linha.data_fim);

  // O total por loja passar de 100% nao e erro de banco — nenhuma constraint
  // cobre a soma —, mas quase sempre indica cadastro equivocado. Marcar na
  // tela e mais barato que descobrir isso num acerto de contas.
  const somaPorLoja = new Map<string, number>();
  for (const linha of ativas) {
    somaPorLoja.set(linha.loja_id, (somaPorLoja.get(linha.loja_id) ?? 0) + Number(linha.percentual_participacao));
  }
  const lojasAcimaDeCem = [...somaPorLoja.entries()].filter(([, soma]) => soma > 100);

  const opcoesSocios = socios.map((socio) => ({ id: socio.id, nome: socio.nome, role: socio.role }));
  const opcoesLojas = lojas.map((loja) => ({ id: loja.id, nome: loja.nome }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Societario</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ativas.length} participacao(oes) ativa(s). Define quais lojas cada diretor enxerga.
          </p>
        </div>
        <NovaParticipacaoDialog socios={opcoesSocios} lojas={opcoesLojas} />
      </div>

      {lojasAcimaDeCem.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-medium">Atencao:</strong>{' '}
          {lojasAcimaDeCem.length === 1 ? 'uma loja soma' : `${lojasAcimaDeCem.length} lojas somam`} mais
          de 100% de participacao ativa:{' '}
          {lojasAcimaDeCem
            .map(([lojaId, soma]) => `${nomePorLoja.get(lojaId) ?? 'Loja'} (${formatarPercentual(soma)})`)
            .join(', ')}
          .
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Participacoes ativas</CardTitle>
          <CardDescription>Sem data de encerramento</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Participacao</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ativas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Nenhuma participacao ativa.
                  </TableCell>
                </TableRow>
              ) : (
                ativas.map((linha) => (
                  <TableRow key={linha.id}>
                    <TableCell className="font-medium">
                      {nomePorUsuario.get(linha.usuario_id) ?? 'Usuario removido'}
                    </TableCell>
                    <TableCell>{nomePorLoja.get(linha.loja_id) ?? 'Loja fora do seu acesso'}</TableCell>
                    <TableCell>
                      <Badge variant={linha.cargo === 'franqueado' ? 'default' : 'warning'}>
                        {linha.cargo === 'franqueado' ? 'Franqueado' : 'Diretor'}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatarPercentual(Number(linha.percentual_participacao))}
                    </TableCell>
                    <TableCell className="text-slate-600">{formatarDataIso(linha.data_inicio)}</TableCell>
                    <TableCell>
                      <AcoesParticipacao
                        id={linha.id}
                        pessoa={nomePorUsuario.get(linha.usuario_id) ?? 'a pessoa'}
                        lojaAtual={nomePorLoja.get(linha.loja_id) ?? 'loja atual'}
                        lojaAtualId={linha.loja_id}
                        percentual={Number(linha.percentual_participacao)}
                        lojas={opcoesLojas}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {encerradas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Historico</CardTitle>
            <CardDescription>
              Participacoes encerradas. As linhas ficam para os relatorios do periodo continuarem
              corretos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Participacao</TableHead>
                  <TableHead>Periodo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {encerradas.map((linha) => (
                  <TableRow key={linha.id} className="opacity-70">
                    <TableCell className="font-medium">
                      {nomePorUsuario.get(linha.usuario_id) ?? 'Usuario removido'}
                    </TableCell>
                    <TableCell>{nomePorLoja.get(linha.loja_id) ?? 'Loja fora do seu acesso'}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatarPercentual(Number(linha.percentual_participacao))}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatarDataIso(linha.data_inicio)} ate {formatarDataIso(linha.data_fim!)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
