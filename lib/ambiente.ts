/**
 * Conferencia da configuracao de ambiente.
 *
 * POR QUE
 * O build passa sem variavel nenhuma — de proposito, e ha um teste de CI que
 * garante isso, porque nenhum modulo le configuracao no carregamento. O
 * efeito colateral e que um deploy mal configurado fica VERDE e so falha em
 * runtime: paginas em 500, link de recuperacao apontando para localhost,
 * lembrete que nunca sai.
 *
 * Esta conferencia transforma esse silencio numa resposta objetiva. Nao
 * expoe valor nenhum: so diz quais nomes faltam e o que deixa de funcionar
 * sem eles.
 */

export type Gravidade = 'impede' | 'degrada';

export interface Problema {
  variavel: string;
  gravidade: Gravidade;
  consequencia: string;
}

interface Requisito {
  variavel: string;
  gravidade: Gravidade;
  consequencia: string;
  /** Confere algo alem da presenca. */
  invalida?: (valor: string) => string | null;
}

const REQUISITOS: Requisito[] = [
  {
    variavel: 'NEXT_PUBLIC_SUPABASE_URL',
    gravidade: 'impede',
    consequencia: 'Nenhuma pagina carrega: nao ha banco para consultar.',
  },
  {
    variavel: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    gravidade: 'impede',
    consequencia: 'Ninguem consegue entrar: o login nao alcanca o Supabase.',
  },
  {
    variavel: 'SUPABASE_SERVICE_ROLE_KEY',
    gravidade: 'impede',
    consequencia: 'Criar usuario falha — a Admin API precisa desta chave.',
  },
  {
    variavel: 'NEXT_PUBLIC_SITE_URL',
    gravidade: 'impede',
    consequencia: 'O link de recuperacao de senha aponta para o lugar errado.',
    invalida: (valor) => {
      // O erro classico do primeiro deploy: sobe com o valor de
      // desenvolvimento e o link do e-mail manda o usuario para a maquina
      // dele. Falha silenciosa — o e-mail chega, o link nao funciona.
      if (/localhost|127\.0\.0\.1/.test(valor)) {
        return 'aponta para localhost; em producao precisa ser o dominio publico';
      }
      if (!/^https?:\/\//.test(valor)) return 'precisa comecar com http:// ou https://';
      return null;
    },
  },
  {
    variavel: 'UPSTASH_REDIS_REST_URL',
    gravidade: 'degrada',
    consequencia: 'Rate limit cai para memoria: vale por instancia, nao pela rede.',
  },
  {
    variavel: 'NEXT_PUBLIC_SENTRY_DSN',
    gravidade: 'degrada',
    consequencia: 'Erros de runtime nao sao reportados a lugar nenhum.',
  },
];

/**
 * `producao` separa o que e problema de verdade do que e normal em
 * desenvolvimento — apontar para localhost so e erro quando nao se esta nele.
 */
export function conferirAmbiente(
  ambiente: Record<string, string | undefined> = process.env,
  producao = ambiente.NODE_ENV === 'production'
): Problema[] {
  const problemas: Problema[] = [];

  for (const requisito of REQUISITOS) {
    const valor = ambiente[requisito.variavel]?.trim();

    if (!valor) {
      problemas.push({
        variavel: requisito.variavel,
        gravidade: requisito.gravidade,
        consequencia: requisito.consequencia,
      });
      continue;
    }

    if (!producao) continue;

    const motivo = requisito.invalida?.(valor);
    if (motivo) {
      problemas.push({
        variavel: requisito.variavel,
        gravidade: requisito.gravidade,
        consequencia: motivo,
      });
    }
  }

  return problemas;
}

export function ambienteSaudavel(problemas: Problema[]): boolean {
  return !problemas.some((problema) => problema.gravidade === 'impede');
}
