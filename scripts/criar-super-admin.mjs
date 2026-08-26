/**
 * Cria a PRIMEIRA conta de super admin de uma instalacao.
 *
 *   npm run admin:criar -- --nome "Nome Completo" --email pessoa@dominio.com
 *
 * POR QUE ISTO EXISTE
 * Nao ha auto-cadastro nesta aplicacao — de proposito: toda conta pertence a
 * um franqueado e precisa de loja e papel definidos, e quem cria e o gestor
 * (app/auth/register/page.tsx e so um aviso explicando isso).
 *
 * O efeito colateral e um ovo-e-galinha na instalacao: sem nenhuma conta, nao
 * ha quem crie a primeira. Ate aqui o unico caminho era `npm run seed:auth`,
 * que resolve o bootstrap junto com 21 contas de exemplo, e-mails previsiveis
 * e uma senha compartilhada que o middleware nunca obriga a trocar. Isso e
 * material de desenvolvimento. No banco de um cliente seria uma porta aberta.
 *
 * Este script faz o minimo: UMA conta, papel super_admin, senha aleatoria
 * marcada como provisoria, e nenhum dado de negocio. Franqueado, lojas e
 * equipe o cliente cadastra pela tela, que e onde as regras de tenant valem.
 *
 * SOBRE O SERVICE ROLE
 * A Admin API exige a chave de servico, que ignora RLS. O trigger de campos
 * sensiveis (migration 013) deixa esse caminho passar porque `auth.uid()` e
 * nulo nele — a barreira dele e contra um franqueado logado se promover, nao
 * contra a automacao. Por isso este script PRECISA se policiar sozinho, e a
 * recusa abaixo e a policia.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Carrega .env.local sem dependencia externa. Igual ao seed: os scripts rodam
// com `node` puro, sem passar pelo build do Next.
try {
  for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env.local ausente: usa variaveis ja exportadas no shell.
}

/* ----------------------------- Argumentos ----------------------------- */

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1].trim();
  }
  const colado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return colado ? colado.slice(nome.length + 3).trim() : undefined;
}

const USO =
  'Uso: npm run admin:criar -- --nome "Nome Completo" --email pessoa@dominio.com';

const nome = argumento('nome');
const email = argumento('email')?.toLowerCase();

if (!nome || !email) {
  console.error(`Informe nome e e-mail.\n\n${USO}`);
  process.exit(1);
}

// Conferencia deliberadamente frouxa: e-mail so se valida entregando. O que
// importa aqui e barrar o erro de digitacao que criaria uma conta inalcancavel.
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error(`"${email}" nao parece um e-mail.\n\n${USO}`);
  process.exit(1);
}

if (nome.length < 2) {
  console.error('O nome precisa de pelo menos 2 caracteres.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Preencha o .env.local (veja .env.example) ou exporte as duas no shell.'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const host = new URL(url).host;

/* ------------------------------- Recusa ------------------------------- */

/**
 * Um super admin enxerga a rede inteira: todos os franqueados, todas as
 * lojas, todos os agendamentos. Criar um segundo "sem querer" — rodando o
 * comando duas vezes, ou rodando contra o banco errado — e o tipo de engano
 * que ninguem percebe, porque nada quebra.
 *
 * Contas inativas contam. Status 'inativo' tira o acesso hoje, mas alguem com
 * a tela de Equipe reativa; o que a recusa quer saber e se este banco JA foi
 * inicializado, e uma conta desligada responde que sim.
 */
const { data: existentes, error: erroConsulta } = await admin
  .from('usuarios')
  .select('email, status')
  .eq('role', 'super_admin');

if (erroConsulta) {
  console.error(
    `Nao foi possivel consultar os usuarios de ${host}: ${erroConsulta.message}\n\n` +
      'Se a mensagem fala em relacao inexistente, o schema ainda nao foi aplicado:\n' +
      'cole supabase/migrations/20250101000000_schema.sql no SQL Editor antes deste passo.'
  );
  process.exit(1);
}

if (existentes.length > 0) {
  const lista = existentes
    .map((u) => `  ${u.email}${u.status === 'inativo' ? '  (inativo)' : ''}`)
    .join('\n');

  console.error(
    `${host} ja tem ${existentes.length === 1 ? 'um super admin' : `${existentes.length} super admins`}:\n\n` +
      `${lista}\n\n` +
      'Este script so faz o bootstrap — a primeira conta, quando nao ha nenhuma.\n' +
      'Daqui em diante o caminho e a tela:\n\n' +
      '  · esqueceu a senha        entre como super admin e use Equipe > gerar nova senha\n' +
      '  · quer outro super admin  crie por Equipe, ja logado\n' +
      '  · banco errado            confira para onde NEXT_PUBLIC_SUPABASE_URL aponta'
  );
  process.exit(1);
}

/* ------------------------------- Criacao ------------------------------ */

/**
 * Senha aleatoria de uso unico. Mais longa que a do cadastro pela tela
 * (app/actions/cadastros.ts) porque esta abre a conta mais poderosa da
 * instalacao e costuma trafegar por WhatsApp ou e-mail ate a troca.
 *
 * O sufixo fixo garante os requisitos de complexidade do GoTrue sem depender
 * da sorte do sorteio.
 */
const senhaProvisoria = randomBytes(15).toString('base64url') + 'A1!';

const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
  email,
  password: senhaProvisoria,
  email_confirm: true,
  // Sem isto o middleware nao obriga a troca e a senha gerada aqui vale para
  // sempre — que e exatamente o defeito do seed.
  user_metadata: { nome, senha_provisoria: true },
});

