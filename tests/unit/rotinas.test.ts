import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * As rotinas agendadas.
 *
 * O sistema anuncia tres — lembrete da vespera, resumo semanal e varredura de
 * retencao — e por muito tempo nenhuma rodava: eram scripts esperando alguem
 * digitar o comando.
 *
 * O QUE ESTE TESTE PEGA
 * Um cron dispara o workflow INTEIRO, e cada job decide se e com ele. A
 * primeira versao do lembrete perguntava apenas `github.event_name ==
 * 'schedule'`, que casa com qualquer um dos tres horarios: ele rodaria as
 * segundas de manha e no dia 1o tambem, fora da hora para que foi desenhado.
 *
 * Nao da para rodar o GitHub Actions aqui, mas da para conferir que cada job
 * esta amarrado a UM cron — que e onde o erro mora.
 */
const arquivo = readFileSync('.github/workflows/rotinas.yml', 'utf8');

/**
 * Le o YAML por texto, de proposito. `js-yaml` esta no projeto como
 * dependencia transitiva, sem tipos e sem promessa de continuar la; um teste
 * de guarda nao deve depender de algo que ninguem declarou precisar.
 */
const crons = [...arquivo.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);

/**
 * Cada job: do nome ate o `steps:` dele. E nessa faixa que mora o `if:`.
 *
 * A busca comeca depois de `jobs:` porque `schedule:` fica no mesmo nivel de
 * indentacao dentro de `on:` — sem o corte, ele entrava na lista como se
 * fosse uma rotina.
 */
const secaoJobs = arquivo.slice(arquivo.indexOf('\njobs:'));

const jobs = Object.fromEntries(
  [...secaoJobs.matchAll(/^ {2}(\w+):$/gm)].map((m) => {
    const inicio = m.index ?? 0;
    const passos = secaoJobs.indexOf('    steps:', inicio);
    return [m[1], secaoJobs.slice(inicio, passos === -1 ? undefined : passos)];
  })
);

const opcoesManuais = (arquivo.match(/options: \[([^\]]+)\]/)?.[1] ?? '')
  .split(',')
  .map((o) => o.trim());

describe('rotinas agendadas', () => {
  it('ha um cron para cada rotina', () => {
    // Derivado, e nao cravado: um numero fixo aqui viraria mais uma lista da
    // mesma verdade para divergir, e a comparacao entre jobs e o menu manual
    // ja e feita mais abaixo.
    expect(crons).toHaveLength(Object.keys(jobs).length);
  });

  it.each(Object.entries(jobs))('o job %s esta amarrado a UM cron', (_nome, condicao) => {
    const seus = crons.filter((cron) => condicao.includes(cron));

    // Zero significa "roda em todos"; mais de um, que dois horarios o
    // acionam. Os dois casos sao o mesmo defeito.
    expect(seus).toHaveLength(1);
  });

  it.each(crons)('o cron %s pertence a exatamente um job', (cron) => {
    // A direcao inversa. Conferir so "cada job tem um cron" deixa passar dois
    // jobs apontando para o MESMO horario — a retencao rodando junto com o
    // lembrete, por exemplo, o que aqui significaria anonimizar todo dia em
    // vez de uma vez por mes.
    const donos = Object.entries(jobs)
      .filter(([, condicao]) => condicao.includes(cron))
      .map(([nome]) => nome);

    expect(donos).toHaveLength(1);
  });

  it('cada rotina pode ser disparada a mao', () => {
    expect(opcoesManuais.sort()).toEqual(Object.keys(jobs).sort());
  });

  it('a retencao exige um segredo proprio para alterar dado', () => {
    // As outras duas so mandam mensagem: sem credencial de canal nao sai
    // nada. A retencao APAGA. Se dependesse apenas das chaves do Supabase,
    // ligar o lembrete ligaria de carona a eliminacao irreversivel.
    const bloco = arquivo.slice(arquivo.indexOf('  retencao:'));

    expect(bloco).toContain('LGPD_RETENCAO_MESES');
    expect(bloco).toContain('--seco');
  });
});
