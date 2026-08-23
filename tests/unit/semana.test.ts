import { describe, expect, it } from 'vitest';
import { diaEMes, hojeNaLoja, segundaFeiraDa, semanaAnterior, ehDataIso } from '@/lib/semana';

describe('segundaFeiraDa', () => {
  it('devolve a propria data quando ja e segunda', () => {
    // 2026-08-17 e uma segunda-feira.
    expect(segundaFeiraDa('2026-08-17')).toBe('2026-08-17');
  });

  it('recua ate a segunda no meio da semana', () => {
    expect(segundaFeiraDa('2026-08-20')).toBe('2026-08-17'); // quinta
    expect(segundaFeiraDa('2026-08-22')).toBe('2026-08-17'); // sabado
  });

  /**
   * A sutileza: `getUTCDay()` chama domingo de 0, entao sem a conversao
   * para o padrao ISO o domingo cairia na semana que COMECA, e nao na que
   * termina — deslocando o relatorio inteiro em um dia.
   */
  it('coloca o domingo na semana que termina, nao na que comeca', () => {
    expect(segundaFeiraDa('2026-08-23')).toBe('2026-08-17');
  });

  it('atravessa a virada de mes', () => {
    // 2026-09-01 e terca; a segunda foi 31/08.
    expect(segundaFeiraDa('2026-09-01')).toBe('2026-08-31');
  });

  it('atravessa a virada de ano', () => {
    // 2027-01-01 e sexta; a segunda foi 28/12/2026.
    expect(segundaFeiraDa('2027-01-01')).toBe('2026-12-28');
  });
});

describe('semanaAnterior', () => {
  it('cobre a semana fechada, de segunda a domingo', () => {
    // Quinta, 20/08/2026. A semana anterior vai de 10 a 16.
    const semana = semanaAnterior(new Date('2026-08-20T15:00:00Z'));
    expect(semana).toEqual({ inicio: '2026-08-10', fim: '2026-08-16' });
  });

  it('rodando na segunda, cobre a semana que acabou de fechar', () => {
    const semana = semanaAnterior(new Date('2026-08-17T09:00:00Z'));
    expect(semana).toEqual({ inicio: '2026-08-10', fim: '2026-08-16' });
  });

  it('rodando no domingo, ainda cobre a semana anterior', () => {
    // Domingo 23/08 pertence a semana de 17 a 23, entao a anterior e 10 a 16.
    const semana = semanaAnterior(new Date('2026-08-23T15:00:00Z'));
    expect(semana).toEqual({ inicio: '2026-08-10', fim: '2026-08-16' });
  });

  it('o intervalo tem sempre sete dias', () => {
    const semana = semanaAnterior(new Date('2026-09-02T15:00:00Z'));
    const dias =
      (Date.parse(`${semana.fim}T12:00:00Z`) - Date.parse(`${semana.inicio}T12:00:00Z`)) /
      86_400_000;
    expect(dias).toBe(6);
  });

  /**
   * A rotina roda de madrugada. As 22h de domingo em Brasilia ja e segunda
   * em UTC — calcular por UTC pularia uma semana inteira.
   */
  it('nao pula semana quando roda a noite, com o UTC ja virado', () => {
    // 2026-08-24T01:00:00Z = domingo 23/08, 22h em Brasilia.
    const semana = semanaAnterior(new Date('2026-08-24T01:00:00Z'));
    expect(semana).toEqual({ inicio: '2026-08-10', fim: '2026-08-16' });
  });
});

describe('hojeNaLoja', () => {
  it('usa o fuso das lojas, nao o UTC', () => {
    // 02h UTC = 23h do dia anterior em Brasilia.
    expect(hojeNaLoja(new Date('2026-08-21T02:00:00Z'))).toBe('2026-08-20');
  });
});

describe('diaEMes', () => {
  it('formata para exibicao', () => {
    expect(diaEMes('2026-08-10')).toBe('10/08');
    expect(diaEMes('2026-12-31')).toBe('31/12');
  });
});

describe('ehDataIso', () => {
  /**
   * A validacao existia so em lib/filtros.ts, para a query string. O schema do
   * agendamento usava `Date.parse`, que e bem mais permissivo — e o campo que
   * ele valida e o `data_agendamento`, que alimenta todo relatorio.
   */
  it.each(['2026-08-25', '2026-01-01', '2026-12-31', '2024-02-29'])('aceita %s', (valor) => {
    expect(ehDataIso(valor)).toBe(true);
  });

  it('recusa dia que nao existe no mes', () => {
    // `Date.parse('2026-02-31')` nao falha: normaliza para 03/03. Quem confia
    // nele manda 31 de fevereiro para o banco, que ai sim recusa — com uma
    // mensagem de Postgres na cara de quem preencheu o formulario.
    expect(ehDataIso('2026-02-31')).toBe(false);
    expect(ehDataIso('2025-02-29')).toBe(false);
    expect(ehDataIso('2026-04-31')).toBe(false);
  });

  it('recusa mes fora da faixa', () => {
    expect(ehDataIso('2026-13-01')).toBe(false);
    expect(ehDataIso('2026-00-10')).toBe(false);
  });

  it('recusa formato ambiguo', () => {
    // 08/25/2026 e 25/08/2026 sao o mesmo dia para uma pessoa no Brasil e
    // coisas diferentes para o banco, que le pelo DateStyle.
    expect(ehDataIso('08/25/2026')).toBe(false);
    expect(ehDataIso('25/08/2026')).toBe(false);
    expect(ehDataIso('August 25, 2026')).toBe(false);
  });

  it('recusa carimbo de tempo, que nao e data na loja', () => {
    // 2026-08-26T01:00:00Z e 25 de agosto as 22h em Brasilia. Aceitar isso
    // grava o atendimento no dia seguinte e desloca todo relatorio que o
    // conte — a mesma classe de defeito que esta base ja corrigiu seis vezes.
    expect(ehDataIso('2026-08-26T01:00:00Z')).toBe(false);
    expect(ehDataIso('2026-08-25T23:00:00Z')).toBe(false);
  });

  it('recusa o que nao e texto', () => {
    expect(ehDataIso(null)).toBe(false);
    expect(ehDataIso(undefined)).toBe(false);
    expect(ehDataIso(20260825)).toBe(false);
    expect(ehDataIso('')).toBe(false);
  });
});
