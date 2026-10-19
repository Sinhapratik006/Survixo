import { expect, test } from '@playwright/test';

test('mobile navigation menu opens and navigates', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const nav = page.getByRole('navigation', { name: 'Mobile' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toHaveCount(0);
});

test('dashboard drawer works on small screens', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Mobile Tester');
  await page.getByLabel('Work email').fill(`m${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Dashboard navigation' });
  await drawer.getByRole('link', { name: 'Usage & requests' }).click();
  await expect(page).toHaveURL(/\/dashboard\/usage/);
  await expect(page.getByRole('dialog', { name: 'Dashboard navigation' })).toHaveCount(0);
});
