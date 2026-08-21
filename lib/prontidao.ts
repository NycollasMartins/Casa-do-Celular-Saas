import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/types/database';

/**
 * Confere se o banco recebeu as migrations que o codigo espera.
 *
 * POR QUE
 * As migrations sao coladas no SQL Editor por uma pessoa. Nada liga o codigo
 * publicado ao schema aplicado: da para subir uma versao que usa `vendas` num
 * banco que nao tem `vendas`, e o erro so aparece quando alguem abre a tela.
 *
 * Este projeto ja viveu isso — parte das migrations aplicada e parte nao,
 * sem ninguem saber quais. Descobrir exigia rodar consulta a mao.
 *
 * COMO
 * PostgREST nao expoe `information_schema`, entao a sondagem e indireta: um
 * `select` de zero linhas na coluna esperada, e uma chamada de funcao com
 * argumento inofensivo. Barato e sem efeito colateral.
 */

export interface ItemDeSchema {
  item: string;
  migration: string;
  presente: boolean;
}

/** `head: true` com `limit(0)`: pergunta pelo formato, nao pelos dados. */
async function colunaExiste(tabela: string, coluna: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from(tabela).select(coluna, { head: true }).limit(0);
    return !error;
  } catch {
    return false;
  }
}

async function tabelaExiste(tabela: string): Promise<boolean> {
  return colunaExiste(tabela, 'id');
}

/**
 * Funcao ausente e funcao invisivel dao a mesma resposta.
 *
 * O PostgREST guarda a lista de funcoes em cache e nao recarrega sozinho —
 * uma funcao recem-criada existe no banco e responde "could not find" pela
 * API. Por isso a mensagem sugere o `notify pgrst` antes de concluir que a
 * migration nao rodou.
 */
type NomeDeFuncao = keyof Database['public']['Functions'];

async function funcaoExiste<N extends NomeDeFuncao>(
  nome: N,
  argumentos: Database['public']['Functions'][N]['Args']
): Promise<boolean> {
  try {
    const { error } = await createAdminClient().rpc(nome, argumentos);
    if (!error) return true;
    return !/could not find|does not exist/i.test(error.message);
  } catch {
    return false;
  }
}

const DATA_INOFENSIVA = '1900-01-01';
const UUID_INOFENSIVO = '00000000-0000-4000-8000-000000000000';

/**
 * Cache curto do resultado.
 *
 * `/api/saude` e aberta e cada conferencia dispara dez consultas. Sem cache,
 * um laco de curl vira amplificacao: uma requisicao barata para quem chama,
 * dez para o banco. Schema nao muda de minuto em minuto — trinta segundos
 * mantem a resposta util depois de rodar uma migration e cortam o abuso.
 */
const VALIDADE_MS = 30_000;
let cache: { em: number; itens: ItemDeSchema[] } | null = null;

/** Existe para o teste nao herdar cache de outro caso. */
export function limparCacheDeSchema(): void {
  cache = null;
}

/**
 * `sondar` e injetavel para o teste do cache nao precisar de rede — sondar de
 * verdade num teste unitario significaria consultar o banco de producao.
 */
export async function conferirSchema(
  agora = Date.now(),
  sondar: () => Promise<ItemDeSchema[]> = sondarSchema
): Promise<ItemDeSchema[]> {
  if (cache && agora - cache.em < VALIDADE_MS) return cache.itens;

  const itens = await sondar();
  cache = { em: agora, itens };
  return itens;
}

async function sondarSchema(): Promise<ItemDeSchema[]> {
  const sondas: Array<[string, string, Promise<boolean>]> = [
    ['usuarios.status', '004', colunaExiste('usuarios', 'status')],
    ['usuarios: trava de campos sensiveis', '005', Promise.resolve(true)],
    ['agendamentos.anonimizado_em', '006', colunaExiste('agendamentos', 'anonimizado_em')],
    ['notificacoes', '007', tabelaExiste('notificacoes')],
    ['vendas', '008', tabelaExiste('vendas')],
    ['metas', '009', tabelaExiste('metas')],
    ['envios_relatorio', '010', tabelaExiste('envios_relatorio')],
    [
      'agendamentos_para_lembrete',
      '007',
      funcaoExiste('agendamentos_para_lembrete', { p_data: DATA_INOFENSIVA }),
    ],
    [
      'anonimizar_agendamentos_antigos',
      '006',
      // Prazo absurdo de proposito: nenhum registro tem 12 mil meses, entao a
      // sondagem nao anonimiza nada.
      funcaoExiste('anonimizar_agendamentos_antigos', { meses: 12_000 }),
    ],
    [
      'resumo_do_periodo',
      '010',
      funcaoExiste('resumo_do_periodo', {
        p_franqueado_id: UUID_INOFENSIVO,
        p_inicio: DATA_INOFENSIVA,
        p_fim: DATA_INOFENSIVA,
      }),
    ],
  ];

  const resultados = await Promise.all(sondas.map(([, , promessa]) => promessa));

  return sondas
    .map(([item, migration], i) => ({ item, migration, presente: resultados[i] }))
    // A trava de campos sensiveis e um trigger: nao da para sondar pela API,
    // e sondar mal seria pior que nao sondar.
    .filter((linha) => linha.item !== 'usuarios: trava de campos sensiveis');
}

export function schemaCompleto(itens: ItemDeSchema[]): boolean {
  return itens.every((item) => item.presente);
}
