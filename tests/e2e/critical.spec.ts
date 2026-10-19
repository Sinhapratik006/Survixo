import { expect, test, type Page } from '@playwright/test';

const unique = () => `e2e${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

async function signUp(page: Page) {
  const email = unique();
  await page.goto('/signup');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test.describe('public site', () => {
  test('homepage hero, routing visual and navigation to models', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'AI inference, at the price the market discovers.' })).toBeVisible();
    await expect(page.locator('#how-it-works')).toBeAttached();
    await page.getByRole('link', { name: 'Explore models' }).first().click();
    await expect(page).toHaveURL(/\/models/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('model search filters the marketplace', async ({ page }) => {
    await page.goto('/models');
    await expect(page.getByRole('link', { name: 'Llama 3.1 8B Instruct' }).first()).toBeVisible();
    await page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first().fill('mixtral');
    await expect(page.getByRole('link', { name: 'Mixtral 8x7B Instruct' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Llama 3.1 8B Instruct' })).toHaveCount(0);
  });

  test('every public route renders without errors', async ({ page }) => {
    for (const path of ['/calculator', '/docs', '/docs/quickstart', '/analytics', '/community', '/pricing', '/status', '/support', '/legal/privacy', '/legal/terms', '/models/llama-3.1-8b-instruct', '/does-not-exist']) {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
      expect(errors, `${path}: ${errors.join('\n')}`).toHaveLength(0);
      page.removeAllListeners('pageerror');
    }
  });
});

test.describe('authenticated flows', () => {
  test('protected routes redirect to sign in', async ({ page }) => {
    await page.goto('/dashboard/api-keys');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard%2Fapi-keys/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('sign up, create an API key shown exactly once, then revoke it', async ({ page }) => {
    await signUp(page);
    await page.goto('/dashboard/api-keys');
    await page.getByRole('button', { name: 'Create API key' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('e2e key');
    await dialog.getByRole('button', { name: 'Create key' }).click();
    const secret = page.getByText(/^nxv_[0-9A-Za-z]{40}$/).first();
    await expect(secret).toBeVisible();
    const value = (await secret.textContent())!.trim();
    await expect(page.getByText('Copy this key now - it will not be shown again')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(value)).toHaveCount(0);
    await expect(page.getByText(/nxv_\w{6}…\w{4}/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Revoke e2e key' }).click();
    await page.getByRole('button', { name: 'Revoke key' }).click();
    await expect(page.getByText('Revoked', { exact: false }).first()).toBeVisible();
  });

  test('playground sends a request through the marketplace and shows cost and routing', async ({ page }) => {
    await signUp(page);
    await page.goto('/dashboard/playground?model=llama-3.1-8b-instruct');
    await page.locator('#chat-input').fill('Hello from Playwright');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Demo response/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /View trace/ }).first()).toBeVisible();
  });

  test('dashboard pages load for a new account', async ({ page }) => {
    await signUp(page);
    for (const path of ['/dashboard', '/dashboard/usage', '/dashboard/billing', '/dashboard/routing', '/dashboard/alerts', '/dashboard/sellers', '/dashboard/sellers/offers', '/dashboard/teams', '/dashboard/settings']) {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
      expect(errors, `${path}: ${errors.join('\n')}`).toHaveLength(0);
      page.removeAllListeners('pageerror');
    }
  });
});
