import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Todas as lojas · Admin' };

interface LinhaLoja {
  id: string;
  nome: string;
  codigo_loja: string;
  cidade: string;
  estado: string;
  status: 'ativo' | 'inativo';
  franqueado: { nome: string } | null;
}

export default async function AdminLojasPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from('lojas')
    .select('id, nome, codigo_loja, cidade, estado, status, franqueado:franqueados!lojas_franqueado_id_fkey (nome)')
    .order('nome');

  const lojas = (data ?? []) as unknown as LinhaLoja[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Todas as lojas</h1>
        <p className="mt-1 text-sm text-slate-500">{lojas.length} lojas em toda a rede.</p>
      </div>

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Franqueado</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lojas.map((loja) => (
                <TableRow key={loja.id}>
                  <TableCell>
                    <div className="font-medium">{loja.nome}</div>
                    <div className="font-mono text-xs text-slate-400">{loja.codigo_loja}</div>
                  </TableCell>
                  <TableCell className="text-slate-600">{loja.franqueado?.nome ?? '-'}</TableCell>
                  <TableCell className="text-slate-600">
                    {loja.cidade} / {loja.estado}
                  </TableCell>
                  <TableCell>
                    <Badge variant={loja.status === 'ativo' ? 'success' : 'neutral'}>
                      {loja.status === 'ativo' ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