if (erroAuth || !criado.user) {
  const mensagem = erroAuth?.message ?? 'motivo nao informado';

  if (/already been registered|already exists/i.test(mensagem)) {
    console.error(
      `Ja existe uma conta de login com ${email} em ${host}, mas ela nao tem perfil\n` +
        'de super admin na tabela usuarios. Sobrou de uma tentativa anterior ou de outro papel.\n\n' +
        'Resolva escolhendo um:\n' +
        '  · use outro e-mail neste comando; ou\n' +
        '  · apague a conta em Authentication > Users no painel do Supabase e rode de novo.\n\n' +
        'Nao apago por conta propria: se o e-mail for de alguem que ja usa o sistema,\n' +
        'apagar levaria junto o vinculo com a loja.'
    );
  } else {
    console.error(`Nao foi possivel criar a conta de login: ${mensagem}`);
  }
  process.exit(1);
}

// franqueado_id fica nulo: super admin nao pertence a tenant nenhum, e a
// constraint usuarios_franqueado_obrigatorio so exige o campo para os outros
// papeis. E o que permite criar a conta antes de existir qualquer franqueado.
const { error: erroPerfil } = await admin.from('usuarios').insert({
  id: criado.user.id,
  email,
  nome,
  role: 'super_admin',
  franqueado_id: null,
});

if (erroPerfil) {
  // Desfaz o login: conta de auth sem perfil nao entra em lugar nenhum — o
  // middleware busca o papel, nao acha, e derruba. Deixar o resto para tras
  // ainda bloquearia uma nova tentativa com o mesmo e-mail.
  //
  // O try existe porque `deleteUser` LANCA em vez de devolver erro. Sem ele,
  // uma falha de rede no desfazimento troca a mensagem abaixo por um stack
  // trace, e quem rodou o comando nao fica sabendo nem do que deu errado nem
  // da conta que sobrou.
  let desfeita = true;
  try {
    const { error: erroAoDesfazer } = await admin.auth.admin.deleteUser(criado.user.id);
    if (erroAoDesfazer) desfeita = false;
  } catch {
    desfeita = false;
  }

  console.error(
    `O perfil nao pode ser salvo: ${erroPerfil.message}\n\n` +
      (desfeita
        ? 'A conta de login foi desfeita — nada ficou para tras.\n'
        : `A conta de login de ${email} NAO pode ser desfeita e continua em ${host}.\n` +
          'Apague em Authentication > Users antes de tentar de novo, senao o\n' +
          'e-mail aparece como ja cadastrado.\n') +
      '\nSe a mensagem fala em coluna ou relacao inexistente, faltam migrations:\n' +
      'cole supabase/APLICAR-PENDENTES.sql no SQL Editor e rode este comando de novo.'
  );
  process.exit(1);
}

/* ------------------------------- Entrega ------------------------------ */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

console.log(
  `
Super admin criado em ${host}.

  Nome    ${nome}
  E-mail  ${email}
  Senha   ${senhaProvisoria}

ESTA SENHA NAO SERA MOSTRADA DE NOVO. Ela nao fica gravada em lugar nenhum —
nem aqui, nem no banco, que guarda so o hash. Copie agora.

Ela e provisoria: no primeiro acesso o sistema exige a troca antes de liberar
qualquer tela. Se o aviso se perder antes disso, apague a conta em
Authentication > Users e rode este comando de novo.

Entre em ${siteUrl}/auth/login e siga para cadastrar o franqueado, as lojas e
a equipe.
`.trim()
);
