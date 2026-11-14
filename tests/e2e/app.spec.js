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

/** Fill member rows (Member N name) starting at row `from` (1-based). */
async function fillMembers(scope, names, from = 1) {
  for (const [i, n] of names.entries()) await scope.getByLabel(`Member ${from + i} name`).fill(n);
}

test('sign-up registers a team of 5 with roles, checked before sending', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Register a team' })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Your full name (team representative)').fill('Asha Rao');
  await page.getByLabel('Email').fill('asha@example.com');
  await page.getByLabel('Password').fill('long-enough-pw');
  await page.getByLabel('Team name').fill('Prompt Pioneers');
  await expect(page.getByLabel('Member 1 name')).toHaveValue('Asha Rao');
  await expect(page.getByLabel('Member 1 role')).toHaveValue('Pilot');
  await expect(page.getByText('Team size: 1 including you (needs 5–5)')).toBeVisible();
  await page.getByRole('button', { name: 'Create account & register team' }).click();
  await expect(page.getByRole('alert')).toContainText('Teams need 5 to 5 members including you (you entered 1)');
  await fillMembers(page, ['Bilal', 'bilal', 'Dev', 'Esha'], 2);
  await page.getByRole('button', { name: 'Create account & register team' }).click();
  await expect(page.getByRole('alert')).toContainText('listed twice');
  await page.getByLabel('Member 3 name').fill('Chitra');
  await expect(page.getByText('Team size: 5 including you (needs 5–5)')).toBeVisible();
  await page.getByLabel('Member 2 role').selectOption('Pilot');
  await page.getByRole('button', { name: 'Create account & register team' }).click();
  await expect(page.getByRole('alert')).toContainText('one Pilot');
  await page.getByLabel('Member 2 role').selectOption('');
  await page.getByRole('button', { name: 'Create account & register team' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a role for every team member');
});

test('organizers sign up without a team; roles are never chosen at sign-up', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('radio', { name: 'Organizer / judge' }).click();
  await expect(page.getByLabel('Team name')).toHaveCount(0);
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Judge and host access is given by the event host, never chosen at sign-up.')).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0); // no role picker anywhere
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
