import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioDialog } from './novo-usuario-dialog';
import { AcoesUsuario } from './acoes-usuario';
import { exigirRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { buscarLojasDoUsuario } from '@/lib/supabase/queries';
import { ROLE_LABEL } from '@/lib/utils';
import type { AgendadorLoja, ParticipacaoSocietaria, Usuario } from '@/lib/types/database';
import { LinhaVazia } from '@/components/ui/linha-vazia';

export const metadata = { title: 'Equipe · Casa do Celular' };

const VARIANTE: Record<string, 'default' | 'warning' | 'neutral'> = {
  super_admin: 'default',
  franqueado: 'default',
  diretor: 'warning',
  agendador: 'neutral',
};

export default async function UsuariosPage() {
  const gestor = await exigirRole(['super_admin', 'franqueado']);
  const supabase = createClient();

  // Os vinculos vigentes alimentam o formulario de edicao: sem eles o select
  // de loja abriria sempre na primeira da lista, sugerindo uma troca que o
  // gestor nao pediu.
  const [{ data }, lojas, { data: vinculos }, { data: participacoes }] = await Promise.all([
    supabase.from('usuarios').select('*').order('status').order('role').order('nome'),
    buscarLojasDoUsuario(),
    supabase.from('agendadores_lojas').select('usuario_id, loja_id').is('data_fim', null),
    supabase.from('participacoes_societarias').select('usuario_id, loja_id').is('data_fim', null),
  ]);

  const usuarios = (data ?? []) as Usuario[];

  const lojaPorUsuario = new Map<string, string>();
  for (const item of [
    ...((vinculos ?? []) as Pick<AgendadorLoja, 'usuario_id' | 'loja_id'>[]),
    ...((participacoes ?? []) as Pick<ParticipacaoSocietaria, 'usuario_id' | 'loja_id'>[]),
  ]) {
    if (!lojaPorUsuario.has(item.usuario_id)) lojaPorUsuario.set(item.usuario_id, item.loja_id);
  }

  const ativos = usuarios.filter((usuario) => usuario.status === 'ativo').length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Equipe</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ativos} com acesso
            {usuarios.length > ativos ? `, ${usuarios.length - ativos} encerrado(s)` : ''}.
          </p>
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
                <TableHead>Situacao</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <LinhaVazia colunas={5}>
                  Nenhuma pessoa na equipe ainda. Cadastre o primeiro agendador para comecar a medir.
                </LinhaVazia>
              ) : (
                usuarios.map((usuario) => (
                  <TableRow key={usuario.id} className={usuario.status === 'inativo' ? 'opacity-60' : undefined}>
                    <TableCell className="font-medium">{usuario.nome}</TableCell>
                    <TableCell className="text-slate-600">{usuario.email}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE[usuario.role] ?? 'neutral'}>{ROLE_LABEL[usuario.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      {usuario.status === 'inativo' ? (
                        <Badge variant="danger">Encerrado</Badge>
                      ) : (
                        <Badge variant="success">Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AcoesUsuario
                        usuario={usuario}
                        lojas={lojas}
                        lojaAtualId={lojaPorUsuario.get(usuario.id)}
                        ehVoce={usuario.id === gestor.id}
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
