/**
 * Logica compartilhada pelos scripts de rotina.
 *
 * POR QUE ISTO EXISTE, E POR QUE E .mjs
 * Os scripts rodam com `node` puro, sem build. Nao podem importar de `lib/`,
 * que e TypeScript — o Node 24 executa .ts nativamente, mas o CI e os
 * ambientes de cron costumam estar em versoes mais antigas, e quebrar a
 * rotina noturna para eliminar duplicacao seria um mau negocio.
 *
 * Entao a duplicacao continua existindo, mas em UM lugar em vez de tres. E
 * `tests/unit/compartilhado.test.ts` compara este arquivo com as funcoes de
 * lib/ nos mesmos casos: se as duas versoes divergirem, o teste falha.
 *
 * Isso nao e teoria. A copia da retencao em anonimizar-antigos.mjs ja tinha
 * divergido da do banco, e o relatorio semanal usava um denominador
 * diferente do dashboard para a mesma taxa.
 */

export const FUSO_LOJA = 'America/Sao_Paulo';

/** Espelha hojeNaLoja de lib/semana.ts. */
export function hojeNaLoja(agora = new Date(), fuso = FUSO_LOJA) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** Meio-dia UTC no meio do caminho: somar dias nao cruza fronteira de fuso. */
export function somarDias(iso, dias) {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Espelha segundaFeiraDa de lib/semana.ts. Domingo pertence a semana que TERMINA. */
export function segundaFeiraDa(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  const diaIso = dia === 0 ? 7 : dia;
  return somarDias(iso, -(diaIso - 1));
}

/** Espelha semanaAnterior de lib/semana.ts. */
export function semanaAnterior(agora = new Date(), fuso = FUSO_LOJA) {
  const inicio = somarDias(segundaFeiraDa(hojeNaLoja(agora, fuso)), -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** Espelha diaEMes de lib/semana.ts. */
export function diaEMes(iso) {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/** Espelha dataDeAmanha de lib/notificacoes.ts. */
export function dataDeAmanha(agora = new Date(), fuso = FUSO_LOJA) {
  return somarDias(hojeNaLoja(agora, fuso), 1);
}

/**
 * Espelha subtrairMeses de lib/lgpd.ts. Gruda no ultimo dia quando o mes de
 * destino e mais curto, como o Postgres — `setMonth` transborda.
 */
export function subtrairMeses(iso, meses) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const total = ano * 12 + (mes - 1) - meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes + 1, 0)).getUTCDate();
  const dois = (n) => String(n).padStart(2, '0');
  return `${novoAno}-${dois(novoMes + 1)}-${dois(Math.min(dia, ultimoDia))}`;
}

/** Espelha DDDS_VALIDOS de lib/whatsapp.ts. O intervalo 11-99 nao e continuo. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Espelha normalizarTelefoneBr de lib/whatsapp.ts. */
export function normalizarTelefoneBr(entrada) {
  let digitos = (entrada ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  if (digitos.startsWith('0055')) digitos = digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
  else if (digitos.length === 12 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length === 12 && digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.length === 11 && digitos.startsWith('0')) digitos = digitos.slice(1);

  if (digitos.length !== 10 && digitos.length !== 11) return null;
  if (!DDDS_VALIDOS.has(Number(digitos.slice(0, 2)))) return null;

  const assinante = digitos.slice(2);
  if (assinante.length === 9 ? !assinante.startsWith('9') : !/^[2-5]/.test(assinante)) return null;

  return `55${digitos}`;
}

/** Espelha montarMensagem de lib/notificacoes.ts. */
export function montarMensagemLembrete(destinatario) {
  const primeiroNome = destinatario.cliente_nome.trim().split(/\s+/)[0];
  return {
    assunto: `Seu atendimento na ${destinatario.loja_nome} e amanha`,
    texto:
      `Ola, ${primeiroNome}! Passando para lembrar do seu atendimento na ` +
      `${destinatario.loja_nome}, amanha (${diaEMes(destinatario.data_agendamento)}). ` +
      `Se precisar remarcar, e so responder esta mensagem. Ate breve!`,
  };
}

/** Espelha formatarBrl de lib/dinheiro.ts. */
export function formatarBrl(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(valor ?? 0)
  );
}

/**
 * Espelha canalDisponivel de lib/notificacoes.ts.
 *
 * WhatsApp na frente do e-mail: e onde a pessoa efetivamente le, e o
 * telefone e obrigatorio no cadastro enquanto o e-mail nao e.
 */
export function canalDisponivel(destinatario, provedores) {
  if (provedores.whatsapp && destinatario.cliente_telefone) return 'whatsapp';
  if (provedores.email && destinatario.cliente_email) return 'email';
  return 'registro';
}

/* ------------------------------ Leitura ------------------------------ */

export const TAMANHO_PAGINA = 1000;

/**
 * Le TODAS as linhas de uma consulta, pagina por pagina.
 *
 * Espelha `lerPaginado` de lib/supabase/queries.ts, e existe pelo mesmo
 * motivo: o PostgREST corta toda resposta em `db-max-rows` e NAO devolve erro
 * — devolve menos linhas. Vale tambem para funcao que retorna tabela, que e
 * como o lembrete busca quem avisar.
 *
 * Aqui pesa mais que numa tela. A rotina roda sozinha, de madrugada: quem
 * ficou de fora do corte simplesmente nao e avisado, e ninguem percebe. E o
 * corte nao e aleatorio — a funcao ordena por nome de loja, entao seriam
 * sempre as mesmas lojas, as do fim do alfabeto.
 *
 * O avanco segue o tamanho REAL da resposta e a saida so acontece com pagina
 * vazia: parar quando a pagina vem menor que a pedida encerraria na primeira
 * se o teto do servidor fosse menor que TAMANHO_PAGINA.
 */
export async function lerTudo(buscarPagina, oQue = 'os registros') {
  const linhas = [];

  for (let inicio = 0; ; ) {
    const { data, error } = await buscarPagina(inicio, inicio + TAMANHO_PAGINA - 1);

    if (error) throw new Error(`Nao foi possivel carregar ${oQue}: ${error.message}`);

    const pagina = data ?? [];
    linhas.push(...pagina);
    inicio += pagina.length;

    if (pagina.length === 0) break;
  }

  return linhas;
}
