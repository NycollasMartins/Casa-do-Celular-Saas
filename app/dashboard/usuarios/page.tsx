import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioDialog } from './novo-usuario-dialog';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { buscarLojasDoUsuario } from '@/lib/supabase/queries';
import { ROLE_LABEL } from '@/lib/utils';
import type { Usuario } from '@/lib/types/database';

export const metadata = { title: 'Equipe · Casa do Celular' };

const VARIANTE: Record<string, 'default' | 'warning' | 'neutral'> = {
  super_admin: 'default',
  franqueado: 'default',
  diretor: 'warning',
  agendador: 'neutral',
};

export default async function UsuariosPage() {
  await exigirRole(['super_admin', 'franqueado']);
  const supabase = createClient();

  const [{ data }, lojas] = await Promise.all([
    supabase.from('usuarios').select('*').order('role').order('nome'),
    buscarLojasDoUsuario(),
  ]);
  const usuarios = (data ?? []) as Usuario[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Equipe</h1>
          <p className="mt-1 text-sm text-slate-500">{usuarios.length} usuarios com acesso.</p>
        </div>
        <UsuarioDialog lojas={lojas} />
      </div>

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((usuario) => (
                <TableRow key={usuario.id}>
                  <TableCell className="font-medium">{usuario.nome}</TableCell>
                  <TableCell className="text-slate-600">{usuario.email}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE[usuario.role] ?? 'neutral'}>{ROLE_LABEL[usuario.role]}</Badge>
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
