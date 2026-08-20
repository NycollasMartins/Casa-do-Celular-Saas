/**
 * Limites de semana para o relatorio semanal.
 *
 * A semana e de segunda a domingo, como o comercio brasileiro conta — nao
 * de domingo a sabado, que e o padrao do `getDay()` do JavaScript. Trocar
 * um pelo outro desloca o relatorio inteiro em um dia e faz a segunda-feira
 * aparecer no resumo da semana errada.
 */

export const FUSO_LOJA = 'America/Sao_Paulo';

/** AAAA-MM-DD no fuso das lojas. Ver o comentario de fuso em lib/notificacoes.ts. */
export function dataLocal(agora = new Date(), fuso = FUSO_LOJA): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function somarDias(iso: string, dias: number): string {
  // Meio-dia UTC evita que o deslocamento cruze fronteira de fuso.
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/**
 * Segunda-feira da semana a que a data pertence.
 *
 * `getUTCDay()` devolve 0 para domingo; a conversao para o padrao ISO
 * (segunda = 1, domingo = 7) e o que faz o domingo pertencer a semana que
 * termina, e nao a que comeca.
 */
export function segundaFeiraDa(iso: string): string {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  const diaIso = dia === 0 ? 7 : dia;
  return somarDias(iso, -(diaIso - 1));
}

/** Semana fechada anterior a data informada: a que o relatorio cobre. */
export function semanaAnterior(agora = new Date(), fuso = FUSO_LOJA): {
  inicio: string;
  fim: string;
} {
  const segundaDesta = segundaFeiraDa(dataLocal(agora, fuso));
  const inicio = somarDias(segundaDesta, -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** DD/MM para exibicao, sem depender do fuso do runtime. */
export function diaEMes(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}
