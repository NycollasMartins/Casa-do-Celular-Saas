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
import { agruparVinculosPorUsuario, descreverVinculosDuplicados } from '@/lib/vinculos';

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

  // Um vinculo por pessoa e a regra. Mais de um acontece quando
  // `atualizarUsuario` abre o novo e falha ao encerrar o antigo — ela abre
  // antes de encerrar de proposito, porque ficar com dois vinculos e menos
  // ruim que ficar sem nenhum.
  //
  // So que o efeito NAO e cosmetico: a pessoa passa a enxergar duas lojas. E
  // ate aqui a tela guardava so o primeiro vinculo e descartava o resto
  // calado — `atualizarUsuario` afirma que o estado fica "visivel na tela", e
  // nao ficava.
  //
  // Lotacao e participacao aparecem separadas porque o conserto e diferente:
  // para lotacao, editar e salvar resolve (planejarVinculos encerra as
  // paralelas); para participacao, planejarVinculos RECUSA de proposito, por
  // nao dar para adivinhar qual das sociedades o gestor quis mover.
  const lotacoes = agruparVinculosPorUsuario(
    (vinculos ?? []) as Pick<AgendadorLoja, 'usuario_id' | 'loja_id'>[]
  );
  const sociedades = agruparVinculosPorUsuario(
    (participacoes ?? []) as Pick<ParticipacaoSocietaria, 'usuario_id' | 'loja_id'>[]
  );

  const lojaPorUsuario = new Map<string, string>();
  for (const [usuarioId, lojasDoUsuario] of [...lotacoes, ...sociedades]) {
    if (!lojaPorUsuario.has(usuarioId)) lojaPorUsuario.set(usuarioId, lojasDoUsuario[0]);
  }

  const nomePorLoja = new Map(lojas.map((loja) => [loja.id, loja.nome]));
  const nomeDaLoja = (lojaId: string) => nomePorLoja.get(lojaId) ?? 'Loja';

  const lotacaoDuplicada = descreverVinculosDuplicados(usuarios, lotacoes, nomeDaLoja);
  const sociedadeDuplicada = descreverVinculosDuplicados(usuarios, sociedades, nomeDaLoja);

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

      {lotacaoDuplicada.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-medium">Atencao:</strong> lotacao aberta em mais de uma loja ao
          mesmo tempo — quem esta assim enxerga os dados de todas elas:{' '}
          {lotacaoDuplicada.join('; ')}. Abrir a edicao da pessoa e salvar encerra as paralelas e
          mantem so a loja escolhida.
        </div>
      ) : null}

      {sociedadeDuplicada.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-medium">Atencao:</strong> participacao societaria ativa em mais de
          uma loja: {sociedadeDuplicada.join('; ')}. Isso pode ser legitimo. Se nao for, resolva em{' '}
          <strong className="font-medium">Societario</strong> — a edicao aqui recusa mexer nisso, por
          nao ter como adivinhar qual sociedade encerrar.
        </div>
      ) : null}

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
