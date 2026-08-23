/**
 * Limites de semana para o relatorio semanal.
 *
 * A semana e de segunda a domingo, como o comercio brasileiro conta — nao
 * de domingo a sabado, que e o padrao do `getDay()` do JavaScript. Trocar
 * um pelo outro desloca o relatorio inteiro em um dia e faz a segunda-feira
 * aparecer no resumo da semana errada.
 */

export const FUSO_LOJA = 'America/Sao_Paulo';

/**
 * Hoje no fuso das LOJAS, em AAAA-MM-DD. Fonte unica do conceito.
 *
 * Existe porque a alternativa ja falhou cinco vezes neste projeto:
 * `new Date()` pega o fuso de QUEM EXECUTA, e `toISOString()` devolve
 * sempre UTC — nem o fuso local, nem o das lojas. O servidor da Vercel e da
 * Netlify roda em UTC, que as 21h ja virou o dia, e ate no navegador do
 * agendador o `toISOString()` mente pelo mesmo motivo.
 *
 * Toda decisao de negocio sobre "que dia e hoje" deve passar por aqui.
 */
export function hojeNaLoja(agora = new Date(), fuso = FUSO_LOJA): string {
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
  const segundaDesta = segundaFeiraDa(hojeNaLoja(agora, fuso));
  const inicio = somarDias(segundaDesta, -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** DD/MM para exibicao, sem depender do fuso do runtime. */
export function diaEMes(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/**
 * Confere se o texto e uma data de calendario no formato ISO.
 *
 * POR QUE NAO BASTA `Date.parse`
 * Ele aceita coisas que nao sao data de calendario e coisas que nao sao data
 * nenhuma no sentido que o sistema usa:
 *
 *   2026-02-31             -> normaliza para 03/03 em vez de recusar
 *   08/25/2026             -> formato ambiguo; 25/08 seria lido como mes 25
 *   August 25, 2026        -> depende do DateStyle do banco
 *   2026-08-26T01:00:00Z   -> carimbo de tempo, nao data
 *
 * O ultimo e o que mais custa aqui. `data_agendamento` e a data NA LOJA, e
 * 2026-08-26T01:00:00Z e 25 de agosto as 22h em Brasilia: gravar o dia 26
 * joga o atendimento para o dia seguinte e desloca todo relatorio que o
 * conte. E a mesma classe de defeito que esta base ja corrigiu seis vezes,
 * entrando pela porta da frente.
 *
 * A conferencia e o proprio round-trip: se formatar de volta nao devolver o
 * texto original, o valor nao era a data que aparentava ser.
 */
export function ehDataIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const data = new Date(`${valor}T12:00:00Z`);
  if (Number.isNaN(data.getTime())) return false;

  return data.toISOString().slice(0, 10) === valor;
}
