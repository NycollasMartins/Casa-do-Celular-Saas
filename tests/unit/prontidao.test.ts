import { describe, expect, it } from 'vitest';
import { migrationsPelaMetade, schemaCompleto, type ItemDeSchema } from '@/lib/prontidao';

/**
 * Migration pela metade e o estado que mais confunde.
 *
 * Migration inteira faltando e facil: nao rodou. Meia migration engana — a
 * tabela esta la, a funcao nao, e quem olha conclui que ela rodou e que o
 * problema e outro.
 *
 * O caso destes testes foi observado no banco de producao deste projeto:
 * `notificacoes` existia e `agendamentos_para_lembrete` nao, sendo que as duas
 * nascem no mesmo arquivo. A funcao referencia uma coluna da migration
 * anterior, que nao tinha rodado — o arquivo foi colado, criou a tabela e
 * parou no erro.
 */
const item = (nome: string, migration: string, presente: boolean): ItemDeSchema => ({
  item: nome,
  migration,
  presente,
});

describe('migrationsPelaMetade', () => {
  it('aponta a migration com parte dentro e parte fora', () => {
    const schema = [
      item('notificacoes', '007', true),
      item('agendamentos_para_lembrete', '007', false),
      item('vendas', '008', true),
    ];

    expect(migrationsPelaMetade(schema)).toEqual(['007']);
  });

  it('nao aponta migration inteiramente ausente', () => {
    // Essa nao confunde ninguem: a lista de faltando ja diz tudo.
    const schema = [
      item('anonimizado_em', '006', false),
      item('anonimizar_agendamentos_antigos', '006', false),
    ];

    expect(migrationsPelaMetade(schema)).toEqual([]);
  });

  it('nao aponta migration inteiramente presente', () => {
    const schema = [item('vendas', '008', true), item('trg_vendas', '008', true)];

    expect(migrationsPelaMetade(schema)).toEqual([]);
  });

  it('aponta mais de uma, em ordem', () => {
    const schema = [
      item('a', '010', true),
      item('b', '010', false),
      item('c', '007', true),
      item('d', '007', false),
    ];

    expect(migrationsPelaMetade(schema)).toEqual(['007', '010']);
  });

  it('migration de um item so nunca aparece pela metade', () => {
    // Com um objeto so nao ha "metade": ou esta, ou nao esta.
    expect(migrationsPelaMetade([item('x', '004', false)])).toEqual([]);
    expect(migrationsPelaMetade([item('x', '004', true)])).toEqual([]);
  });

  it('o estado real observado em producao', () => {
    // 007 criou a tabela e parou na funcao; 006 e 010 nao rodaram.
    const schema = [
      item('usuarios.status', '004', true),
      item('agendamentos.anonimizado_em', '006', false),
      item('anonimizar_agendamentos_antigos', '006', false),
      item('notificacoes', '007', true),
      item('agendamentos_para_lembrete', '007', false),
      item('vendas', '008', true),
      item('metas', '009', true),
      item('envios_relatorio', '010', true),
      item('resumo_do_periodo', '010', false),
    ];

    expect(schemaCompleto(schema)).toBe(false);
    expect(migrationsPelaMetade(schema)).toEqual(['007', '010']);
  });
});
