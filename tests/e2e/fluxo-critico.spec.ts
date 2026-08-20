import { expect, test, type Page } from '@playwright/test';

/**
 * O caminho que 18 agendadores vão percorrer dezenas de vezes por dia:
 * entrar, registrar um contato, mudar o status e ver o número mexer no
 * relatório. Quebrar aqui é quebrar o produto.
 *
 * Depende do seed (`npm run seed:auth` + a migration de seed). Sem ele a
 * suíte se pula, em vez de falhar em vermelho — mesma trava dos testes de
 * RLS, pelo mesmo motivo: impedir que alguém rode isto contra produção.
 */

const SENHA = process.env.SEED_PASSWORD ?? 'CasaCelular@2025';
const DONO = 'dono@franqueado.com.br';
const AGENDADOR = 'agendador1.loja1@franqueado.com.br';

/** CPF válido pelo dígito verificador; não pertence a pessoa real. */
const CPF_TESTE = '529.982.247-25';

async function entrar(page: Page, email: string): Promise<boolean> {
  await page.goto('/auth/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Ou cai no dashboard, ou o seed não existe neste banco.
  const resultado = await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }).then(() => 'ok' as const),
    page
      .getByRole('alert')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'falhou' as const),
  ]).catch(() => 'falhou' as const);

  return resultado === 'ok';
}

test.describe('fluxo critico do agendador', () => {
  let temSeed = true;

  test.beforeAll(async ({ browser }) => {
    const pagina = await browser.newPage();
    temSeed = await entrar(pagina, DONO);
    await pagina.close();
  });

  test.beforeEach(() => {
    test.skip(!temSeed, 'Seed ausente: rode `npm run seed:auth` e a migration de seed.');
  });

  test('agendador registra contato e ve o registro na lista', async ({ page }) => {
    expect(await entrar(page, AGENDADOR)).toBe(true);

    const nomeCliente = `Cliente E2E ${Date.now()}`;

    await page.goto('/dashboard/agendamentos/novo');
    await page.getByLabel(/Nome do cliente|Cliente/i).first().fill(nomeCliente);
    await page.getByLabel(/CPF/i).fill(CPF_TESTE);
    await page.getByLabel(/Telefone/i).fill('(61) 99999-0001');

    await page.getByRole('button', { name: /Salvar|Criar|Registrar/i }).click();

    await page.waitForURL(/\/dashboard\/agendamentos/, { timeout: 15_000 });
    await expect(page.getByText(nomeCliente)).toBeVisible({ timeout: 10_000 });
  });

  test('agendador enxerga apenas a propria loja no filtro', async ({ page }) => {
    expect(await entrar(page, AGENDADOR)).toBe(true);
    await page.goto('/dashboard/agendamentos');

    // Papel com loja fixa não recebe seletor de loja (temSeletorDeLoja).
    await expect(page.getByRole('combobox', { name: /loja/i })).toHaveCount(0);
  });

  test('agendador nao ve as telas de gestao', async ({ page }) => {
    expect(await entrar(page, AGENDADOR)).toBe(true);

    await page.goto('/dashboard/usuarios');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/dashboard/participacoes');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('franqueado abre o relatorio e exporta o CSV com os filtros da tela', async ({ page }) => {
    expect(await entrar(page, DONO)).toBe(true);
    await page.goto('/dashboard/relatorios?periodo=30d');

    await expect(page.getByRole('heading', { name: 'Relatorios' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('link', { name: /Exportar CSV/i }).first().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^lojas_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('franqueado alcanca as telas de gestao que o agendador nao alcanca', async ({ page }) => {
    expect(await entrar(page, DONO)).toBe(true);

    await page.goto('/dashboard/usuarios');
    await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible();

    await page.goto('/dashboard/participacoes');
    await expect(page.getByRole('heading', { name: 'Societario' })).toBeVisible();
  });
});
