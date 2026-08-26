import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ha DUAS listas escritas a mao do que o banco deve conter: o bloco de
 * CONFERENCIA em scripts/gerar-consolidado.mjs e a sondagem em
 * lib/prontidao.ts. O gerador tirou o *conteudo* do consolidado das
 * migrations, mas a lista que confere o resultado continuou manual — a mesma
 * armadilha que ele existe para eliminar, um nivel abaixo.
 *
 * Custou dois triggers: trg_vendas_updated_at e trg_metas_updated_at foram
 * criados pelas migrations 008 e 009 e nunca conferidos. Se a migration
 * falhasse entre o `create table` e o `create trigger`, a conferencia
 * responderia `vendas OK` e o updated_at ficaria congelado sem aviso.
 *
 * Este teste deriva o esperado das proprias migrations. Objeto novo sem
 * conferencia reprova, a menos que esteja isento AQUI, com motivo escrito.
 */

const PASTA = 'supabase/migrations';
const DEPOIS_DO_SEED = '20250101000002_seed.sql';

const migrations = readdirSync(PASTA)
  .filter((n) => n.endsWith('.sql') && n > DEPOIS_DO_SEED)
  .map((n) => readFileSync(join(PASTA, n), 'utf8'))
  .join('\n');

function capturar(padrao: RegExp): string[] {
  return [...new Set([...migrations.matchAll(padrao)].map((m) => m.slice(1).join('.')))];
}

const tabelas = capturar(/create table if not exists\s+(?:public\.)?(\w+)/gi);
const colunas = capturar(/alter table\s+(?:public\.)?(\w+)\s+add column if not exists\s+(\w+)/gi);
const funcoes = capturar(/create (?:or replace )?function\s+(?:public\.)?(\w+)/gi);
const triggers = capturar(/create trigger\s+(\w+)/gi);

/**
 * Isencoes. Cada uma e uma decisao, nao um esquecimento — por isso precisam
 * de motivo escrito para entrar na lista.
 */
const ISENTOS: Record<string, string> = {
  // Um trigger nao existe sem a funcao que ele executa: conferir o trigger
  // ja prova que a funcao esta la.
  protege_campos_sensiveis_usuario: 'corpo de trg_usuarios_campos_sensiveis',
  status_respeita_venda: 'corpo de trg_agendamentos_status_venda',
  venda_exige_comparecimento: 'corpo de trg_vendas_exige_comparecimento',
  vinculo_exige_mesmo_tenant: 'corpo de trg_agendadores_lojas_tenant e trg_participacoes_tenant',

  // Nascem na migration 002 e sao REESCRITAS pela 004 para respeitar
  // usuarios.status. Existir elas ja existem antes do consolidado rodar:
  // conferir presenca responderia OK mesmo se a 004 nunca tivesse rodado.
  // Confianca falsa e pior que lacuna conhecida — quem cobre isso de verdade
  // sao as assercoes de RLS em scripts/verificacao/99-assercoes.sql, que
  // testam comportamento, nao existencia.
  is_super_admin: 'reescrita pela 004; existencia nao prova versao',
  pode_gerenciar: 'reescrita pela 004; existencia nao prova versao',
  usuario_role: 'reescrita pela 004; existencia nao prova versao',
  usuario_franqueado_id: 'reescrita pela 004; existencia nao prova versao',
};

