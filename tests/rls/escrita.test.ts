import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTAS, bancoEDeTeste, entrarComo, numeroDaLoja, type ClienteAutenticado } from './cliente';

/**
 * Testes de ESCRITA. Quase tudo aqui e uma tentativa que deve ser NEGADA —
 * essas nao deixam rastro no banco. As poucas que devem passar criam
 * registros com nome marcado e sao removidas no afterAll.
 *
 * As policies exercitadas estao em 20250101000001_rls.sql:
 *   agendamentos_insert  agendador so cria em nome proprio
 *   agendamentos_update  idem para edicao
 *   agendamentos_delete  agendador nao apaga historico
 */

const MARCA = '__teste_rls__';
const rodar = await bancoEDeTeste();

describe.skipIf(!rodar)('policies de escrita em agendamentos', () => {
  let franqueado: ClienteAutenticado;
  let agendador: ClienteAutenticado;
  let lojaDoAgendador: string;
  let lojaAlheia: string;
  let idDoAgendador: string;
  const criados: string[] = [];

  beforeAll(async () => {
    franqueado = await entrarComo(CONTAS.franqueado);
    agendador = await entrarComo(CONTAS.agendadorLoja1);

    const { data: sessao } = await agendador.auth.getUser();
    idDoAgendador = sessao.user!.id;

    const { data: propria } = await agendador.from('lojas').select('id');
    lojaDoAgendador = propria![0].id;

    const { data: todas } = await franqueado.from('lojas').select('id, nome');
    lojaAlheia = (todas ?? []).find((loja) => numeroDaLoja(loja.nome) === 9)!.id;
  });

  afterAll(async () => {
    // Limpeza pelo franqueado, que tem permissao de delete em todas as lojas.
    if (criados.length > 0) {
      await franqueado.from('agendamentos').delete().in('id', criados);
    }
    await Promise.all([franqueado.encerrar(), agendador.encerrar()]);
  });

  function novoAgendamento(lojaId: string, agendadorId: string) {
    return {
      loja_id: lojaId,
      agendador_id: agendadorId,
      cliente_nome: `${MARCA} Cliente`,
      cliente_cpf: '529.982.247-25',
      cliente_telefone: '(61) 99999-0000',
      data_agendamento: new Date().toISOString().slice(0, 10),
      status: 'contatado',
    };
  }

  // espelho: agendador cria na propria loja em nome proprio
  it('agendador cria agendamento na propria loja em nome proprio', async () => {
    const { data: franqueadoId } = await agendador.from('usuarios').select('franqueado_id').eq('id', idDoAgendador).single();

    const { data, error } = await agendador
      .from('agendamentos')
      .insert({ ...novoAgendamento(lojaDoAgendador, idDoAgendador), franqueado_id: franqueadoId!.franqueado_id })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) criados.push(data.id);
  });

  // espelho: agendador NAO cria em loja alheia
  it('agendador NAO cria agendamento em loja alheia', async () => {
    const { data: franqueadoId } = await agendador.from('usuarios').select('franqueado_id').eq('id', idDoAgendador).single();

    const { error } = await agendador
      .from('agendamentos')
      .insert({ ...novoAgendamento(lojaAlheia, idDoAgendador), franqueado_id: franqueadoId!.franqueado_id });

    // 42501 = insufficient_privilege, o codigo que o Postgres devolve quando
    // a clausula WITH CHECK da policy reprova a linha.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // espelho: agendador NAO lanca em nome de colega
  it('agendador NAO lanca agendamento em nome de outra pessoa', async () => {
    const { data: colegas } = await franqueado.from('usuarios').select('id').neq('id', idDoAgendador).limit(1);
    const { data: franqueadoId } = await agendador.from('usuarios').select('franqueado_id').eq('id', idDoAgendador).single();

    const { error } = await agendador.from('agendamentos').insert({
      ...novoAgendamento(lojaDoAgendador, colegas![0].id),
      franqueado_id: franqueadoId!.franqueado_id,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // espelho: agendador NAO apaga agendamento
  it('agendador NAO apaga agendamento, nem o que ele mesmo criou', async () => {
    const alvo = criados[0];
    expect(alvo).toBeTruthy();

    const { error } = await agendador.from('agendamentos').delete().eq('id', alvo);

    // O delete negado pelo RLS nao levanta erro: simplesmente nao atinge
    // linha nenhuma. Conferir a permanencia e o que prova a policy.
    expect(error).toBeNull();

    const { data: aindaExiste } = await franqueado.from('agendamentos').select('id').eq('id', alvo);
    expect(aindaExiste).toHaveLength(1);
  });

  // espelho: franqueado apaga agendamento de qualquer loja
  it('franqueado apaga agendamento de qualquer loja do tenant', async () => {
    const { data: criado } = await franqueado
      .from('agendamentos')
      .insert({
        ...novoAgendamento(lojaAlheia, idDoAgendador),
        franqueado_id: (await franqueado.from('franqueados').select('id').single()).data!.id,
      })
      .select('id')
      .single();

    const { error } = await franqueado.from('agendamentos').delete().eq('id', criado!.id);
    expect(error).toBeNull();

    const { data: sobrou } = await franqueado.from('agendamentos').select('id').eq('id', criado!.id);
    expect(sobrou).toHaveLength(0);
  });
});

describe.skipIf(!rodar)('policies de cadastro', () => {
  let agendador: ClienteAutenticado;

  beforeAll(async () => {
    agendador = await entrarComo(CONTAS.agendadorLoja1);
  });

  afterAll(async () => {
    await agendador.encerrar();
  });

  // espelho: agendador NAO cria loja
  it('agendador NAO cria loja', async () => {
    const { data: eu } = await agendador.auth.getUser();
    const { data: perfil } = await agendador.from('usuarios').select('franqueado_id').eq('id', eu.user!.id).single();

    const { error } = await agendador.from('lojas').insert({
      franqueado_id: perfil!.franqueado_id,
      nome: `${MARCA} Loja`,
      codigo_loja: 'TESTE-999',
      estado: 'DF',
      cidade: 'Brasilia',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // A escalada de privilegio tem suite propria: escalada.test.ts.
});
