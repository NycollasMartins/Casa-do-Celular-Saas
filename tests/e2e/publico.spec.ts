import { expect, test } from '@playwright/test';

/**
 * O que da para verificar num navegador SEM estar logado.
 *
 * POR QUE ISTO EXISTE
 * A outra suite de ponta a ponta cobre o fluxo do agendador, e depende dos
 * usuarios do seed — que nao existem no banco de producao. Na pratica ela
 * nunca rodou, e o navegador nunca exercitou esta aplicacao em lugar nenhum.
 *
 * Estes casos nao precisam de login, entao rodam sempre que a aplicacao
 * sobe. Cobrem o portao: quem nao entrou nao passa, o que e publico abre, e a
 * resposta traz os cabecalhos de seguranca.
 */

test.describe('superficie publica', () => {
  test('rota protegida manda para o login, preservando o destino', async ({ page }) => {
    const resposta = await page.goto('/dashboard/agendamentos');

    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fdashboard%2Fagendamentos/);
    expect(resposta?.status()).toBe(200);
  });

  test('rota inexistente tambem cai no login, nao vaza a aplicacao', async ({ page }) => {
    // O middleware cobre tudo que nao esta na lista de aberto. Uma rota que
    // nao existe nao deve nem revelar que nao existe para quem nao entrou.
    await page.goto('/uma-rota-que-nao-existe');

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('a politica de privacidade abre sem sessao', async ({ page }) => {
    // O titular dos dados normalmente nao tem conta no sistema. Se esta
    // pagina exigisse login, a politica seria inalcancavel para quem ela
    // existe para atender.
    const resposta = await page.goto('/privacidade');

    expect(resposta?.status()).toBe(200);
    await expect(page).toHaveURL(/\/privacidade$/);
  });

  test('convite invalido nao abre o formulario, e nao diz por que', async ({ page }) => {
    // Um token com o formato certo mas que nao existe no banco. A resposta e
    // a mesma de expirado e de ja usado, de proposito: distinguir ajudaria
    // mais quem esta testando tokens do que quem tem um convite legitimo.
    const tokenFalso = 'a'.repeat(43);
    const resposta = await page.goto(`/convite/${tokenFalso}`);

    expect(resposta?.status()).toBe(200);
    // Nao foi redirecionado para o login: a rota e aberta.
    await expect(page).toHaveURL(new RegExp(`/convite/${tokenFalso}$`));
    await expect(page.getByText(/Convite indisponivel/i)).toBeVisible();
    // O formulario nao pode existir na pagina, nem escondido.
    await expect(page.locator('#razao_social')).toHaveCount(0);
    await expect(page.getByText(/expirado|ja ter sido usado/i)).toBeVisible();
  });

  test('token com formato invalido nem chega a consultar', async ({ page }) => {
    // `pareceToken` filtra antes do banco. Sem isso, a rota publica seria um
    // caminho barato de sondagem.
    for (const lixo of ['abc', "' or 1=1--", 'a'.repeat(200)]) {
      const resposta = await page.goto(`/convite/${encodeURIComponent(lixo)}`);

      expect(resposta?.status()).toBe(200);
      await expect(page.getByText(/Convite indisponivel/i)).toBeVisible();
    }
  });

  test('a conferencia de saude responde sem sessao', async ({ request }) => {
    // Ela precisa responder justamente quando ninguem consegue entrar.
    const resposta = await request.get('/api/saude');
    const corpo = await resposta.json();

    expect([200, 503]).toContain(resposta.status());
    expect(corpo).toHaveProperty('ambiente');
    expect(corpo).toHaveProperty('banco');
    // Nunca devolve valor de variavel nenhuma, so o nome da que falta.
    expect(JSON.stringify(corpo)).not.toMatch(/eyJ|supabase\.co|postgres:\/\//);
  });

  test('a resposta traz os cabecalhos de seguranca', async ({ page }) => {
    const resposta = await page.goto('/auth/login');
    const cabecalhos = resposta?.headers() ?? {};

    // Sem enquadramento, qualquer site embute o dashboard num iframe
    // invisivel e captura cliques de quem esta autenticado.
    expect(cabecalhos['x-frame-options']).toBe('DENY');
    expect(cabecalhos['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(cabecalhos['x-content-type-options']).toBe('nosniff');
    expect(cabecalhos['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('a tela de login e utilizavel por teclado e por leitor de tela', async ({ page }) => {
    await page.goto('/auth/login');

    // Campo sem rotulo e invisivel para leitor de tela: getByLabel so acha o
    // que esta associado de verdade.
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();

    await page.getByLabel('E-mail').focus();
    await expect(page.getByLabel('E-mail')).toBeFocused();
  });

  test('credencial errada devolve mensagem generica, sem revelar se o e-mail existe', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill('naoexiste@teste.local');
    await page.getByLabel('Senha').fill('senhaerrada123');
    await page.getByRole('button', { name: /entrar/i }).click();

    const aviso = page.locator('text=/incorretos|Muitas tentativas/i').first();
    await aviso.waitFor({ timeout: 20000 });

    // "E-mail nao encontrado" contaria a quem tenta descobrir contas.
    await expect(page.locator('text=/nao encontrado|nao existe|nao cadastrad/i')).toHaveCount(0);
  });
});
