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
