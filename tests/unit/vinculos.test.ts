import { describe, expect, it } from 'vitest';
import { planejarVinculos } from '@/lib/vinculos';

const LOJA_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const LOJA_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const LOJA_C = 'cccccccc-3333-4333-8333-cccccccccccc';

const vinculo = (id: string, loja: string) => ({ id, loja_id: loja });

describe('agendador', () => {
  it('abre lotacao quando a pessoa ainda nao tem', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [],
      participacaoAtivas: [],
    });

    expect(plano.abrirAgendador).toBe(LOJA_A);
    expect(plano.encerrarAgendador).toEqual([]);
  });

  it('encerra a lotacao antiga ao mudar de loja', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_B,
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [],
    });

    expect(plano.encerrarAgendador).toEqual(['v1']);
    expect(plano.abrirAgendador).toBe(LOJA_B);
  });

  it('nao mexe em nada quando a loja escolhida ja e a atual', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [],
    });

    expect(plano.encerrarAgendador).toEqual([]);
    expect(plano.abrirAgendador).toBeUndefined();
  });

  /**
   * DEFEITO CORRIGIDO: virar agendador deixava a participacao societaria
   * ativa. A pessoa aparecia no Societario como socia depois de ter virado
   * operacional, e o percentual dela continuava na soma que alerta acima de
   * 100% na loja.
   */
  it('encerra a participacao societaria ao virar operacional', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [],
      participacaoAtivas: [vinculo('p1', LOJA_B)],
    });

    expect(plano.encerrarParticipacao).toEqual(['p1']);
  });

  it('encerra todas as participacoes, nao so a primeira', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [],
      participacaoAtivas: [vinculo('p1', LOJA_A), vinculo('p2', LOJA_B), vinculo('p3', LOJA_C)],
    });

    expect(plano.encerrarParticipacao).toEqual(['p1', 'p2', 'p3']);
  });

  it('mantem so a lotacao escolhida quando ha mais de uma ativa', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [vinculo('v1', LOJA_A), vinculo('v2', LOJA_B)],
      participacaoAtivas: [],
    });

    expect(plano.encerrarAgendador).toEqual(['v2']);
    expect(plano.abrirAgendador).toBeUndefined();
  });
});

describe('diretor e franqueado', () => {
  it('abre participacao quando ainda nao ha nenhuma', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [],
      participacaoAtivas: [],
    });

    expect(plano.abrirParticipacao).toBe(LOJA_A);
    expect(plano.recusa).toBeUndefined();
  });

  it('move a participacao quando existe exatamente uma', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_B,
      agendadorAtivos: [],
      participacaoAtivas: [vinculo('p1', LOJA_A)],
    });

    expect(plano.encerrarParticipacao).toEqual(['p1']);
    expect(plano.abrirParticipacao).toBe(LOJA_B);
  });

  it('nao mexe quando a pessoa ja participa da loja escolhida', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [],
      participacaoAtivas: [vinculo('p1', LOJA_A), vinculo('p2', LOJA_B)],
    });

    expect(plano.encerrarParticipacao).toEqual([]);
    expect(plano.abrirParticipacao).toBeUndefined();
    expect(plano.recusa).toBeUndefined();
  });

  /**
   * DEFEITO CORRIGIDO: o codigo usava maybeSingle() numa consulta que
   * devolve varias linhas para um diretor com mais de uma loja — no seed, o
   * diretor 1 tem cinco. O erro era ignorado, o resultado vinha nulo e uma
   * SEXTA participacao era criada em vez de mover alguma.
   *
   * Com mais de uma participacao, um unico dropdown nao diz qual mover.
   * Recusar e mais seguro que adivinhar num registro societario.
   */
  it('recusa quando ha varias participacoes e a loja escolhida e outra', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_C,
      agendadorAtivos: [],
      participacaoAtivas: [vinculo('p1', LOJA_A), vinculo('p2', LOJA_B)],
    });

    expect(plano.recusa).toMatch(/Societario/);
    expect(plano.abrirParticipacao).toBeUndefined();
    expect(plano.encerrarParticipacao).toEqual([]);
  });

  it('a recusa nao encerra nada, nem a lotacao de agendador', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_C,
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [vinculo('p1', LOJA_A), vinculo('p2', LOJA_B)],
    });

    expect(plano.recusa).toBeTruthy();
    expect(plano.encerrarAgendador).toEqual([]);
  });

  /**
   * DEFEITO CORRIGIDO: virar diretor deixava a lotacao de agendador ativa.
   * A pessoa continuava aparecendo como agendador alocado, inclusive nos
   * filtros, depois de ter virado gestora.
   */
  it('encerra a lotacao de agendador ao virar gestor', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      lojaEscolhida: LOJA_B,
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [],
    });

    expect(plano.encerrarAgendador).toEqual(['v1']);
  });

  it('franqueado segue a mesma regra do diretor', () => {
    const plano = planejarVinculos({
      papel: 'franqueado',
      lojaEscolhida: LOJA_A,
      agendadorAtivos: [vinculo('v1', LOJA_B)],
      participacaoAtivas: [],
    });

    expect(plano.encerrarAgendador).toEqual(['v1']);
    expect(plano.abrirParticipacao).toBe(LOJA_A);
  });
});

describe('sem loja escolhida', () => {
  it('gestor sem loja apenas encerra a lotacao operacional', () => {
    const plano = planejarVinculos({
      papel: 'diretor',
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [vinculo('p1', LOJA_B)],
    });

    expect(plano.encerrarAgendador).toEqual(['v1']);
    expect(plano.encerrarParticipacao).toEqual([]);
    expect(plano.abrirParticipacao).toBeUndefined();
  });

  it('agendador sem loja apenas encerra a sociedade', () => {
    const plano = planejarVinculos({
      papel: 'agendador',
      agendadorAtivos: [vinculo('v1', LOJA_A)],
      participacaoAtivas: [vinculo('p1', LOJA_B)],
    });

    expect(plano.encerrarParticipacao).toEqual(['p1']);
    expect(plano.encerrarAgendador).toEqual([]);
  });
});
