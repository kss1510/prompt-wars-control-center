import { test, expect } from '@playwright/test';

test('participant view works on a phone-sized screen without horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Asha (demo)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo Team Nova' })).toBeVisible();
  await expect(page.locator('.mobile-tabs').getByRole('button', { name: 'Leaderboard' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
