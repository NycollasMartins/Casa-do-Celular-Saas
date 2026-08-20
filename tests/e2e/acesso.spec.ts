import { expect, test } from '@playwright/test';

/**
 * Proteção de rotas e telas públicas. Não depende de banco povoado, então
 * roda em qualquer máquina — é a rede de segurança contra o pior defeito
 * possível: uma rota do dashboard ficar aberta sem sessão.
 */

const ROTAS_PROTEGIDAS = [
  '/',
  '/dashboard',
  '/dashboard/agendamentos',
  '/dashboard/agendamentos/novo',
  '/dashboard/relatorios',
  '/dashboard/lojas',
  '/dashboard/usuarios',
  '/dashboard/participacoes',
  '/dashboard/privacidade',
  '/admin/franqueados',
];

test.describe('rotas protegidas', () => {
  for (const rota of ROTAS_PROTEGIDAS) {
    test(`${rota} exige sessao e volta para o login`, async ({ page }) => {
      await page.goto(rota);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }

  test('o login guarda o destino para voltar depois de entrar', async ({ page }) => {
    await page.goto('/dashboard/relatorios');
    await expect(page).toHaveURL(/redirect=%2Fdashboard%2Frelatorios/);
  });

  /**
   * Regressao: o middleware redirecionava /api/* para o login. O fetch
   * seguia o redirect, recebia HTML com status 200 e o `.json()` estourava
   * com SyntaxError — o usuario via "Unexpected token '<'" no lugar de
   * "sessao expirada".
   */
  test('a API responde 401 em JSON, nao HTML de login', async ({ request }) => {
    const resposta = await request.get('/api/metricas/resumo', {
      headers: { accept: 'application/json' },
    });

    expect(resposta.status()).toBe(401);
    expect(resposta.headers()['content-type']).toContain('application/json');
    expect(await resposta.json()).toHaveProperty('erro');
  });

  test('a exportacao CSV tambem exige sessao', async ({ request }) => {
    const resposta = await request.get('/api/relatorios/export?tipo=lojas', {
      headers: { accept: 'application/json' },
    });
    expect(resposta.status()).toBe(401);
  });

  /** Clique do usuario no link do CSV: navegacao vai para o login, nao JSON. */
  test('navegacao de documento para /api vai para o login', async ({ page }) => {
    await page.goto('/api/relatorios/export?tipo=lojas');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('telas publicas', () => {
  test('o login mostra os campos e os atalhos', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Esqueci a senha' })).toBeVisible();
  });

  test('credencial errada devolve mensagem generica, sem revelar se o e-mail existe', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill('naoexiste@franqueado.com.br');
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // O Next injeta um <div role="alert"> vazio (__next-route-announcer__),
    // entao o papel sozinho nao identifica o alerta do formulario.
    const alerta = page.locator('form').getByRole('alert');
    await expect(alerta).toBeVisible();
    await expect(alerta).toHaveText(/E-mail ou senha incorretos/i);
    // Nao pode diferenciar "usuario nao existe" de "senha errada".
    await expect(alerta).not.toHaveText(/nao encontrad|nao existe|invalid user/i);
  });

  /**
   * O SMTP do Supabase tem limite de taxa baixo, entao o envio pode falhar
   * por motivo externo ao codigo. O que precisa valer sempre e o contrato
   * com o usuario: alguma resposta aparece, o botao volta a funcionar, e
   * nada revela se o e-mail esta cadastrado.
   */
  test('recuperacao de senha sempre responde e nunca confirma se a conta existe', async ({
    page,
  }) => {
    await page.goto('/auth/forgot-password');
    await page.getByLabel('E-mail').fill('qualquer@franqueado.com.br');

    const botao = page.getByRole('button', { name: 'Enviar link' });
    await botao.click();

    // Sucesso ou falha temporaria — as duas mensagens sao neutras.
    const resposta = page.getByText(
      /Se a conta existir|Nao conseguimos concluir agora|Informe o e-mail/i
    );
    await expect(resposta).toBeVisible({ timeout: 15_000 });

    // Regressao: sem teto de espera, o botao ficava desabilitado para sempre
    // quando o SMTP demorava, e o usuario nao sabia se podia tentar de novo.
    await expect(botao).toBeEnabled({ timeout: 15_000 });

    await expect(page.locator('body')).not.toHaveText(/nao encontrad|nao existe|nao cadastrad/i);
  });

  /**
   * A politica precisa ser alcancavel pelo titular dos dados, que nao tem
   * conta no sistema. Se o middleware exigir sessao aqui, o direito do
   * art. 18 fica inacessivel justamente para quem ele protege.
   */
  test('a politica de privacidade abre sem sessao', async ({ page }) => {
    await page.goto('/privacidade');

    await expect(page).toHaveURL(/\/privacidade$/);
    await expect(page.getByRole('heading', { name: 'Politica de Privacidade' })).toBeVisible();
    await expect(page.getByText(/Lei 13\.709/)).toBeVisible();
  });

  test('a politica lista os direitos do titular', async ({ page }) => {
    await page.goto('/privacidade');

    await expect(page.getByRole('heading', { name: 'Seus direitos' })).toBeVisible();
    await expect(page.getByText(/Pedir a eliminacao dos seus dados/i)).toBeVisible();
  });

  test('a tela de cadastro explica que quem cria acesso e o franqueado', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByText(/criadas pelo franqueado/i)).toBeVisible();
  });

  test('link de nova senha sem sessao nao abre o formulario', async ({ page }) => {
    await page.goto('/auth/nova-senha');
    // Sem sessao nao ha o que atualizar: o link expirou ou foi aberto solto.
    await expect(page).toHaveURL(/\/auth\/(forgot-password|login)/);
  });
});
