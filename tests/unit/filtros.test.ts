import { describe, expect, it } from 'vitest';
import { lerFiltros } from '@/lib/filtros';

describe('lerFiltros', () => {
  it('usa 30 dias quando nada e informado', () => {
    expect(lerFiltros({})).toMatchObject({ periodo: '30d' });
  });

  it('aceita os periodos conhecidos', () => {
    expect(lerFiltros({ periodo: '7d' }).periodo).toBe('7d');
    expect(lerFiltros({ periodo: '90d' }).periodo).toBe('90d');
  });

  it('ignora periodo desconhecido em vez de repassar', () => {
    expect(lerFiltros({ periodo: 'ontem' }).periodo).toBe('30d');
  });

  it('le a loja e o status', () => {
    const filtros = lerFiltros({ loja: 'abc', status: 'compareceu' });
    expect(filtros.lojaId).toBe('abc');
    expect(filtros.status).toEqual(['compareceu']);
  });

  describe('intervalo personalizado', () => {
    it('aceita um par de datas coerente', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2026-08-01',
        fim: '2026-08-31',
      });

      expect(filtros).toMatchObject({
        periodo: 'personalizado',
        dataInicio: '2026-08-01',
        dataFim: '2026-08-31',
      });
    });

    /**
     * DEFEITO CORRIGIDO: o valor vinha da query string direto para o `gte`
     * da consulta. `?inicio=abc` derrubava a pagina com erro do banco.
     */
    it('descarta data que nao e uma data', () => {
      const filtros = lerFiltros({ periodo: 'personalizado', inicio: 'abc', fim: '2026-08-31' });

      expect(filtros.dataInicio).toBeUndefined();
      expect(filtros.periodo).toBe('30d');
    });

    /** 31 de fevereiro passa no formato; o Date normaliza para marco. */
    it('descarta data que nao existe no calendario', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2026-02-31',
        fim: '2026-03-31',
      });

      expect(filtros.dataInicio).toBeUndefined();
      expect(filtros.periodo).toBe('30d');
    });

    it('aceita 29 de fevereiro em ano bissexto', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2028-02-29',
        fim: '2028-03-01',
      });

      expect(filtros.dataInicio).toBe('2028-02-29');
    });

    it('descarta 29 de fevereiro em ano comum', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2026-02-29',
        fim: '2026-03-01',
      });

      expect(filtros.dataInicio).toBeUndefined();
    });

    /**
     * Intervalo invertido devolveria lista vazia sem explicar por que. Cair
     * no periodo padrao mostra dado e deixa o usuario corrigir o filtro.
     */
    it('descarta intervalo invertido', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2026-08-31',
        fim: '2026-08-01',
      });

      expect(filtros.dataInicio).toBeUndefined();
      expect(filtros.dataFim).toBeUndefined();
      expect(filtros.periodo).toBe('30d');
    });

    it('aceita inicio e fim no mesmo dia', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: '2026-08-20',
        fim: '2026-08-20',
      });

      expect(filtros.dataInicio).toBe('2026-08-20');
    });

    it('exige o par: so uma das datas nao basta', () => {
      const filtros = lerFiltros({ periodo: 'personalizado', inicio: '2026-08-01' });

      expect(filtros.dataInicio).toBeUndefined();
      expect(filtros.periodo).toBe('30d');
    });

    it('usa o primeiro valor quando o parametro vem repetido', () => {
      const filtros = lerFiltros({
        periodo: 'personalizado',
        inicio: ['2026-08-01', '2020-01-01'],
        fim: '2026-08-31',
      });

      expect(filtros.dataInicio).toBe('2026-08-01');
    });
  });
});
