import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TELAS_POR_GRUPO, type GrupoRevalidacao } from '@/lib/revalidacao';

/**
 * `revalidatePath` com caminho inexistente NAO levanta erro: simplesmente
 * nao faz nada. Um erro de digitacao em um destes grupos faria a tela
 * continuar mostrando dado velho depois de uma escrita, sem sinal nenhum.
 *
 * Este teste amarra cada caminho ao arquivo de rota correspondente.
 */

const todos = Object.values(TELAS_POR_GRUPO).flat();

function arquivoDaRota(caminho: string): string {
  return `app${caminho}/page.tsx`;
}

describe('grupos de revalidacao', () => {
  it('todo caminho corresponde a uma rota existente', () => {
    const inexistentes = [...new Set(todos)].filter(
      (caminho) => !existsSync(arquivoDaRota(caminho))
    );

    expect(inexistentes).toEqual([]);
  });

  it('nenhum grupo esta vazio', () => {
    for (const [grupo, telas] of Object.entries(TELAS_POR_GRUPO)) {
      expect(telas.length, `grupo '${grupo}'`).toBeGreaterThan(0);
    }
  });

  it('caminhos comecam com barra e nao terminam com barra', () => {
    for (const caminho of todos) {
      expect(caminho.startsWith('/'), caminho).toBe(true);
      expect(caminho.endsWith('/'), caminho).toBe(false);
    }
  });

  /**
   * O dashboard agrega tudo: qualquer escrita que mude numero precisa
   * invalida-lo, senao os cards ficam para tras.
   */
  it('todo grupo de dado do dia a dia inclui o dashboard', () => {
    const doDiaADia: GrupoRevalidacao[] = ['agendamento', 'venda', 'equipe', 'loja', 'meta'];

    for (const grupo of doDiaADia) {
      expect(TELAS_POR_GRUPO[grupo], `grupo '${grupo}'`).toContain('/dashboard');
    }
  });

  /** Quem mexe em venda mexe em faturamento, que aparece em Relatorios e Metas. */
  it('venda alcanca relatorios e metas', () => {
    expect(TELAS_POR_GRUPO.venda).toContain('/dashboard/relatorios');
    expect(TELAS_POR_GRUPO.venda).toContain('/dashboard/metas');
  });
});
