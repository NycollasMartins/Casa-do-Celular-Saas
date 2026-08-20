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

A ordem importa. São seis passos:

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

### Tabelas

| Tabela | Papel |
|---|---|
| `franqueados` | O tenant. Todo dado de negócio pendura aqui. |
| `usuarios` | Espelho de `auth.users` com papel, tenant e `status`. |
| `lojas` | Unidades. `(franqueado_id, codigo_loja)` é único. |
| `participacoes_societarias` | Define o que franqueado e diretor enxergam. `data_fim IS NULL` = ativa. |
| `agendadores_lojas` | Vínculo do operacional com uma loja. |
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

**Monitoramento:** Vercel Analytics para performance, Supabase Logs para as
queries. Sentry é opcional e vale a pena quando entrar mais gente.

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
3. **Notificação de véspera** — lembrete automático para o cliente que
   agendou, atacando direto o não comparecimento.
4. ~~**Histórico de participação societária**~~ — feito. A tela *Societário*
   encerra e transfere participações preservando o histórico.
5. **Exportação agendada** — relatório semanal por e-mail para o franqueado.
6. **Registro de venda** — fechar o funil de contato até faturamento, hoje o
   sistema para no comparecimento.
