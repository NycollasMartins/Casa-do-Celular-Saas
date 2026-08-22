import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LojaDialog } from './nova-loja-dialog';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Loja } from '@/lib/types/database';
import { lerPaginado } from '@/lib/supabase/queries';

export const metadata = { title: 'Lojas · Casa do Celular' };

export default async function LojasPage() {
  await exigirRole(['super_admin', 'franqueado']);
  const supabase = createClient();

  const lojas = await lerPaginado<Loja>(
    (de, ate) => supabase.from('lojas').select('*').order('codigo_loja').range(de, ate),
    { oQue: 'as lojas' }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Lojas</h1>
          <p className="mt-1 text-sm text-slate-500">{lojas.length} lojas cadastradas.</p>
        </div>
        <LojaDialog />
      </div>

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Gerente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lojas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-500">
                    Nenhuma loja ainda. Crie a primeira para comecar a medir.
                  </TableCell>
                </TableRow>
              ) : (
                lojas.map((loja) => (
                  <TableRow key={loja.id}>
                    <TableCell className="font-mono text-xs text-slate-500">{loja.codigo_loja}</TableCell>
                    <TableCell className="font-medium">{loja.nome}</TableCell>
                    <TableCell className="text-slate-600">
                      {loja.cidade} / {loja.estado}
                    </TableCell>
                    <TableCell className="text-slate-600">{loja.gerente_nome ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={loja.status === 'ativo' ? 'success' : 'neutral'}>
                        {loja.status === 'ativo' ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <LojaDialog
                        loja={loja}
                        gatilho={
                          <Button variant="ghost" size="icon" aria-label={`Editar ${loja.nome}`}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
