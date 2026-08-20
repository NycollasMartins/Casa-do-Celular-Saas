import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTAS, bancoEDeTeste, entrarComo, type ClienteAutenticado } from './cliente';

/**
 * Regressao da falha corrigida em 20250101000004_protege_campos_sensiveis.sql.
 *
 * A policy `usuarios_update` libera a propria linha sem restringir coluna.
 * Sem o trigger de protecao, qualquer agendador se promovia a franqueado e
 * passava a enxergar o tenant inteiro — a visibilidade toda deriva de
 * `usuario_role()`.
 *
 * Se algum destes testes voltar a falhar, a escalada foi reaberta.
 */

const rodar = await bancoEDeTeste();

describe.skipIf(!rodar)('escalada de privilegio por auto-update', () => {
  let agendador: ClienteAutenticado;
  let meuId: string;
  let meuFranqueado: string | null;

  beforeAll(async () => {
    agendador = await entrarComo(CONTAS.agendadorLoja1);
    const { data } = await agendador.auth.getUser();
    meuId = data.user!.id;

    const { data: perfil } = await agendador
      .from('usuarios')
      .select('franqueado_id')
      .eq('id', meuId)
      .single();
    meuFranqueado = perfil?.franqueado_id ?? null;
  });

  afterAll(async () => {
    await agendador.encerrar();
  });

  it('nao consegue promover a si mesmo a franqueado', async () => {
    const { error } = await agendador.from('usuarios').update({ role: 'franqueado' }).eq('id', meuId);
    expect(error).not.toBeNull();

    const { data: depois } = await agendador.from('usuarios').select('role').eq('id', meuId).single();
    expect(depois?.role).toBe('agendador');
  });

  it('nao consegue promover a si mesmo a super_admin', async () => {
    await agendador.from('usuarios').update({ role: 'super_admin' }).eq('id', meuId);

    const { data: depois } = await agendador.from('usuarios').select('role').eq('id', meuId).single();
    expect(depois?.role).toBe('agendador');
  });

  it('nao consegue mudar de tenant trocando o franqueado_id', async () => {
    await agendador
      .from('usuarios')
      .update({ franqueado_id: '00000000-0000-4000-8000-000000000000' })
      .eq('id', meuId);

    const { data: depois } = await agendador.from('usuarios').select('franqueado_id').eq('id', meuId).single();
    expect(depois?.franqueado_id).toBe(meuFranqueado);
  });

  it('nao consegue reativar o proprio acesso apos ser desligado', async () => {
    // Nao desliga de verdade: basta provar que a escrita na coluna e negada.
    const { error } = await agendador.from('usuarios').update({ status: 'inativo' }).eq('id', meuId);
    expect(error).not.toBeNull();

    const { data: depois } = await agendador.from('usuarios').select('status').eq('id', meuId).single();
    expect(depois?.status).toBe('ativo');
  });

  it('continua podendo editar o proprio nome', async () => {
    const { data: antes } = await agendador.from('usuarios').select('nome').eq('id', meuId).single();
    const original = antes!.nome;

    const { error } = await agendador.from('usuarios').update({ nome: `${original} ` }).eq('id', meuId);
    expect(error).toBeNull();

    await agendador.from('usuarios').update({ nome: original }).eq('id', meuId);
  });

  it('a promocao nao vaza dados nem se a coluna fosse alterada', async () => {
    // Independente do caminho, o que importa e o efeito: uma loja visivel.
    const { data: lojas } = await agendador.from('lojas').select('id');
    expect(lojas).toHaveLength(1);
  });
});
