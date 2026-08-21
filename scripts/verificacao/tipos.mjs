/**
 * Compara `lib/types/database.ts` com o schema real do banco.
 *
 * POR QUE
 * Os tipos sao escritos a mao e precisam espelhar as migrations. Nada
 * garante isso: uma migration nova entra, o tipo fica para tras, e o
 * TypeScript continua compilando — ele confia no que esta declarado. Foi o
 * que aconteceu com `notificacoes` e `envios_relatorio`, criadas nas
 * migrations e sem tipo por varios commits.
 *
 * O erro que isso produz e do pior tipo: `select('coluna_nova')` compila,
 * roda, e devolve o dado — mas o campo nao existe no tipo, entao o resto do
 * codigo o trata como inexistente. Ou o contrario: um tipo declara coluna
 * que o banco nao tem, e a consulta falha so em producao.
 *
 * Roda dentro de `npm run verificar:banco`, contra o banco descartavel que
 * ja recebeu todas as migrations.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DB = process.env.VERIFICAR_DB ?? 'casa_celular_verificacao';
const CAMINHO_TIPOS = 'lib/types/database.ts';

/** Tabelas expostas pela API e declaradas no tipo Database. */
function tabelasDeclaradas(fonte) {
  const bloco = fonte.match(/Tables:\s*\{([\s\S]*?)\n    \};/);
  if (!bloco) throw new Error('Nao encontrei o bloco Tables em ' + CAMINHO_TIPOS);

  const tabelas = new Map();
  for (const linha of bloco[1].split('\n')) {
    const m = linha.match(/^\s*(\w+):\s*Tabela<(\w+)>;/);
    if (m) tabelas.set(m[1], m[2]);
  }
  return tabelas;
}

/** Campos de um `export type X = { ... }`. */
function camposDoTipo(fonte, nomeTipo) {
  const inicio = fonte.indexOf(`export type ${nomeTipo} = {`);
  if (inicio === -1) throw new Error(`Tipo ${nomeTipo} nao encontrado`);

  // Aceita `}` com ou sem ponto e virgula: contar com um estilo so fez este
  // parser atravessar o fim do tipo e atribuir a ele os campos do seguinte.
  const resto = fonte.slice(inicio);
  const fim = resto.search(/\n\};?\s*\n/);
  if (fim === -1) throw new Error(`Nao encontrei o fim do tipo ${nomeTipo}`);
  const corpo = resto.slice(0, fim);

  const campos = new Set();
  for (const linha of corpo.split('\n')) {
    // Ignora comentarios; pega `nome: tipo;`
    const m = linha.match(/^\s{2}(\w+)(\?)?:\s/);
    if (m) campos.add(m[1]);
  }
  return campos;
}

function colunasDoBanco() {
  const saida = execFileSync(
    'psql',
    [
      '-d', DB, '-t', '-A', '-F', '|', '-c',
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, column_name`,
    ],
    { encoding: 'utf8' }
  );

  const porTabela = new Map();
  for (const linha of saida.trim().split('\n')) {
    if (!linha) continue;
    const [tabela, coluna] = linha.split('|');
    if (!porTabela.has(tabela)) porTabela.set(tabela, new Set());
    porTabela.get(tabela).add(coluna);
  }
  return porTabela;
}

const fonte = readFileSync(CAMINHO_TIPOS, 'utf8');
const declaradas = tabelasDeclaradas(fonte);
const noBanco = colunasDoBanco();

const problemas = [];

// Tabela no banco sem tipo declarado.
for (const tabela of noBanco.keys()) {
  if (!declaradas.has(tabela)) {
    problemas.push(`tabela '${tabela}' existe no banco e nao esta em Database.Tables`);
  }
}

for (const [tabela, nomeTipo] of declaradas) {
  const colunas = noBanco.get(tabela);
  if (!colunas) {
    problemas.push(`tabela '${tabela}' esta declarada e nao existe no banco`);
    continue;
  }

  const campos = camposDoTipo(fonte, nomeTipo);

  for (const coluna of colunas) {
    if (!campos.has(coluna)) {
      problemas.push(`${tabela}.${coluna} existe no banco e falta em ${nomeTipo}`);
    }
  }
  for (const campo of campos) {
    if (!colunas.has(campo)) {
      problemas.push(`${nomeTipo}.${campo} esta declarado e nao existe em ${tabela}`);
    }
  }
}

if (problemas.length > 0) {
  console.error('  Tipos e schema divergem:');
  for (const p of problemas) console.error(`    - ${p}`);
  process.exit(1);
}

const totalColunas = [...declaradas.keys()].reduce(
  (soma, t) => soma + (noBanco.get(t)?.size ?? 0),
  0
);
console.log(`  OK  ${declaradas.size} tabelas e ${totalColunas} colunas conferem com os tipos`);
