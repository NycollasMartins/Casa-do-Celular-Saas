/**
 * Rate limit de 100 requisicoes por minuto por usuario e rota.
 *
 * Duas implementacoes, escolhidas em tempo de execucao:
 *
 * 1. UPSTASH — quando UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN
 *    existem. O contador e compartilhado por todas as instancias, que e o
 *    que faz o limite valer de verdade na Vercel.
 *
 * 2. MEMORIA — fallback. Cada instancia serverless tem o proprio contador,
 *    entao segura engano de usuario, nao abuso coordenado. Serve para
 *    desenvolvimento e para o sistema nao parar se o Redis cair.
 *
 * Usa a API REST do Upstash via fetch, sem SDK: sao duas chamadas em
 * pipeline e evita mais uma dependencia no bundle.
 */
const JANELA_MS = 60_000;
const JANELA_S = 60;
const LIMITE_PADRAO = 100;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Redis configurado? Definido uma vez, no carregamento do modulo. */
export const rateLimitDistribuido = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

export interface ResultadoRateLimit {
  permitido: boolean;
  restante: number;
  resetEmSegundos: number;
  /** Qual implementacao respondeu. Util em log e em teste. */
  origem: 'upstash' | 'memoria';
}

/* ----------------------------- Em memoria ---------------------------- */

const contadores = new Map<string, { total: number; expiraEm: number }>();

/**
 * Teto de chaves distintas guardadas.
 *
 * `limparExpirados` sozinha nao basta: ela existia desde o inicio e nunca foi
 * chamada de lugar nenhum — funcao escrita para impedir um vazamento que nao
 * impedia. E mesmo chamada, ela so remove o que ja venceu; numa enxurrada de
 * identificadores diferentes dentro da MESMA janela de um minuto, nada vence
 * e o mapa cresce igual.
 *
 * A rota aberta de saude usa o IP como chave. Com identificador falsificavel,
 * "chaves distintas por minuto" e um numero que quem chama escolhe.
 */
const MAXIMO_DE_CHAVES = 10_000;

function conterCrescimento(): void {
  // Roda ANTES da insercao, entao precisa abrir espaco para a chave que vem a
  // seguir: podar ate o teto exato deixaria o mapa com teto + 1.
  const alvo = MAXIMO_DE_CHAVES - 1;

  if (contadores.size <= alvo) return;

  limparExpirados();
  if (contadores.size <= alvo) return;

  // Ainda cheio: a janela inteira e recente. Descarta as que reabrem primeiro,
  // que sao as mais proximas de sumir de qualquer forma.
  const porVencimento = [...contadores.entries()].sort((a, b) => a[1].expiraEm - b[1].expiraEm);
  for (const [chave] of porVencimento.slice(0, contadores.size - alvo)) {
    contadores.delete(chave);
  }
}

function verificarEmMemoria(chave: string, limite: number): ResultadoRateLimit {
  conterCrescimento();

  const agora = Date.now();
  const registro = contadores.get(chave);

  if (!registro || registro.expiraEm <= agora) {
    contadores.set(chave, { total: 1, expiraEm: agora + JANELA_MS });
    return { permitido: true, restante: limite - 1, resetEmSegundos: JANELA_S, origem: 'memoria' };
  }

  registro.total++;

  return {
    permitido: registro.total <= limite,
    restante: Math.max(0, limite - registro.total),
    resetEmSegundos: Math.ceil((registro.expiraEm - agora) / 1000),
    origem: 'memoria',
  };
}

/* ------------------------------- Upstash ------------------------------ */

/**
 * Janela fixa: INCR cria a chave zerada e devolve o total; o EXPIRE com NX
 * so marca a validade na primeira requisicao da janela, para o prazo nao
 * ser empurrado a cada acesso.
 */
async function verificarNoUpstash(chave: string, limite: number): Promise<ResultadoRateLimit> {
  const resposta = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', chave],
      ['EXPIRE', chave, String(JANELA_S), 'NX'],
      ['TTL', chave],
    ]),
    cache: 'no-store',
  });

  if (!resposta.ok) throw new Error(`Upstash respondeu ${resposta.status}`);

  const retorno = (await resposta.json()) as { result?: number; error?: string }[];
  const erro = retorno.find((item) => item.error)?.error;
  if (erro) throw new Error(erro);

  const total = Number(retorno[0]?.result ?? 0);
  const ttl = Number(retorno[2]?.result ?? JANELA_S);

  return {
    permitido: total <= limite,
    restante: Math.max(0, limite - total),
    // TTL negativo significa chave sem expiracao definida; cai na janela cheia.
    resetEmSegundos: ttl > 0 ? ttl : JANELA_S,
    origem: 'upstash',
  };
}

/* -------------------------------- API -------------------------------- */

export async function verificarRateLimit(chave: string, limite = LIMITE_PADRAO): Promise<ResultadoRateLimit> {
  if (!rateLimitDistribuido) return verificarEmMemoria(chave, limite);

  try {
    return await verificarNoUpstash(chave, limite);
  } catch (excecao) {
    // Redis fora do ar nao pode derrubar o sistema inteiro: degrada para o
    // contador local, que ainda barra o caso mais grosseiro.
    console.error('[rate-limit] Upstash indisponivel, usando memoria:', excecao);
    return verificarEmMemoria(chave, limite);
  }
}

/** Remove o que ja venceu. Chamada por `conterCrescimento`, nao sozinha. */
export function limparExpirados(): void {
  const agora = Date.now();
  contadores.forEach((registro, chave) => {
    if (registro.expiraEm <= agora) contadores.delete(chave);
  });
}

/** Quantas chaves o contador local guarda agora. Existe para o teste medir. */
export function chavesEmMemoria(): number {
  return contadores.size;
}

/** Zera o estado local. Existe para os testes nao vazarem contagem entre si. */
export function reiniciarContadores(): void {
  contadores.clear();
}
