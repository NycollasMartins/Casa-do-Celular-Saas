import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FranqueadoDialog } from './franqueado-dialog';
import { ConvitesPainel } from './convites-painel';
import { createClient } from '@/lib/supabase/server';
import type { Convite, Franqueado } from '@/lib/types/database';
import { LinhaVazia } from '@/components/ui/linha-vazia';
import { lerPaginado } from '@/lib/supabase/queries';

export const metadata = { title: 'Franqueados · Admin' };

const VARIANTE = { ativo: 'success', pendente: 'warning', inativo: 'neutral' } as const;

export default async function FranqueadosPage() {
  const supabase = createClient();

  const [franqueados, convites] = await Promise.all([
    lerPaginado<Franqueado>(
      (de, ate) => supabase.from('franqueados').select('*').order('nome').range(de, ate),
      { oQue: 'os franqueados' }
    ),
    // A policy de `convites` exige super admin, e so ele alcanca esta rota.
    lerPaginado<Convite>(
      (de, ate) => supabase.from('convites').select('*').order('criado_em', { ascending: false }).range(de, ate),
      { oQue: 'os convites' }
    ),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Franqueados</h1>
          <p className="mt-1 text-sm text-slate-500">{franqueados.length} tenants na rede.</p>
        </div>
        <FranqueadoDialog />
      </div>

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razao social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {franqueados.length === 0 ? (
                <LinhaVazia colunas={5}>
                  Nenhum franqueado cadastrado. Crie o primeiro para a rede sair do zero.
                </LinhaVazia>
              ) : (
                franqueados.map((franqueado) => (
                  <TableRow key={franqueado.id}>
                    <TableCell className="font-medium">{franqueado.nome}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{franqueado.cnpj ?? '-'}</TableCell>
                    <TableCell className="text-slate-600">{franqueado.email_contato ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE[franqueado.status]}>{franqueado.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <FranqueadoDialog
                        franqueado={franqueado}
                        gatilho={
                          <Button variant="ghost" size="icon" aria-label={`Editar ${franqueado.nome}`}>
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

      <ConvitesPainel convites={convites} />
    </div>
  );
}
