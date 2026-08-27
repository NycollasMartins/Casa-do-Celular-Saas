/**
 * Regras do ciclo de cobranca que a INTERFACE precisa conhecer.
 *
 * A rotina que avisa e suspende vive em `scripts/cobranca.mjs`, com node
 * puro. Este arquivo existe so para a tela nao repetir o numero de cabeca ao
 * calcular "suspende em tal dia" — e `tests/unit/cobranca.test.ts` compara os
 * dois valores, alem de conferir contra o default da funcao SQL.
 */

/** Dias entre o aviso e o corte. Espelha CARENCIA_DIAS de scripts/compartilhado.mjs. */
export const CARENCIA_DIAS = 3;

/**
 * Ate quando pagar, dado o dia em que o aviso saiu.
 *
 * Avisado no dia D, o cliente tem D, D+1 e D+2 — tres dias. A suspensao
 * acontece em D+3, quando o prazo ja passou inteiro.
 *
 * Meio-dia UTC no meio do caminho: somar dias assim nao cruza fronteira de
 * fuso, do mesmo jeito que `somarDias` em lib/semana.ts.
 */
export function limiteDoPagamento(avisadoEmIso: string, carencia = CARENCIA_DIAS): string {
  const base = new Date(`${avisadoEmIso.slice(0, 10)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + carencia);
  return base.toISOString().slice(0, 10);
}