describe('bloco de CONFERENCIA do consolidado', () => {
  const gerador = readFileSync('scripts/gerar-consolidado.mjs', 'utf8');
  const bloco = gerador.slice(gerador.indexOf('with esperado(item'));
  const conferidos = new Set(
    [...bloco.matchAll(/\('([\w.]+)',\s*'(?:coluna|tabela|trigger|funcao)'/g)].map((m) => m[1])
  );

  it.each([
    ['tabela', tabelas],
    ['coluna', colunas],
    ['funcao', funcoes],
    ['trigger', triggers],
  ])('confere toda %s criada depois do seed', (_tipo, criados) => {
    const ausentes = criados.filter((nome) => !conferidos.has(nome) && !(nome in ISENTOS));

    expect(ausentes).toEqual([]);
  });

  it('nao confere nada que as migrations nao criam', () => {
    const universo = new Set([...tabelas, ...colunas, ...funcoes, ...triggers]);
    const fantasmas = [...conferidos].filter((nome) => !universo.has(nome));

    expect(fantasmas).toEqual([]);
  });

  it('toda isencao ainda corresponde a um objeto existente', () => {
    // Isencao orfa e lixo que esconde a proxima: se o objeto sumiu, a linha
    // precisa sumir junto.
    const universo = new Set([...funcoes, ...triggers, ...tabelas]);
    const orfas = Object.keys(ISENTOS).filter((nome) => !universo.has(nome));

    expect(orfas).toEqual([]);
  });
});

describe('cada migration aparece na conferencia', () => {
  /**
   * A regra acima cobre objetos CRIADOS depois do seed. Migration que so
   * SUBSTITUI passa por fora dela: nao cria tabela, nem funcao nova, nem
   * trigger — troca o corpo de uma funcao que ja existia, ou uma policy.
   *
   * Foi exatamente o que aconteceu com as duas ultimas, que fecham escalada
   * de privilegio. O bloco de conferencia dizia OK sem elas terem rodado,
   * porque conferia a PRESENCA do trigger, e ele existe desde a 005. Quem
   * colasse o arquivo veria tudo verde e concluiria que aplicou as correcoes.
   *
   * Esta regra e por MIGRATION, nao por objeto: cada arquivo posterior ao
   * seed precisa aparecer na conferencia, seja por um objeto que ele cria,
   * seja pelo proprio numero.
   */
  const gerador = readFileSync('scripts/gerar-consolidado.mjs', 'utf8');
  const bloco = gerador.slice(gerador.indexOf('with esperado(item'));

  const posteriores = readdirSync('supabase/migrations')
    .filter((nome) => nome.endsWith('.sql') && nome > '20250101000002_seed.sql')
    .sort();

  it.each(posteriores)('%s tem algo conferido', (nome) => {
    const fonte = readFileSync(`supabase/migrations/${nome}`, 'utf8');
    const numero = fonte.match(/^--\s*(\d{3})\s*-/m)?.[1];

    const objetos = [
      ...fonte.matchAll(/create table if not exists\s+(?:public\.)?(\w+)/gi),
      ...fonte.matchAll(/create (?:or replace )?function\s+(?:public\.)?(\w+)/gi),
      ...fonte.matchAll(/create trigger\s+(\w+)/gi),
      ...fonte.matchAll(/add column if not exists\s+(\w+)/gi),
    ].map((m) => m[1]);

    const citada =
      (numero !== undefined && bloco.includes(`'${numero} ·`)) ||
      objetos.some((objeto) => bloco.includes(`'${objeto}'`) || bloco.includes(`.${objeto}'`));

    expect(citada, `a migration ${nome} nao e verificavel pelo bloco de conferencia`).toBe(true);
  });
});

describe('sondagem de /api/saude', () => {
  const prontidao = readFileSync('lib/prontidao.ts', 'utf8');
  const sondados = new Set(
    [...prontidao.matchAll(/\[\s*'([\w.]+)',\s*'\d{3}'/g)].map((m) => m[1])
  );

  // Triggers ficam de fora por inteiro: o PostgREST nao os expoe, e sondar
  // mal seria pior que nao sondar. Esta documentado em lib/prontidao.ts.
  it.each([
    ['tabela', tabelas],
    ['coluna', colunas],
  ])('sonda toda %s criada depois do seed', (_tipo, criados) => {
    const ausentes = criados.filter((nome) => !sondados.has(nome));

    expect(ausentes).toEqual([]);
  });
});
