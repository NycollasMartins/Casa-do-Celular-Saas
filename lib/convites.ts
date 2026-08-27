import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token de convite: geracao, conferencia e prazo.
 *
 * O token e uma CREDENCIAL — quem o tem cria uma rede no sistema. Por isso o
 * banco guarda so o hash, e estas funcoes sao o unico lugar que sabe passar
 * de um para o outro.
 */

/** Trinta dias. Longo o bastante para uma negociacao, curto para um link esquecido. */
export const DIAS_DE_VALIDADE = 30;

/**
 * 256 bits de aleatoriedade criptografica.
 *
 * `base64url` e nao `hex` porque cabe na URL sem escapar nada e ocupa 43
 * caracteres em vez de 64 — o link vai por WhatsApp, e link curto sobrevive
 * melhor a copia e cola.
 */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, sem sal e sem fator de trabalho — de proposito.
 *
 * Isto NAO e uma senha. Senha e curta e escolhida por gente, entao precisa de
 * bcrypt para tornar a adivinhacao cara. Um token de 256 bits nao se adivinha:
 * nao ha dicionario, nao ha reuso entre servicos, e sal nao acrescenta nada
 * quando a entrada ja e unica e aleatoria. O que se quer aqui e so que o
 * conteudo da tabela nao volte a ser um link utilizavel.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compara dois hashes em tempo constante.
 *
 * A busca no banco e por igualdade e nao usa isto — mas qualquer conferencia
 * feita em memoria deve usar, para nao vazar por quanto tempo a comparacao
 * durou. `timingSafeEqual` exige o mesmo tamanho, entao o guard vem antes.
 */
export function hashesIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * O token veio de um link e chega como texto qualquer.
 *
 * Sem esta conferencia, qualquer string vira uma consulta ao banco — o que
 * transforma a rota publica de resgate num caminho barato de sondagem. O
 * formato e fechado: e o alfabeto do `base64url`, no tamanho exato que
 * `gerarToken` produz.
 */
export function pareceToken(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valor);
}

/** Data de expiracao a partir de agora. `agora` e injetavel para o teste. */
export function expiraEm(agora: Date = new Date(), dias = DIAS_DE_VALIDADE): Date {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);
}

/** Monta o link completo. `base` sai de NEXT_PUBLIC_SITE_URL. */
export function linkDoConvite(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/convite/${token}`;
}
