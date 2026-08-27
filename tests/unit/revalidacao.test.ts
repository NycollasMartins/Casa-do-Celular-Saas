import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TELAS_POR_GRUPO, type GrupoRevalidacao } from '@/lib/revalidacao';
import { execSync } from 'node:child_process';

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

describe('a direcao inversa: telas que ninguem revalida', () => {
  /**
   * O teste acima confere que todo caminho listado existe. Faltava o oposto:
   * que toda tela de dados esteja em ALGUM grupo.
   *
   * Foi assim que /admin/lojas e /admin/metricas-gerais ficaram de fora —
   * ninguem as removeu, elas simplesmente nunca entraram. Criar uma loja
   * invalidava a lista do franqueado e nao a da rede.
   *
   * Uma tela fora do mapa nao quebra: mostra dado velho, que e pior, porque
   * parece que a gravacao nao funcionou.
   */
  const SEM_DADO_PARA_REVALIDAR: Record<string, string> = {
    '/': 'so redireciona',
    '/privacidade': 'texto estatico da politica',
    '/auth/login': 'formulario',
    '/auth/register': 'formulario',
    '/auth/forgot-password': 'formulario',
    '/auth/nova-senha': 'formulario',
    '/admin/franqueados': 'coberta pelo grupo franqueado',
    '/convite/[token]': 'formulario publico; o convite e lido a cada acesso (force-dynamic)',
  };

  const rotas = execSync('find app -name page.tsx', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((caminho) => {
      const rota = caminho.replace('app/', '').replace(/\/?page\.tsx$/, '');
      return rota === '' ? '/' : `/${rota}`;
    });

  const listadas = new Set(Object.values(TELAS_POR_GRUPO).flat());

  it('encontrou as rotas', () => {
    expect(rotas.length).toBeGreaterThan(10);
  });

  it.each(rotas)('%s esta em algum grupo, ou isenta com motivo', (rota) => {
    const coberta = listadas.has(rota) || rota in SEM_DADO_PARA_REVALIDAR;

    expect(coberta).toBe(true);
  });

  it('nao ha isencao orfa', () => {
    const orfas = Object.keys(SEM_DADO_PARA_REVALIDAR).filter((r) => !rotas.includes(r));

    expect(orfas).toEqual([]);
  });
});
