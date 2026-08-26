import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tela de Relatorios precisa de duas agregacoes do MESMO periodo: o resumo
 * geral e o recorte por loja. Ela pedia as duas separadamente, e cada funcao
 * varre o periodo inteiro e depois busca as vendas — entao a tela pagava tudo
 * em dobro, agendamentos e vendas.
 *
 * O mesmo desperdicio ja tinha sido encontrado e corrigido em
 * `desempenhoNaCompetencia`, cujo comentario descreve exatamente este caso.
 * Faltou na tela de Relatorios.
 *
 * O custo nao e so do banco: a leitura completa sai do Supabase por HTTP, em
 * paginas. Dobrar a leitura dobra o numero de idas e voltas.
 *
 * Uma regressao aqui nao aparece na tela — os numeros continuam certos, so
 * demoram o dobro. Por isso o teste conta consultas.
 */

const consultas: string[] = [];

function construtor(tabela: string) {
  const alvo: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lte', 'order', 'eq', 'in', 'or', 'limit']) {
    alvo[metodo] = () => alvo;
  }
  alvo.range = (de: number) =>
    // Uma pagina com uma linha e depois vazia: encerra o laco de paginacao.
    Promise.resolve({ data: de === 0 ? [{ id: 'a1', status: 'agendado', loja_id: 'l1', data_agendamento: '2026-08-10', agendador_id: 'u1' }] : [], error: null });
  return alvo;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (tabela: string) => {
      consultas.push(tabela);
      return construtor(tabela);
    },
  }),
}));

const { calcularMetricasEPorLoja, calcularMetricas, calcularMetricasPorLoja } = await import(
  '@/lib/supabase/queries'
);

const FILTROS = { dataInicio: '2026-08-01', dataFim: '2026-08-31' };

describe('leitura unica na tela de Relatorios', () => {
  beforeEach(() => {
    consultas.length = 0;
  });

  it('a versao combinada le agendamentos uma vez so', async () => {
    await calcularMetricasEPorLoja(FILTROS);

    const paginas = consultas.filter((t) => t === 'agendamentos').length;

    // Duas chamadas de `range` para uma leitura completa: a pagina com dados
    // e a pagina vazia que encerra o laco.
    expect(paginas).toBe(2);
  });

  it('e devolve as duas agregacoes', async () => {
    const { metricas, porLoja } = await calcularMetricasEPorLoja(FILTROS);

    expect(metricas).toBeDefined();
    expect(Array.isArray(porLoja)).toBe(true);
  });

  it('pedir separado custa o dobro — e o que a tela fazia', async () => {
    await calcularMetricas(FILTROS);
    const umaSo = consultas.filter((t) => t === 'agendamentos').length;

    consultas.length = 0;
    await calcularMetricas(FILTROS);
    await calcularMetricasPorLoja(FILTROS);
    const asDuas = consultas.filter((t) => t === 'agendamentos').length;

    expect(asDuas).toBe(umaSo * 2);
  });
});

describe('quem importa os graficos, e quem le duas vezes', () => {
  const telas = execSync("find app -name 'page.tsx'", { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  it('nenhuma tela importa o container de graficos direto', () => {
    /**
     * A biblioteca de graficos custa ~108 kB de JavaScript. Importada direto,
     * ela entra no carregamento INICIAL da tela — antes de qualquer numero
     * aparecer. `charts-lazy` existe para carrega-la depois.
     *
     * Medido: /dashboard caiu de 268 kB para 160 kB, e /admin/metricas-gerais
     * de 241 kB para 132 kB.
     */
    const direto = telas.filter((caminho) =>
      readFileSync(caminho, 'utf8').includes("from '@/components/dashboard/charts-container'")
    );

    expect(direto).toEqual([]);
  });

  it('o carregamento tardio nao arrasta a biblioteca de volta', () => {
    // A primeira tentativa nao funcionou: `charts-lazy` importava o esqueleto
    // de `charts-container`, e isso puxava a biblioteca inteira para o pedaco
    // inicial. O dashboard continuou em 269 kB ate o esqueleto sair de la.
    const lazy = readFileSync('components/dashboard/charts-lazy.tsx', 'utf8');
    const estaticos = [...lazy.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);

    expect(estaticos).not.toContain('./charts-container');
  });

  it('nenhuma tela pede as duas agregacoes separadas', () => {
    // Cada uma varre o periodo inteiro e busca as vendas. Pedir as duas custa
    // tudo em dobro — e a leitura sai do Supabase por HTTP, em paginas.
    const emDobro = telas.filter((caminho) => {
      const fonte = readFileSync(caminho, 'utf8');
      return fonte.includes('calcularMetricas(') && fonte.includes('calcularMetricasPorLoja(');
    });

    expect(emDobro).toEqual([]);
  });
});

describe('peso das telas de lista', () => {
  /**
   * Formulario arrasta a validacao e o controle de formulario — cerca de
   * oitenta kilobytes. Numa tela de LISTA isso e pago em toda visita para
   * atender ao clique que acontece as vezes.
   *
   * Medido no build:
   *   /dashboard/lojas        168 kB -> 113 kB
   *   /admin/franqueados      167 kB -> 113 kB
   *   /dashboard/usuarios     170 kB -> 124 kB
   *
   * As duas telas em que o formulario E o proposito ficam de fora: ali nao ha
   * o que adiar.
   */
  const O_FORMULARIO_E_A_TELA = [
    'app/dashboard/agendamentos/novo/page.tsx',
    'app/dashboard/agendamentos/[id]/page.tsx',
  ];

  /**
   * O criterio e o PESO, nao a pasta.
   *
   * A primeira versao deste teste reprovava qualquer import estatico de
   * `components/forms/`, e acusou dois arquivos ja corrigidos: eles importam
   * `CredencialProvisoria`, que mora ali mas nao e formulario — nao carrega
   * validacao nem controle de formulario, e pesa quase nada.
   *
   * O que custa e `react-hook-form`. Entao e ele que o teste procura.
   */
  function ehPesado(modulo: string): boolean {
    const caminho = modulo.replace('@/', '') + '.tsx';
    try {
      return readFileSync(caminho, 'utf8').includes("from 'react-hook-form'");
    } catch {
      return false;
    }
  }

  const arquivos = execSync("find app components -name '*.tsx'", { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  it('so as telas de formulario carregam react-hook-form de forma estatica', () => {
    const estaticos = arquivos.filter((caminho) => {
      if (O_FORMULARIO_E_A_TELA.includes(caminho)) return false;

      const fonte = readFileSync(caminho, 'utf8');
      // O proprio formulario importa react-hook-form: e o que ele e.
      if (fonte.includes("from 'react-hook-form'")) return false;

      return [...fonte.matchAll(/^import \{[^}]*\} from '(@\/components\/forms\/[a-z-]+)'/gm)].some(
        (m) => ehPesado(m[1])
      );
    });

    expect(estaticos).toEqual([]);
  });

  it('nao ha isencao orfa', () => {
    const orfas = O_FORMULARIO_E_A_TELA.filter((caminho) => !arquivos.includes(caminho));

    expect(orfas).toEqual([]);
  });
});
