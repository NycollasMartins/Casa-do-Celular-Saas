import { describe, expect, it } from 'vitest';
import { diaEMes, hojeNaLoja, segundaFeiraDa, semanaAnterior } from '@/lib/semana';

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
