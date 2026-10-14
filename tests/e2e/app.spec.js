import { test, expect } from '@playwright/test';

test('renders the sign-in screen when there is no existing session', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(pageErrors, 'The app should not throw browser JavaScript errors').toEqual([]);
});

test('switches between sign-in and account creation forms', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join Prompt Wars' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('signup form uses the minimum expected password length', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');
});

const email = process.env.PW_E2E_STUDENT_EMAIL;
const password = process.env.PW_E2E_STUDENT_PASSWORD;
test('optional staging student can sign in and sees participant-safe navigation', async ({ page }) => {
  test.skip(!email || !password, 'Set PW_E2E_STUDENT_EMAIL and PW_E2E_STUDENT_PASSWORD for staging-account coverage.');
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.role-pill')).toHaveText('student');
  await expect(page.getByRole('button', { name: 'Teams', exact: true })).toHaveCount(0);
});
