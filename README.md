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
- [Registro de venda](#registro-de-venda)
- [Metas por agendador](#metas-por-agendador)
- [Relatório semanal](#relatório-semanal)
- [Deploy](#deploy)
- [Rotinas agendadas](#rotinas-agendadas)
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

> **Atalho:** `supabase/APLICAR-PENDENTES.sql` reúne tudo que vem depois do
> seed num arquivo só, na ordem correta, e termina com uma consulta de
> conferência que lista o que ficou faltando. É seguro rodar mais de uma vez
> — todo comando é idempotente. Use-o se você não tem certeza de quais
> migrations já aplicou.
>
> O arquivo é **gerado** por `npm run consolidado:gerar`, e o CI falha se
> ficar desatualizado. Antes ele era montado à mão: bastava uma migration
> nova ser esquecida para o arquivo aplicar um schema parcial — que é
> exatamente o estado em que este projeto já esteve.

A ordem importa. São treze passos:

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
18 agendadores) com a senha padrão `CasaCelular@2025`. **Só desenvolvimento** —
e o script agora recusa rodar contra um Supabase que não seja local sem que
`SEED_PASSWORD` seja definida.

O motivo: diferente do cadastro feito pela aplicação, o seed **não marca**
`senha_provisoria`. Contas criadas pela tela obrigam a trocar a senha no
primeiro acesso; as do seed, não — a senha compartilhada fica valendo
indefinidamente. Em um banco de produção seriam 21 contas ativas e
privilegiadas com uma senha escrita no repositório, a mais poderosa delas
enxergando o tenant inteiro.

Se o seed já rodou contra produção, trate as contas: troque a senha ou
remova-as em *Authentication → Users*.

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

**9. Vendas** — execute `supabase/migrations/20250101000007_vendas.sql`.
Fecha o funil no faturamento. Inclui o trigger que impede registrar venda em
atendimento sem comparecimento confirmado.

**10. Metas** — execute `supabase/migrations/20250101000008_metas.sql`.
Metas mensais por agendador, com alvos opcionais de agendamentos, conversão,
vendas e faturamento.

**11. Relatório semanal** — execute
`supabase/migrations/20250101000009_relatorio_semanal.sql`.
Cria a tabela de controle de envio e a função que agrega o resumo do
período.

**12. Venda trava o status** — execute
`supabase/migrations/20250101000010_venda_trava_status.sql`.
Impede alterar o comparecimento de um atendimento que já tem venda
registrada. Sem isso, o faturamento contabilizava cliente que não apareceu.

**13. Vínculo só dentro do tenant** — execute
`supabase/migrations/20250101000011_vinculo_mesmo_tenant.sql`.
Impede vincular usuário a loja de outro franqueado. **Não pule este passo:**
sem ele, um vínculo cruzado dá acesso aos dados do outro tenant.

> **Se um script reclamar de "Could not find the function ... in the schema
> cache"** com a função já criada, o PostgREST não recarregou o schema.
> Rode `notify pgrst, 'reload schema';` no SQL Editor — o
> `APLICAR-PENDENTES.sql` já faz isso ao final.

### Tabelas

| Tabela | Papel |
|---|---|
| `franqueados` | O tenant. Todo dado de negócio pendura aqui. |
| `usuarios` | Espelho de `auth.users` com papel, tenant e `status`. |
| `lojas` | Unidades. `(franqueado_id, codigo_loja)` é único. |
| `participacoes_societarias` | Define o que franqueado e diretor enxergam. `data_fim IS NULL` = ativa. |
| `agendadores_lojas` | Vínculo do operacional com uma loja. |
| `notificacoes` | Registro de lembrete enviado. Não guarda telefone nem e-mail. |
| `vendas` | Fecha o funil. Uma por agendamento, só onde houve comparecimento. |
| `metas` | Alvo mensal por agendador. Uma por pessoa e competência. |
| `envios_relatorio` | Controle do relatório semanal. Uma linha por franqueado e semana. |
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

### Tipos contra o schema

`lib/types/database.ts` é escrito à mão e precisa espelhar as migrations.
Nada garante isso sozinho: o TypeScript confia no que está declarado, então
uma coluna nova sem tipo compila e passa despercebida — foi o que aconteceu
com `notificacoes` e `envios_relatorio`, criadas nas migrations e sem tipo
por vários commits.

`npm run verificar:banco` compara os dois nos dois sentidos: coluna no banco
sem campo no tipo, e campo no tipo sem coluna no banco. Divergir falha o CI.

### Contrato entre os scripts e `lib/`

Os scripts de rotina rodam com `node` puro, sem build, e por isso não
importam de `lib/`, que é TypeScript. O Node 24 executa `.ts` nativamente,
mas o CI e os ambientes de cron costumam estar em versões mais antigas —
quebrar a rotina noturna para eliminar duplicação seria um mau negócio.

A duplicação existe, então, mas em **um** lugar: `scripts/compartilhado.mjs`.
E `tests/unit/compartilhado.test.ts` executa as duas implementações nos
mesmos casos e compara. Se divergirem, o teste falha.

Não é precaução teórica. A cópia da retenção já tinha divergido — usava
`setMonth`, que transborda — e o relatório semanal calculava a taxa de
comparecimento com um denominador diferente do dashboard.

### Verificação local das migrations

```bash
npm run verificar:banco
```

Cria um banco descartável no PostgreSQL local, reproduz o que o Supabase
fornece (schema `auth`, `auth.uid()`, os papéis), aplica **todas** as
migrations na ordem, popula o seed e roda **62 asserções**:

- **36 de RLS**, impersonando cada papel — inclusive a tentativa de escalada
  de privilégio, que precisa ser barrada. Nove delas espelham afirmações de
  `tests/rls/*.test.ts`, que dependem do PostgREST e nunca rodaram: uma
  dessas afirmações já se mostrou errada, e conferir as demais aqui evita
  que custem uma sessão de depuração quando finalmente rodarem.
- **26 das funções e triggers SQL**, com dados de verdade: a anonimização limpa os
  campos pessoais e preserva loja e status para a métrica sobreviver; o
  lembrete não repete quem já recebeu mas permite nova tentativa depois de
  falha; o resumo semanal devolve zero, não nulo, em período sem movimento.

Existe porque migrations só chegam ao banco quando alguém cola no SQL
Editor. Entre escrever e aplicar, erro de SQL não aparece, e uma migration
quebrada se revela em produção, no pior momento possível. Requer apenas
`brew install postgresql@16`.

Não substitui `npm run test:rls`, que exercita também o PostgREST e o
GoTrue. Cobre a camada onde a segurança de fato mora.

### Verificação do arquivo que vai para produção

```bash
npm run verificar:consolidado
```

`verificar:banco` cobre o caminho de quem desenvolve: migrations uma a uma,
na ordem, num banco vazio. Este cobre o caminho de quem **opera** —
`supabase/APLICAR-PENDENTES.sql`, o arquivo único que uma pessoa cola no SQL
Editor.

O cabeçalho desse arquivo afirma duas coisas fortes: que é seguro rodar mais
de uma vez e que repara aplicação parcial. Nenhuma das duas estava
verificada. Se fossem falsas, a descoberta viria no pior lugar possível —
erro no meio da execução, em produção, sem transação para desfazer.

Três cenários, e em todos as 62 asserções de comportamento precisam passar
no fim:

- **Aplicação parcial**: schema, RLS e seed prontos, mais algumas migrations
  posteriores e as do meio faltando. É o estado real em que este projeto já
  esteve.
- **Repetição**: o mesmo arquivo três vezes seguidas, conferindo que nenhum
  dado se perde entre uma e outra.
- **Instalação limpa**: só schema, RLS e seed.

### Integracao continua

`.github/workflows/ci.yml` roda a cada push na `main` e em cada pull request:
checagem de tipos, lint, testes unitários, build de produção e — num
container Postgres descartável — as 12 migrations com as 62 asserções de RLS
e funções. É o que impede uma migration quebrada chegar ao SQL Editor. A Netlify
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

**Dois canais, com precedência.** WhatsApp vem na frente do e-mail: é onde a
pessoa efetivamente lê, e o telefone é obrigatório no cadastro enquanto o
e-mail não é. Sem provedor algum, opera em **modo registro** — anota o que
teria sido enviado e não manda nada, o que permite acompanhar o volume e
validar a rotina antes de contratar.

**No WhatsApp é template, nunca texto livre.** A Meta só permite texto livre
dentro da janela de 24h depois que o cliente escreveu para você. Um lembrete
de véspera é sempre iniciado pela empresa, então precisa de template
aprovado previamente — texto livre fora da janela retorna erro `131047` e,
repetido, derruba a qualidade do número.

O template esperado (`lembrete_vespera`) tem três parâmetros posicionais:

```
Ola, {{1}}! Lembrando do seu atendimento na {{2}}, amanha ({{3}}).
```

A ordem importa e está fixada em teste: trocar dois parâmetros de lugar
entrega uma mensagem que diz a coisa errada, sem erro nenhum.

**O telefone é normalizado para E.164** antes do envio. `normalizarTelefoneBr`
aceita o que o agendador digita na prática — com máscara, sem máscara, com
`+55`, com zero de operadora — e **recusa em vez de adivinhar** quando o
resultado seria ambíguo: número errado não gera erro visível, gera mensagem
entregue a um estranho. A validação inclui a lista de DDDs realmente
atribuídos, porque o intervalo 11–99 não é contínuo.

Registros anonimizados são ignorados — não há para quem mandar, e insistir
seria tratar dado que o titular pediu para eliminar.

**Na tabela de Agendamentos, um sininho ao lado da data** mostra se o
lembrete saiu: verde quando enviado (o rótulo diz por qual canal), vermelho
quando falhou (o rótulo traz o motivo). Sem ele, a única forma de saber era
ler a saída do script no terminal — e o franqueado não abre terminal.

---

## Registro de venda

Até aqui o funil parava no comparecimento: o sistema media quantas pessoas
apareceram, não quantas compraram. Sem isso, um agendador que traz muita
gente que não compra parece melhor que um que traz pouca gente que compra.

Na tabela de *Agendamentos*, os atendimentos com comparecimento ganham um
botão de carteira para lançar o valor. O dashboard mostra faturamento,
ticket médio e número de vendas; *Relatórios* traz as mesmas colunas por
loja, e a exportação CSV acompanha.

**Valor é `numeric(12,2)`, nunca float.** Em ponto flutuante `0.1 + 0.2` não
dá `0.3`, e em dinheiro esse erro vira divergência de fechamento.

**A regra "só onde houve comparecimento" está no banco**, em dois triggers,
não só na aplicação. Confiar apenas na validação da tela deixaria a porta
aberta para qualquer caminho que não passe por ela — script, correção
manual, rota futura.

São dois porque um só não bastava. O primeiro exige comparecimento para
registrar a venda; o segundo impede mudar o status depois. Sem ele bastava
marcar comparecimento, lançar a venda e reverter o status: a venda
sobrevivia e o faturamento passava a contar quem não apareceu.

**O parser de valor trata o formato brasileiro.** `1.234` em português é mil
duzentos e trinta e quatro, não um vírgula duzentos e trinta e quatro. Um
`replace(',', '.')` ingênuo erraria por mil vezes, em silêncio, num campo de
dinheiro. `lerValorBrl` decide pelo número de dígitos após o ponto e tem 15
testes cobrindo os casos ambíguos.

Os indicadores de faturamento **só aparecem quando há venda registrada**:
numa rede que ainda não usa o recurso, um `R$ 0,00` fixo no topo pareceria
defeito em vez de ausência de dado.

---

## Metas por agendador

O sistema já media o desempenho de cada agendador; faltava o outro lado da
conta. "42 agendamentos no mês" não diz se foi bom ou ruim — e o franqueado
precisa saber quem está abaixo **antes** do fim do mês, não depois.

Em *Metas*, cada agendador recebe alvos mensais opcionais de agendamentos,
taxa de conversão, vendas e faturamento. Basta um alvo definido; os demais
ficam em branco.

**A situação compara com o esperado até hoje, não com o alvo cheio.** No dia
10 de um mês de 30, quem fez 33% da meta está *em dia*. Comparar o realizado
parcial contra o alvo do mês inteiro acusaria todo mundo de atrasado até o
último dia — o que tornaria o indicador inútil justamente enquanto ainda dá
tempo de reagir.

**Taxa de conversão não é proporcionalizada**, porque não acumula: 60% no
dia 5 já é 60%. Aplicar a mesma regra dos volumes diria que ela superou em
muito a meta.

**A tela trabalha sobre um mês fechado**, com seletor próprio, em vez de
aproveitar o filtro de período do restante do sistema. Comparar um recorte
de 7 dias com um alvo mensal produziria um número enganoso.

As vendas são atribuídas ao **agendador do atendimento**, não a quem lançou
o registro: quem trouxe o cliente é quem fez o resultado.

O agendador enxerga a própria meta — esconder o alvo transformaria a meta em
instrumento de cobrança em vez de direção.

---

## Relatório semanal

O franqueado não abre o sistema todo dia. O resumo semanal leva o número até
ele — e, quando algo destoa, ele entra para investigar.

```bash
npm run relatorio:semanal             # semana fechada anterior
npm run relatorio:semanal -- --seco   # só mostra, não envia
npm run relatorio:semanal -- --semana 2026-08-10
```

Feito para rodar toda segunda-feira de manhã.

**A semana é de segunda a domingo**, como o comércio brasileiro conta — não
de domingo a sábado, que é o padrão do `getDay()` do JavaScript. Trocar um
pelo outro desloca o relatório em um dia e faz a segunda-feira aparecer no
resumo da semana errada.

**O e-mail leva os números e um link**, não um CSV anexado. O franqueado
clica e vê dado fresco, com os filtros da tela — e a lógica de CSV, que é
testada em `lib/csv.ts`, não precisa ser duplicada dentro de um script
`.mjs`.

**A agregação fica no banco**, numa função SQL, não em JavaScript. As
métricas da aplicação são calculadas em JS porque a tela já carregou os
registros; uma rotina em lote não tem essa leitura na mão, e trazer milhares
de linhas para somar quatro números seria desperdício.

Franqueado sem movimento na semana não recebe e-mail: relatório vazio treina
o destinatário a ignorar a mensagem.

**A taxa de comparecimento do e-mail usa o mesmo denominador do dashboard** —
visitas com desfecho conhecido, não todas as marcadas. Denominadores
diferentes fariam o mesmo período render dois números, e o franqueado
confiaria no menos favorável. As visitas que ficaram sem desfecho aparecem
em linha própria, porque são acionáveis: alguém precisa marcar o que
aconteceu.

---

## Deploy

**Supabase:** crie o projeto, rode as migrations na ordem acima e ative
autenticação por e-mail e senha em *Authentication → Providers*.

**Netlify:** conecte o repositório do GitHub, adicione as quatro variáveis
de ambiente (com `NEXT_PUBLIC_SITE_URL` apontando para o domínio de
produção) e faça o deploy. Cada push na `main` publica automaticamente. A
versão do Node vem do `.nvmrc` — a Netlify lê esse arquivo sozinha, e é o
mesmo que o CI usa, para o build não depender de qual versão cada ambiente
escolheu. A Vercel funciona igual; nada aqui é específico de uma delas.

**As rotinas não rodam sozinhas por conta do deploy.** O lembrete da véspera
e o resumo semanal são scripts, e um deploy não agenda script nenhum — veja
[Rotinas agendadas](#rotinas-agendadas) abaixo.

**Confira o deploy em `/api/saude`.** Logo depois de publicar, abra essa
rota no domínio novo. Ela responde `200` quando está tudo pronto e `503`
listando o que falta — em duas frentes:

- **Ambiente:** quais variáveis estão ausentes e o que deixa de funcionar
  sem cada uma.
- **Banco:** quais migrations ainda não foram aplicadas, pelo número.

A segunda existe porque nada liga o código publicado ao schema aplicado: dá
para subir uma versão que usa `vendas` num banco que não tem `vendas`, e o
erro só aparece quando alguém abre a tela. Este projeto já viveu isso, com
parte das migrations aplicada e parte não, sem ninguém saber quais.

A sondagem é indireta — o PostgREST não expõe `information_schema` —, então
uma função recém-criada pode aparecer como ausente por causa do cache. A
resposta diz isso e sugere o `notify pgrst` antes de concluir que a
migration não rodou.

Sendo aberta e consultando o banco, a rota tem dois freios: o resultado da
sondagem fica em cache por 30 segundos, e há teto de 12 conferências por
minuto por IP.

O IP vem de `x-nf-client-connection-ip` (ou do equivalente da borda), **não**
do `x-forwarded-for` cru — esse último é escrito pelo cliente, e trocar o
valor a cada chamada anularia o teto e ainda criaria uma chave nova no
contador em memória a cada requisição. Sem eles, uma requisição barata para quem chama viraria dez
consultas ao Supabase — amplificação clássica.

A rota é aberta e não passa pelo Supabase de propósito — o momento em que
ela é mais necessária é justamente quando ninguém consegue entrar. Nunca
devolve o valor de variável nenhuma, só o nome da que falta.

Ela acusa também o erro mais comum do primeiro deploy: `NEXT_PUBLIC_SITE_URL`
publicada com o valor de desenvolvimento. O e-mail de recuperação chega
normalmente e o link manda o usuário para a máquina dele — nada falha de
forma visível.

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

## Rotinas agendadas

O sistema tem duas rotinas: o **lembrete da véspera** (uma vez por dia, fim
da tarde) e o **resumo semanal** (segunda de manhã). Elas são scripts Node —
e por um bom tempo foram *só* scripts: nada as executava, então em produção
nunca rodaram. Publicar a aplicação não agenda nada.

`.github/workflows/rotinas.yml` agenda as duas.

```
0 21 * * *   →  18:00 em São Paulo, todo dia      →  lembrete da véspera
0 11 * * 1   →  08:00 em São Paulo, segunda-feira →  resumo semanal
```

O cron do GitHub é UTC. O Brasil não tem mais horário de verão desde 2019,
então São Paulo é UTC−3 o ano inteiro e essas contas não escorregam em março
ou outubro.

**Ficam desligadas até você ligar.** Sem `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` em *Settings → Secrets*, os jobs pulam com um
aviso e nada é enviado. E mesmo com eles, os scripts só enviam de verdade
quando as credenciais do canal existem (`WHATSAPP_ACCESS_TOKEN` ou
`RESEND_API_KEY`); sem elas, apenas registram o que fariam.

**Para testar antes**, use *Run workflow* na aba Actions: ele pergunta qual
rotina e oferece **modo seco**, que lista sem enviar.

**Um cuidado com o segredo.** `SUPABASE_SERVICE_ROLE_KEY` ignora o RLS.
Guardá-la nos segredos do GitHub significa confiar neles tanto quanto nos da
Netlify. Quem preferir não duplicar a chave deve disparar as rotinas por
outro gatilho e deixar este workflow sem segredos — ele pula sozinho, sem
erro.

**Por que aqui e não numa função da Netlify:** os dois scripts executam ao
carregar e terminam com `process.exit`. Uma função serverless exigiria
refatorar código que funciona só para trocar o gatilho.

## Os hooks de `hooks/` não são usados

`useAgendamentos`, `useLojas`, `useMetricas` e `useUsuarios` existem e
**nenhuma tela os usa**. As páginas buscam no servidor, que é mais simples e
não expõe a consulta ao cliente.

Estão marcados como tal no topo de cada arquivo, porque código morto que
parece pronto é uma armadilha: não recebe correção quando o resto muda. Dois
exemplos concretos deste repositório — o `useMetricas` carregou por semanas
o efeito do redirect de `/api/*`, corrigido só quando o middleware mudou; e
o `useAgendamentos` recarregava a lista inteira a cada evento de tempo real,
sem agrupar, o que com algumas telas abertas transformaria uma rajada de
inserções em dezenas de consultas.

O segundo foi corrigido. Se a tela de acompanhamento ao vivo não estiver nos
planos, o mais honesto é apagar os quatro.

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

Essa leitura **pagina até o fim**, sem `.limit()`. A versão anterior pedia
10.000 registros e cortava em silêncio: com 18 agendadores a 10 atendimentos
por dia, o filtro de 90 dias passa de 16 mil, e o dashboard exibiria a conta
de 10 mil deles sem nenhum sinal de que faltava dado. Acima de 50.000 a
leitura levanta erro pedindo um intervalo menor — número errado que parece
certo é pior que erro visível.

A tabela continua carregando uma janela, porque pagina no cliente. A
diferença é que agora ela **diz** quando a janela encheu.

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

**Abrir antes de encerrar, sempre.** Vale para a transferência de
participação e para a troca de loja na edição de usuário. Não há transação
entre chamadas do PostgREST, então a ordem é escolhida pelo modo de falhar:
encerrando primeiro, uma abertura que falhe — e ela pode, o trigger de
tenant recusa loja de outro franqueado — deixa a pessoa **sem vínculo
nenhum**, entrando num sistema vazio enquanto o gestor leu "atualizado".
Abrindo primeiro, o pior estado é ter dois vínculos por um instante, que é
visível na tela e corrigível.

**Transferência de participação abre antes de encerrar.** Não há transação
entre chamadas do PostgREST, então a ordem foi escolhida pelo modo de
falhar: abre no destino e, se o encerramento da origem falhar, desfaz a
abertura. O pior estado possível é "continua na origem", nunca "perdeu as
duas".

**Subtrair meses não é `setMonth`.** No JavaScript, `2026-03-31` menos um
mês devolve `2026-03-03` — ainda em março, porque o dia 31 transborda num
mês de 30 e volta. O Postgres gruda no último dia e devolve `2026-02-28`, e
é essa a aritmética da função de retenção no banco. Com as duas diferentes,
num dia 31 a tela de Privacidade contava os vencidos por uma data quase um
mês distante da que o script usa para anonimizar — e podia exibir zero
vencidos havendo muitos.

**"Hoje" tem uma fonte única: `hojeNaLoja`, em `lib/semana.ts`.** Nenhuma
decisão de negócio sobre data usa `new Date()` direto. A razão é empírica:
esse erro apareceu **cinco vezes** neste projeto — lembrete de véspera,
relatório semanal, janela do dashboard, validação da data da visita e o
valor padrão do formulário.

Duas armadilhas distintas, e as duas mordem. `new Date()` pega o fuso de
quem executa: no navegador do agendador é Brasília, no servidor da Vercel é
UTC. E `toISOString()` devolve **sempre UTC** — nem o local, nem o das
lojas —, então até no navegador ele mente depois das 21h.

**"Hoje" é sempre o hoje das lojas, nunca o do processo.** A validação que
exige visita de hoje em diante comparava com o fuso de quem executava: no
navegador do agendador era Brasília e funcionava, no servidor é UTC. Depois
das 21h, marcar visita para hoje passava no formulário e era **recusada pela
server action** — com a mensagem "a data da visita deve ser hoje ou no
futuro", sobre a data de hoje. Bem no turno da noite, quando a loja está
cheia.

**A janela de datas é calculada no fuso das lojas.** `data_agendamento` é
um `date` sem fuso, preenchido em Brasília, mas o servidor da Vercel e da
Netlify roda em UTC. Às 22h o UTC já virou o dia, e a janela de 30 dias
escorregava: virava 23/07–21/08 em vez de 22/07–20/08, descartando um dia
real de dados e incluindo um que ainda não aconteceu. O mesmo usuário via
totais diferentes às 20h e às 22h.

**Quem faltou continua contando como visita marcada.** `nao_compareceu`
entra em `totalAgendados`: a pessoa marcou, e não ter ido não desfaz o
agendamento. A definição anterior o excluía, então quem faltou sumia do
numerador **e** do denominador — com 10 comparecimentos e 90 faltas, a tela
exibia 100% de comparecimento. A métrica ficava cega justamente ao número
que o sistema existe para combater.

A taxa de comparecimento usa como denominador as visitas com **desfecho
conhecido**, não toda visita marcada. Incluir o que ainda vai acontecer
faria o número cair sozinho toda vez que alguém agendasse para a semana
seguinte.

**Erro de formulário ligado ao campo.** `aria-describedby` e `aria-invalid`
em todos os seis formulários, via `components/ui/campo.tsx`. Sem isso a
mensagem é um texto vermelho solto abaixo do input: quem enxerga entende
pela proximidade, quem usa leitor de tela tabula até o campo e não ouve
nada. O `role="alert"` cobre o outro momento — quando o erro aparece após o
envio, sem o foco estar no campo.

**Filtro de data validado antes de virar consulta.** Os parâmetros `inicio`
e `fim` vêm da query string, então chegam como o usuário — ou um link
quebrado — quiser. `?inicio=abc` ia direto para o `gte` e derrubava a
página; `?inicio=2026-02-31` passava no formato e falhava no banco. Sem par
coerente, o filtro cai no período padrão em vez de mostrar erro ou lista
vazia sem explicação.

**CPF validado com o algoritmo oficial**, no servidor. A máscara só formata;
`111.111.111-11` passa no regex e é rejeitado no dígito verificador.

---

## Roadmap

Próximos passos naturais, na ordem em que costumam doer:

1. ~~**Metas por agendador**~~ — feito. Alvos mensais e alerta de quem está
   fora do ritmo.
2. **Integração com a API do WhatsApp Business** — o envio de lembrete já usa
   a Cloud API. Falta o outro sentido: o registro nascer da conversa, com
   webhook de mensagens recebidas.
3. ~~**Notificação de véspera**~~ — feito. Falta ligar um provedor de envio
   e agendar a rotina; a lógica e a idempotência estão prontas.
4. ~~**Histórico de participação societária**~~ — feito. A tela *Societário*
   encerra e transfere participações preservando o histórico.
5. ~~**Exportação agendada**~~ — feito. Resumo semanal por e-mail, com link
   para o relatório ao vivo.
6. ~~**Registro de venda**~~ — feito. O funil vai de contato a faturamento.
