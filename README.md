# Casa do Celular · Performance de agendadores

SaaS multi-tenant para medir a performance dos agendadores de uma rede de
franquias: quantos clientes cada um contatou, quantos agendaram visita,
quantos compareceram na loja e qual a taxa de conversão de cada pessoa.

Nasce com 9 lojas de um franqueado e já está modelado para vários
franqueados com 10 a 80 lojas cada, sem reescrita.

---

## Sumário

- [O que o sistema faz](#o-que-o-sistema-faz)
- [Hierarquia de acesso](#hierarquia-de-acesso)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Setup local](#setup-local)
- [Banco de dados](#banco-de-dados)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Como o RLS funciona](#como-o-rls-funciona)
- [Testando as permissões](#testando-as-permissões)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Testes](#testes)
- [LGPD](#lgpd)
- [Lembrete de véspera](#lembrete-de-véspera)
- [Deploy](#deploy)
- [Decisões de projeto](#decisões-de-projeto)
- [Roadmap](#roadmap)

---

## O que o sistema faz

**Para o agendador (celular, o dia inteiro):** registra em segundos o contato
feito no WhatsApp — nome, CPF, telefone, data da visita e situação. Loja e
autoria são preenchidas pelo login, não dá para errar.

**Para o diretor e o franqueado (desktop):** dashboard com 4 indicadores
(contatos, agendamentos, conversão, comparecimentos), 4 gráficos (volume
diário, ranking de agendadores, distribuição por status, comparecimento x
agendamento), tabela filtrável com exportação em CSV e relatório comparativo
por loja e por pessoa.

**Para o dono do SaaS:** área de super admin com todos os franqueados, todas
as lojas e as métricas consolidadas da rede.

---

## Hierarquia de acesso

```
super_admin ─── vê TODOS os franqueados e TODAS as lojas
    │
    └── franqueado ─── vê apenas as lojas do seu franqueado_id
            │           (dropdown com todas + opção "Todas as lojas")
            │
            ├── diretor ─── vê apenas lojas onde tem participação ATIVA
            │                (participacoes_societarias.data_fim IS NULL)
            │
            └── agendador ─── vê apenas a SUA loja
                              (sem dropdown: loja fixa em tela)
```

| Papel | Lojas visíveis | Cria agendamento | Edita | Exclui | Gerencia cadastros |
|---|---|---|---|---|---|
| `super_admin` | todas | sim | sim | sim | tudo |
| `franqueado` | do seu tenant | sim | sim | sim | lojas e equipe |
| `diretor` | onde tem participação ativa | sim | sim | sim | não |
| `agendador` | a sua, apenas | só em nome próprio | só os seus | **não** | não |

O agendador não exclui agendamentos de propósito: quem é medido não deveria
poder apagar a própria medição. A regra está no banco (policy
`agendamentos_delete`), não só na interface.

---

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript estrito |
| Banco e auth | Supabase (PostgreSQL, Auth, Realtime) |
| Estilo | TailwindCSS + componentes no padrão shadcn/ui (Radix) |
| Gráficos | Recharts |
| Formulários | React Hook Form + Zod |
| Datas | date-fns |
| Toasts | sonner |

Validado neste repositório: `tsc --noEmit` limpo, `next build` com 21 rotas,
e as três migrations executadas em PostgreSQL 16 real (9 lojas, 21 usuários,
18 participações, 18 vínculos, 50 agendamentos).

---

## Requisitos

- Node.js 18 ou superior
- npm (ou pnpm)
- Conta no Supabase (free tier basta para o MVP)
- Conta na Vercel (opcional, para publicar)

---

## Setup local

```bash
git clone <seu-repositorio>
cd casa-do-celular-saas
npm install
cp .env.example .env.local     # preencha com as chaves do seu projeto Supabase
npm run dev
```

Abra `http://localhost:3000`. Sem sessão, o middleware manda para
`/auth/login`.

---

## Banco de dados

A ordem importa. São oito passos:

**1. Schema** — no SQL Editor do Supabase, cole e execute
`supabase/migrations/`.
Cria as 6 tabelas, os índices, os triggers de `updated_at` e o trigger que
garante que loja e agendamento pertencem ao mesmo franqueado.

**2. RLS** — execute `supabase/migrations/20250101000001_rls.sql`.
Liga o Row Level Security em todas as tabelas e cria as funções de permissão.

**3. Usuários de autenticação** — de volta ao terminal:

```bash
npm run seed:auth
```

Cria os 21 usuários em `auth.users` via Admin API (1 dono, 2 diretores,
18 agendadores) com a senha padrão `CasaCelular@2025`. Só desenvolvimento.

**4. Dados de negócio** — execute `supabase/migrations/20250101000002_seed.sql`.
Cria o franqueado, as 9 lojas, espelha os usuários, monta as participações e
os vínculos, e gera 50 agendamentos de teste. O script falha com mensagem
clara se você pular o passo 3.

**5. Status de usuário** — execute
`supabase/migrations/20250101000003_usuario_status.sql`.
Adiciona `usuarios.status` e passa a filtrar usuário inativo nas funções de
permissão. É o que permite desligar alguém pela tela de *Equipe* sem apagar
o histórico de agendamentos que a pessoa registrou.

**6. Proteção dos campos sensíveis** — execute
`supabase/migrations/20250101000004_protege_campos_sensiveis.sql`.
Corrige uma escalada de privilégio: a policy `usuarios_update` liberava a
própria linha sem restringir coluna, então qualquer usuário podia rodar
`update usuarios set role = 'franqueado' where id = auth.uid()` e passar a
enxergar o tenant inteiro. Um trigger `BEFORE UPDATE` passa a comparar OLD e
NEW e bloquear mudança de `role`, `franqueado_id` e `status` por quem não
gerencia. **Não pule este passo.**

**7. Anonimização (LGPD)** — execute
`supabase/migrations/20250101000005_anonimizacao_lgpd.sql`.
Adiciona `agendamentos.anonimizado_em` e a função de retenção. É o que
permite atender ao pedido de eliminação do titular sem destruir a métrica.

**8. Notificações** — execute
`supabase/migrations/20250101000006_notificacoes.sql`.
Cria a tabela que garante que o lembrete de véspera não seja enviado duas
vezes, e a função que lista quem deve receber.

### Tabelas

| Tabela | Papel |
|---|---|
| `franqueados` | O tenant. Todo dado de negócio pendura aqui. |
| `usuarios` | Espelho de `auth.users` com papel, tenant e `status`. |
| `lojas` | Unidades. `(franqueado_id, codigo_loja)` é único. |
| `participacoes_societarias` | Define o que franqueado e diretor enxergam. `data_fim IS NULL` = ativa. |
| `agendadores_lojas` | Vínculo do operacional com uma loja. |
| `notificacoes` | Registro de lembrete enviado. Não guarda telefone nem e-mail. |
| `agendamentos` | Tabela de fato. `franqueado_id` desnormalizado para filtrar por tenant sem join. |

---

## Variáveis de ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` **ignora o RLS**. Nunca prefixe com
`NEXT_PUBLIC_`, nunca importe `lib/supabase/admin.ts` em client component.
Ela é usada em dois lugares apenas: o script de seed e a criação de usuários
(que já checa o papel de quem chamou).

---

## Como o RLS funciona

Toda a autorização mora no banco. As páginas não filtram por franqueado ou
loja — elas consultam e o Postgres devolve só o permitido. Um bug de
front-end não vaza dado de outro franqueado.

O ponto delicado: uma policy da tabela `usuarios` que precise consultar
`usuarios` para descobrir o papel de quem está logado entra em **recursão
infinita**, porque o Postgres reaplica a policy dentro da subquery. A saída
são funções `SECURITY DEFINER`, que rodam como owner e ignoram RLS:

```sql
usuario_role()          -- papel do usuário logado
usuario_franqueado_id() -- tenant do usuário logado
is_super_admin()        -- atalho booleano
lojas_permitidas()      -- setof uuid: as lojas que ele pode ver
pode_gerenciar()        -- super_admin ou franqueado
```

Com isso, quase toda policy vira uma linha legível:

```sql
create policy agendamentos_select on public.agendamentos for select to authenticated
using (loja_id in (select public.lojas_permitidas()));
```

`lojas_permitidas()` é a única fonte de verdade de permissão do sistema.
Mudou a regra de quem vê o quê? Mexe só nela.

---

## Testando as permissões

Depois do seed, entre com cada perfil (senha `CasaCelular@2025`) e confirme:

| Login | Deve ver |
|---|---|
| `dono@franqueado.com.br` | as 9 lojas no dropdown |
| `diretor1@franqueado.com.br` | apenas lojas 1 a 5 |
| `diretor2@franqueado.com.br` | apenas lojas 6 a 9 |
| `agendador1.loja3@franqueado.com.br` | sem dropdown, só "Casa do Celular Loja 3" |

O teste que importa: logado como `diretor2`, tente abrir
`/dashboard/<id-da-loja-1>`. Deve dar 404 — e não uma tela vazia, que
confirmaria a existência da loja.

Para checar direto no SQL Editor, simulando um usuário:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-do-diretor1>"}';
select count(*) from lojas;   -- deve retornar 5
```

---

## Estrutura de pastas

```
app/
  actions/            server actions (agendamentos, auth, cadastros)
  auth/               login, register, forgot-password, callback
  dashboard/          visão geral, agendamentos, relatórios, lojas, equipe
  admin/              área exclusiva do super admin
  api/                rotas REST (métricas, agendamentos) com rate limit
components/
  ui/                 botão, input, select, card, tabela, dialog, tabs, badge
  dashboard/          loja-selector, metrics-cards, charts-container,
                      agendamentos-table, periodo-selector, status-filter, sidebar
  forms/              agendamento, loja, usuário, franqueado
  layout/             header, user-menu, mobile-nav
lib/
  supabase/           client, server, admin, middleware, queries
  auth/session.ts     usuário logado + guards de papel
  validations/        schemas Zod
  types/              tipos do banco e das métricas
  utils.ts            máscaras, validação de CPF, formatação
hooks/                use-lojas, use-agendamentos, use-metricas, use-usuarios
supabase/migrations/  schema, RLS, seed
scripts/              seed-auth-users.mjs
```

---

## Testes

```bash
npm test           # unitarios + RLS
npm run test:unit  # so a logica pura, sem banco
npm run test:rls   # so as permissoes, precisa do seed
npm run test:e2e   # navegador de verdade, sobe o app na porta 3100
```

**Unitários** cobrem validação de CPF pelo dígito verificador, máscaras,
schemas e o rate limit em memória. Rodam em qualquer lugar, sem rede.

**RLS** autenticam como os usuários reais do seed, usando a *anon key*, e
conferem o que cada papel enxerga e o que consegue gravar. Nunca usam a
service role — ela ignora RLS, que é justamente o que se quer exercitar.
Cobrem visibilidade por papel, negação de escrita cruzada entre lojas e a
regressão da escalada de privilégio corrigida em
`20250101000004_protege_campos_sensiveis.sql`.

**E2E** (Playwright) sobem a aplicação e navegam como usuário. A suíte de
acesso não depende de banco povoado e cobre o pior defeito possível — uma
rota do dashboard ficar aberta sem sessão — mais o contrato da API: dados
recebem `401` em JSON, navegação de documento vai para o login. A suíte do
fluxo crítico (registrar contato, ver na lista, exportar) precisa do seed.

Roda na porta **3100**, não na 3000: a 3000 costuma estar ocupada por outro
projeto, e um teste que conversa com o app errado falha com 404 em toda
página, sem explicação aparente.

As suítes de RLS e a de fluxo crítico **se pulam sozinhas** quando os
usuários do seed não existem, em vez de falharem em vermelho. É uma trava proposital: impede que
alguém aponte o `.env.local` para produção e saia escrevendo. Para rodá-las,
execute antes `npm run seed:auth` e a migration de seed.

### Integracao continua

`.github/workflows/ci.yml` roda a cada push na `main` e em cada pull request:
checagem de tipos, lint, testes unitários e build de produção. A Netlify
publica a partir da `main`, então sem essa verificação um commit que quebra o
build vai direto para produção e só aparece quando alguém abre o sistema.

O job de E2E precisa das chaves do Supabase. Configure
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em *Settings →
Secrets and variables → Actions*. Sem elas o job avisa e encerra sem falhar —
o projeto continua clonável e verificável por quem não tem acesso ao banco.

Os testes de **RLS não rodam no CI de propósito**: eles escrevem no banco
para provar que as policies barram o que devem barrar, e fazer isso a cada
push mexeria em dados reais. Rode `npm run test:rls` num ambiente de
desenvolvimento com o seed aplicado.

---

## LGPD

O sistema guarda nome, CPF, telefone e e-mail de clientes finais. CPF é dado
pessoal sob regime estrito, e o titular pode exigir a eliminação a qualquer
momento (art. 18, VI).

**Anonimizar, não apagar.** Apagar a linha destruiria a métrica — o
agendamento é o fato que o sistema existe para medir. O art. 12 resolve:
dado anonimizado deixa de ser dado pessoal. Limpamos nome, CPF, telefone,
e-mail e observações, e preservamos loja, agendador, data e status.

`observacoes` entra na limpeza porque é campo livre, onde na prática acabam
anotações como *"irmã da Dona Maria, mora na quadra 12"* — dado pessoal que
escaparia se olhássemos só para as colunas com "cliente" no nome.

Os marcadores são **fixos e iguais para todos**. Um marcador que variasse
por pessoa (um hash do CPF, por exemplo) permitiria reidentificar por
comparação: seria pseudonimização, que a LGPD ainda trata como dado pessoal.

**Pedido do titular.** Em *Privacidade*, o franqueado busca pelo CPF e
anonimiza todos os registros de uma vez — o pedido vale para todo o
tratamento, não para um registro isolado.

**Retenção.** O padrão é 24 meses. A varredura roda por:

```bash
npm run lgpd:reter          # 24 meses
npm run lgpd:reter 12       # outro prazo
npm run lgpd:reter -- --seco # só relata, não altera
```

Feito para ser agendado (cron mensal). O prazo é uma sugestão técnica: cabe
ao controlador confirmar com base na finalidade declarada.

**Política pública** em `/privacidade`, rota aberta — o titular dos dados
normalmente não tem conta no sistema. O texto é um ponto de partida escrito
a partir do que o sistema de fato coleta; os campos entre colchetes precisam
ser preenchidos e **o conjunto precisa de revisão jurídica** antes de valer
como documento oficial.

---

## Lembrete de véspera

O não comparecimento é o número que o franqueado acompanha, e o lembrete
ataca direto ele.

```bash
npm run lembrete:vespera             # envia
npm run lembrete:vespera -- --seco   # só lista, não envia
npm run lembrete:vespera -- --data 2026-09-01
```

Feito para rodar uma vez por dia, no fim da tarde.

**Idempotência no banco, não no código.** O índice parcial
`notificacoes_enviada_unica` cobre `(agendamento_id, tipo)` apenas onde
`status = 'enviada'`. Rodar a rotina duas vezes não manda mensagem repetida,
e falhas podem se repetir — precisam poder, senão uma indisponibilidade do
provedor impediria a reentrega para sempre.

**Fuso é o ponto mais fácil de errar.** `data_agendamento` é um `date` sem
fuso, preenchido no horário de Brasília. Calcular "amanhã" a partir de UTC
faria toda execução entre 21h e meia-noite enxergar o dia seguinte e
notificar a data errada — e uma rotina noturna é exatamente o caso de uso.
`dataDeAmanha` resolve pelo fuso das lojas, com testes cobrindo virada de
mês, de ano e 29 de fevereiro.

**Sem provedor contratado, opera em modo registro:** anota o que teria sido
enviado e não manda nada. Isso permite acompanhar o volume e validar a
rotina antes de contratar. Com `RESEND_API_KEY` e `REMETENTE_EMAIL`, envia
e-mail de verdade.

Registros anonimizados são ignorados — não há para quem mandar, e insistir
seria tratar dado que o titular pediu para eliminar.

---

## Deploy

**Supabase:** crie o projeto, rode as migrations na ordem acima e ative
autenticação por e-mail e senha em *Authentication → Providers*.

**Vercel:** conecte o repositório do GitHub, adicione as quatro variáveis de
ambiente (com `NEXT_PUBLIC_SITE_URL` apontando para o domínio de produção) e
faça o deploy. Cada push na `main` publica automaticamente.

Depois de publicar, volte ao Supabase e adicione a URL de produção em
*Authentication → URL Configuration → Redirect URLs*, senão o link de
recuperação de senha volta para `localhost`.

**Monitoramento:** Sentry já está integrado e fica **inerte sem DSN** — sem
`NEXT_PUBLIC_SENTRY_DSN` nada é inicializado e nenhuma requisição sai da
aplicação. Para ligar, preencha as variáveis do `.env.example`.

Dois cuidados na configuração, ambos por causa do CPF de cliente final:
`sendDefaultPii` está desligado, e um `beforeSend` remove CPF e telefone de
qualquer texto do evento antes do envio — inclusive de URL em breadcrumb e
de corpo de server action. Replay só é gravado depois de um erro, nunca a
sessão inteira, que capturaria dados digitados em tela.

A rota `/monitoring` é o túnel do Sentry e está liberada no middleware. Sem
isso, o relatório de erro seria redirecionado para o login e nunca chegaria
— e o erro mais importante de capturar é justamente o de quem não conseguiu
autenticar.

O middleware cresce de ~86 kB para ~133 kB com o SDK de borda incluído. Está
bem abaixo do limite da Vercel e da Netlify, mas é custo real em cold start.

Supabase Logs continua sendo o lugar das queries.

---

## Decisões de projeto

Onde o briefing pedia duas coisas ou onde o caminho óbvio tinha um problema,
segue o que foi decidido e por quê.

**Supabase Auth, não NextAuth.** O briefing mencionava os dois. Manter ambos
cria duas fontes de sessão e uma delas fica desatualizada. Como o RLS depende
de `auth.uid()`, a sessão precisa ser a do Supabase. Não existe
`NEXTAUTH_SECRET` no projeto.

**Seed em duas etapas.** Inserir direto em `auth.users` por SQL é frágil e
quebra a cada mudança interna do Supabase. O script Node usa a API oficial e
o SQL só espelha, casando por e-mail.

**Métricas agregadas em JS, não no banco.** Uma leitura do período alimenta
os 4 cards e os 4 gráficos, em vez de seis roundtrips. Para 9 lojas — ou para
um franqueado de 80 — cabe em memória com folga. Se a rede inteira crescer
muito, troque `calcularMetricas` por uma RPC que agrega no Postgres; o resto
do código não muda.

**Rate limit com duas implementações.** Os 100 req/min por usuário usam
Upstash Redis quando `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
existem, e caem para um contador em memória quando não. O fallback também
cobre o Redis fora do ar: o sistema degrada em vez de parar. Em memória o
contador vale por instância, então segura engano de usuário, não ataque
coordenado — defina as duas variáveis antes de ir a produção.

**Sem auto-cadastro.** Toda conta pertence a um franqueado e precisa de papel
e loja definidos. Quem cria é o franqueado, em *Equipe*, com senha
provisória.

**CSV pensado para o Excel em português.** BOM UTF-8, separador ponto e
vírgula e decimal com vírgula. Sem isso o Excel pt-BR abre o arquivo numa
coluna só e com os acentos quebrados. Células iniciadas por `=`, `+`, `-` ou
`@` levam apóstrofo na frente: o nome do cliente vem de entrada do usuário e
o Excel executa fórmula ao abrir o arquivo.

**Transferência de participação abre antes de encerrar.** Não há transação
entre chamadas do PostgREST, então a ordem foi escolhida pelo modo de
falhar: abre no destino e, se o encerramento da origem falhar, desfaz a
abertura. O pior estado possível é "continua na origem", nunca "perdeu as
duas".

**CPF validado com o algoritmo oficial**, no servidor. A máscara só formata;
`111.111.111-11` passa no regex e é rejeitado no dígito verificador.

---

## Roadmap

Próximos passos naturais, na ordem em que costumam doer:

1. **Metas por agendador** — conversão esperada por pessoa e alerta de quem
   está abaixo.
2. **Integração com a API do WhatsApp Business** — hoje o agendador digita o
   contato; o ideal é o registro nascer da conversa.
3. ~~**Notificação de véspera**~~ — feito. Falta ligar um provedor de envio
   e agendar a rotina; a lógica e a idempotência estão prontas.
4. ~~**Histórico de participação societária**~~ — feito. A tela *Societário*
   encerra e transfere participações preservando o histórico.
5. **Exportação agendada** — relatório semanal por e-mail para o franqueado.
6. **Registro de venda** — fechar o funil de contato até faturamento, hoje o
   sistema para no comparecimento.
