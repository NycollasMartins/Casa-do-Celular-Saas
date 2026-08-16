/**
 * Rate limit simples em memoria: 100 requisicoes por minuto por usuario.
 *
 * ATENCAO: o contador vive no processo. Em serverless (Vercel) cada
 * instancia tem o seu, entao isso segura abuso acidental, nao um ataque.
 * Para producao com varias regioes, troque por Upstash Redis ou pelo
 * rate limit da borda (Vercel WAF).
 */
const JANELA_MS = 60_000;
const LIMITE_PADRAO = 100;

const contadores = new Map<string, { total: number; expiraEm: number }>();

export interface ResultadoRateLimit {
  permitido: boolean;
  restante: number;
  resetEmSegundos: number;
}

export function verificarRateLimit(chave: string, limite = LIMITE_PADRAO): ResultadoRateLimit {
  const agora = Date.now();
  const registro = contadores.get(chave);

  if (!registro || registro.expiraEm <= agora) {
    contadores.set(chave, { total: 1, expiraEm: agora + JANELA_MS });
    return { permitido: true, restante: limite - 1, resetEmSegundos: JANELA_MS / 1000 };
  }

  registro.total++;
  const resetEmSegundos = Math.ceil((registro.expiraEm - agora) / 1000);

  return {
    permitido: registro.total <= limite,
    restante: Math.max(0, limite - registro.total),
    resetEmSegundos,
  };
}

/** Limpa chaves expiradas para a memoria nao crescer sem limite. */
export function limparExpirados(): void {
  const agora = Date.now();
  contadores.forEach((registro, chave) => {
    if (registro.expiraEm <= agora) contadores.delete(chave);
  });
}
