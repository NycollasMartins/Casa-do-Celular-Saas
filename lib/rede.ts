/**
 * Identifica quem esta chamando, para rotas sem sessao.
 *
 * POR QUE NAO SERVE LER `x-forwarded-for` DIRETO
 * Esse cabecalho e enviado pelo CLIENTE. A plataforma acrescenta o IP real,
 * mas nao apaga o que veio: quem manda `X-Forwarded-For: 1.2.3.4` aparece
 * como 1.2.3.4 para quem le o primeiro valor da lista.
 *
 * Numa rota aberta com teto por IP, isso significa duas coisas — o teto some,
 * porque basta trocar o valor a cada requisicao; e o contador em memoria
 * ganha uma chave nova por requisicao, o que transforma o limitador em
 * consumo de memoria.
 *
 * Os cabecalhos abaixo sao escritos pela borda e sobrescrevem o que o cliente
 * mandar. Por isso vem antes.
 */
const CABECALHOS_CONFIAVEIS = [
  'x-nf-client-connection-ip', // Netlify
  'cf-connecting-ip', // Cloudflare
  'true-client-ip', // Akamai e Cloudflare Enterprise
  'x-real-ip', // nginx, quando configurado pela borda
];

export function ipDoCliente(cabecalhos: Headers): string {
  for (const nome of CABECALHOS_CONFIAVEIS) {
    const valor = cabecalhos.get(nome)?.trim();
    if (valor) return valor;
  }

  // Ultimo recurso, e reconhecidamente falsificavel: sem cabecalho da
  // plataforma nao ha como distinguir o IP real do que o cliente inventou.
  // Melhor um identificador fraco que um so identificador para todo mundo,
  // que faria uma pessoa esgotar o teto de todas as outras.
  const encaminhado = cabecalhos.get('x-forwarded-for');
  const primeiro = encaminhado?.split(',')[0]?.trim();

  return primeiro || 'desconhecido';
}

/* --------------------- Destino de redirecionamento --------------------- */

/**
 * Base descartavel so para resolver o caminho como o navegador resolveria.
 * O host nao importa: o que interessa e se o valor CONSEGUE trocar de origem.
 */
const BASE_DE_TESTE = 'https://exemplo.invalid';

/**
 * Valida o `?redirect=` antes de navegar para ele.
 *
 * POR QUE
 * A tela de login mandava `router.push(searchParams.get('redirect'))` sem
 * conferir nada. Basta um link `?redirect=//evil.com` para a pessoa
 * autenticar no dominio verdadeiro, com certificado verdadeiro, e ser jogada
 * num site alheio logo em seguida — que e o formato classico de phishing: a
 * parte que a vitima confere e legitima.
 *
 * Nao basta procurar "http" no comeco. Estas quatro formas saem do site, e
 * duas nao parecem: `//evil.com`, `/\evil.com` (o navegador normaliza a barra
 * invertida), `https://evil.com` e `%2F%2Fevil.com` (o searchParams decodifica
 * antes de entregar).
 *
 * Por isso a conferencia usa a MESMA resolucao que o navegador faz, em vez de
 * casar padroes a mao: se resolver para outra origem, nao serve. O retorno e
 * so caminho, busca e ancora — qualquer host que tenha vindo junto fica pelo
 * caminho.
 */
export function destinoSeguro(valor: string | null | undefined, padrao = '/dashboard'): string {
  if (!valor) return padrao;

  try {
    const destino = new URL(valor, BASE_DE_TESTE);

    if (destino.origin !== BASE_DE_TESTE) return padrao;

    return `${destino.pathname}${destino.search}${destino.hash}`;
  } catch {
    return padrao;
  }
}
