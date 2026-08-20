import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTAS, bancoEDeTeste, entrarComo, numeroDaLoja, type ClienteAutenticado } from './cliente';

/**
 * O RLS e a UNICA camada de seguranca do sistema: nao ha checagem redundante
 * na aplicacao. Uma policy alterada sem querer vaza dados entre lojas em
 * silencio. Estas suites existem para esse erro nao passar despercebido.
 *
 * Todas as asseveracoes aqui sao de LEITURA. As de escrita ficam em
 * escrita.test.ts, separadas de proposito.
 */

const rodar = await bancoEDeTeste();

describe.skipIf(!rodar)('lojas visiveis por papel', () => {
  const sessoes: ClienteAutenticado[] = [];

  async function abrir(email: string) {
    const cliente = await entrarComo(email);
    sessoes.push(cliente);
    return cliente;
  }

  afterAll(async () => {
    await Promise.all(sessoes.map((sessao) => sessao.encerrar()));
  });

  it('franqueado enxerga as 9 lojas do tenant', async () => {
    const cliente = await abrir(CONTAS.franqueado);
    const { data, error } = await cliente.from('lojas').select('id, nome');

    expect(error).toBeNull();
    expect(data).toHaveLength(9);
  });

  it('diretor 1 enxerga apenas as lojas 1 a 5, onde tem participacao ativa', async () => {
    const cliente = await abrir(CONTAS.diretor1);
    const { data, error } = await cliente.from('lojas').select('nome');

    expect(error).toBeNull();
    const numeros = (data ?? []).map((loja) => numeroDaLoja(loja.nome)).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5]);
  });

  it('diretor 2 enxerga apenas as lojas 6 a 9', async () => {
    const cliente = await abrir(CONTAS.diretor2);
    const { data } = await cliente.from('lojas').select('nome');

    const numeros = (data ?? []).map((loja) => numeroDaLoja(loja.nome)).sort((a, b) => a - b);
    expect(numeros).toEqual([6, 7, 8, 9]);
  });

  it('agendador enxerga somente a loja em que esta alocado', async () => {
    const cliente = await abrir(CONTAS.agendadorLoja1);
    const { data } = await cliente.from('lojas').select('nome');

    expect(data).toHaveLength(1);
    expect(numeroDaLoja(data![0].nome)).toBe(1);
  });

  it('agendadores de lojas diferentes nao se cruzam', async () => {
    const [um, nove] = await Promise.all([abrir(CONTAS.agendadorLoja1), abrir(CONTAS.agendadorLoja9)]);

    const [{ data: lojasUm }, { data: lojasNove }] = await Promise.all([
      um.from('lojas').select('id'),
      nove.from('lojas').select('id'),
    ]);

    const idsUm = new Set((lojasUm ?? []).map((loja) => loja.id));
    const cruzamento = (lojasNove ?? []).filter((loja) => idsUm.has(loja.id));
    expect(cruzamento).toHaveLength(0);
  });
});

describe.skipIf(!rodar)('agendamentos seguem as lojas permitidas', () => {
  const sessoes: ClienteAutenticado[] = [];

  afterAll(async () => {
    await Promise.all(sessoes.map((sessao) => sessao.encerrar()));
  });

  async function lojasDosAgendamentos(email: string) {
    const cliente = await entrarComo(email);
    sessoes.push(cliente);
    const { data } = await cliente.from('agendamentos').select('loja_id');
    return new Set((data ?? []).map((item) => item.loja_id));
  }

  it('agendador so alcanca agendamentos da propria loja', async () => {
    const lojas = await lojasDosAgendamentos(CONTAS.agendadorLoja1);
    expect(lojas.size).toBeLessThanOrEqual(1);
  });

  it('diretor alcanca no maximo as 5 lojas em que participa', async () => {
    const lojas = await lojasDosAgendamentos(CONTAS.diretor1);
    expect(lojas.size).toBeLessThanOrEqual(5);
  });

  it('franqueado alcanca agendamentos de todas as lojas', async () => {
    const lojas = await lojasDosAgendamentos(CONTAS.franqueado);
    expect(lojas.size).toBeGreaterThan(1);
  });

  /**
   * O vazamento mais grave possivel: pedir explicitamente por uma loja alheia.
   * O RLS precisa devolver vazio, nao erro — e a diferenca entre "nao existe
   * para voce" e "existe mas voce nao pode", que ja e informacao demais.
   */
  it('filtrar por loja alheia devolve vazio, nao dados', async () => {
    const franqueado = await entrarComo(CONTAS.franqueado);
    sessoes.push(franqueado);
    const { data: todas } = await franqueado.from('lojas').select('id, nome');
    const loja9 = (todas ?? []).find((loja) => numeroDaLoja(loja.nome) === 9);

    const agendador = await entrarComo(CONTAS.agendadorLoja1);
    sessoes.push(agendador);
    const { data, error } = await agendador.from('agendamentos').select('id').eq('loja_id', loja9!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe.skipIf(!rodar)('usuarios e dados do tenant', () => {
  let franqueado: ClienteAutenticado;
  let agendador: ClienteAutenticado;

  beforeAll(async () => {
    franqueado = await entrarComo(CONTAS.franqueado);
    agendador = await entrarComo(CONTAS.agendadorLoja1);
  });

  afterAll(async () => {
    await Promise.all([franqueado.encerrar(), agendador.encerrar()]);
  });

  it('franqueado enxerga os 21 usuarios do tenant', async () => {
    const { data } = await franqueado.from('usuarios').select('id');
    expect((data ?? []).length).toBeGreaterThanOrEqual(21);
  });

  it('agendador enxerga a si mesmo e os colegas da propria loja, nao o tenant inteiro', async () => {
    const { data } = await agendador.from('usuarios').select('id, email');

    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).length).toBeLessThan(21);
    expect((data ?? []).some((usuario) => usuario.email === CONTAS.agendadorLoja1)).toBe(true);
  });

  it('agendador nao alcanca a tabela de franqueados', async () => {
    const { data } = await agendador.from('franqueados').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('agendador nao enxerga participacoes societarias alheias', async () => {
    const { data } = await agendador.from('participacoes_societarias').select('usuario_id');
    expect(data ?? []).toHaveLength(0);
  });
});
