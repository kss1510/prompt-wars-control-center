// Full event workflow in demo mode (browser-local sample data; no Supabase).
// These tests prove the UI and the shared JS rules. Database enforcement is proven separately
// by tests/db (PGlite) and, against a real project, tests/integration.
import { test, expect } from '@playwright/test';

let pageErrors = [];
// Errors a test deliberately triggers inside the sandboxed app preview (team code, not portal code).
let expectedErrors = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  expectedErrors = [];
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
});
test.afterEach(() => expect(pageErrors.filter(e => !expectedErrors.includes(e)), 'no uncaught browser errors').toEqual([]));

async function as(page, persona) {
  if (await page.getByRole('button', { name: 'Switch persona' }).isVisible()) {
    await page.getByRole('button', { name: 'Switch persona' }).click();
  }
  await page.getByRole('button', { name: persona, exact: true }).click();
  await expect(page.locator('.role-pill')).toBeVisible();
}
const nav = (page, label) => page.locator('.sidebar').getByRole('button', { name: label }).click();
const roundCard = (page, name) => page.locator('.round-card', { hasText: name });

async function hostOpensRounds(page, ...names) {
  await as(page, 'Demo Host');
  await nav(page, 'Rounds & scoring');
  for (const name of names) {
    await roundCard(page, name).getByRole('button', { name: 'Open round' }).click();
    await expect(roundCard(page, name).locator('.tag.round-open')).toBeVisible();
  }
}

test('demo mode is clearly labelled and never presented as real event data', async ({ page }) => {
  await expect(page.getByText('DEMO MODE · SAMPLE DATA ONLY')).toBeVisible();
  await as(page, 'Demo Host');
  await expect(page.getByRole('status').filter({ hasText: 'DEMO MODE' })).toContainText('Not real event data');
  await expect(page.locator('.footer')).toContainText('demo workspace (not real data)');
  await expect(page.locator('.checklist')).toContainText('6 active (ChatGPT, Gemini, Claude, DeepSeek, Microsoft Copilot, Perplexity)');
});

test('students see participant navigation only', async ({ page }) => {
  await as(page, 'Asha (demo)');
  await expect(page.locator('.role-pill')).toHaveText('student');
  for (const hidden of ['Teams', 'Event settings', 'Submissions', 'Round tracker']) {
    await expect(page.locator('.sidebar').getByRole('button', { name: hidden, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Demo Team Nova' })).toBeVisible();
});

test('full round workflow: distinct platforms, validation, judging limits and leaderboard', async ({ page }) => {
  // Host approves a fourth platform and opens rounds 1 and 2.
  await as(page, 'Demo Host');
  await nav(page, 'AI platforms');
  await page.getByLabel('New platform name').fill('Mistral Le Chat');
  await page.getByRole('button', { name: 'Add platform' }).click();
  await expect(page.getByRole('cell', { name: 'Mistral Le Chat' })).toBeVisible();
  await hostOpensRounds(page, 'Prompt Golf', 'Guardrail Challenge');

  // Student declares ChatGPT for Round 1 and submits; missing deliverables are explained first.
  await as(page, 'Asha (demo)');
  await roundCard(page, 'Prompt Golf').getByLabel('AI platform for Round 1').selectOption({ label: 'ChatGPT' });
  await expect(page.getByText('AI platform saved for Round 1.')).toBeVisible();
  await roundCard(page, 'Prompt Golf').getByRole('button', { name: 'Submit work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit team work' });
  await dialog.getByLabel('Submission title').fill('Haiku golf');
  await dialog.getByLabel('Prompt used *').fill('Write a 3-line haiku about rain, 5-7-5.');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Generated output is required.');
  await dialog.getByLabel('Generated output *').fill('Soft rain on tin roofs…');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();
  await expect(roundCard(page, 'Prompt Golf').getByLabel('AI platform for Round 1')).toBeDisabled();

  // ChatGPT cannot be reused in Round 2; the option explains where it was used.
  const r2 = roundCard(page, 'Guardrail Challenge').getByLabel('AI platform for Round 2');
  await expect(r2.locator('option', { hasText: 'ChatGPT — used in Round 1' })).toHaveJSProperty('disabled', true);
  await r2.selectOption({ label: 'Gemini' });
  await expect(page.getByText('AI platform saved for Round 2.')).toBeVisible();
  await expect(roundCard(page, 'Artifact Forge').getByLabel('AI platform for Round 3')
    .locator('option', { hasText: 'Gemini — used in Round 2' })).toHaveJSProperty('disabled', true);

  // Judge: criterion limit is enforced, then a valid score updates status and leaderboard.
  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await expect(page.getByRole('row', { name: /Demo Team Nova/ })).toContainText('ChatGPT');
  await page.getByRole('row', { name: /Demo Team Nova/ }).getByRole('button', { name: 'Review & score' }).click();
  const review = page.getByRole('dialog', { name: 'Haiku golf' });
  await review.getByLabel('Target match and structure (max 15)').fill('16');
  await review.getByLabel('Constraint compliance (max 5)').fill('4');
  await review.getByLabel('Brevity and clarity (max 5)').fill('5');
  await review.getByRole('button', { name: 'Save scores' }).click();
  await expect(review.getByRole('alert')).toContainText('between 0 and 15');
  await review.getByLabel('Target match and structure (max 15)').fill('12');
  await review.getByRole('button', { name: 'Save scores' }).click();
  await expect(page.getByText('Scores saved. Leaderboard updated.')).toBeVisible();
  await review.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: /Demo Team Nova/ })).toContainText('21 / 25');

  await nav(page, 'Leaderboard');
  const novaRow = page.locator('table').first().getByRole('row', { name: /Demo Team Nova/ });
  await expect(novaRow).toContainText('21 / 130');
  await expect(page.locator('table').first().getByRole('row').nth(1)).toContainText('Demo Team Nova');

  // Round tracker shows the declared platforms per team-round.
  await nav(page, 'Round tracker');
  await expect(page.getByTestId('cell-1-1')).toContainText('ChatGPT');
  await expect(page.getByTestId('cell-1-2')).toContainText('Gemini');
  await expect(page.getByTestId('cell-2-1')).toContainText('No platform');

  // Student sees their score once scored.
  await as(page, 'Bilal (demo)');
  await expect(roundCard(page, 'Prompt Golf')).toContainText('21 / 25');
});

test('only one platform left is explained, and a closed round locks submissions', async ({ page }) => {
  await as(page, 'Demo Host');
  await nav(page, 'AI platforms');
  for (const name of ['DeepSeek', 'Microsoft Copilot', 'Perplexity']) {
    await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText(`${name} deactivated.`)).toBeVisible();
  }
  await hostOpensRounds(page, 'Prompt Golf', 'Guardrail Challenge');
  await as(page, 'Esha (demo)');
  await roundCard(page, 'Prompt Golf').getByLabel('AI platform for Round 1').selectOption({ label: 'ChatGPT' });
  await expect(page.getByText('AI platform saved for Round 1.')).toBeVisible();
  await roundCard(page, 'Guardrail Challenge').getByLabel('AI platform for Round 2').selectOption({ label: 'Gemini' });
  await expect(page.getByText('AI platform saved for Round 2.')).toBeVisible();
  await expect(roundCard(page, 'Artifact Forge')).toContainText('Only Claude is still available to your team');
  await roundCard(page, 'Artifact Forge').getByLabel('AI platform for Round 3').selectOption({ label: 'Claude' });
  await expect(roundCard(page, 'AI Survival Dilemma')).toContainText('No approved AI platform is left');

  await as(page, 'Demo Host');
  await nav(page, 'Rounds & scoring');
  await roundCard(page, 'Prompt Golf').getByRole('button', { name: 'Close now' }).click();
  await expect(roundCard(page, 'Prompt Golf').locator('.tag.round-closed')).toBeVisible();
  await as(page, 'Esha (demo)');
  await expect(roundCard(page, 'Prompt Golf').getByRole('button', { name: 'Closed' })).toBeDisabled();
  await expect(roundCard(page, 'Prompt Golf').getByLabel('AI platform for Round 1')).toBeDisabled();
});

test('Artifact Forge requires local demo details, rejects localhost evidence links, and judges verify the demo', async ({ page }) => {
  await hostOpensRounds(page, 'Artifact Forge');
  await as(page, 'Chitra (demo)');
  const card = roundCard(page, 'Artifact Forge');
  await card.getByLabel('AI platform for Round 3').selectOption({ label: 'Claude' });
  await expect(page.getByText('AI platform saved for Round 3.')).toBeVisible();
  await card.getByRole('button', { name: 'Submit work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit team work' });
  await expect(dialog).toContainText('Judges verify it at your seat');
  await dialog.getByLabel('Submission title').fill('Pomodoro');
  await dialog.getByLabel('Main prompt (+ at most one debugging prompt) *').fill('Build a single-file pomodoro timer.');
  await dialog.getByLabel('What the app does and how you tested it *').fill('Start/stop/reset; tested each button.');
  await dialog.getByLabel('HTML / project file name *').fill('pomodoro.html');
  await dialog.getByLabel(/Screenshot link/).fill('http://localhost:5500/pomodoro.html');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Local demo details is required.');
  await expect(dialog.getByRole('alert')).toContainText('A localhost link only works on your own laptop');
  await dialog.getByLabel('Local demo details *').fill('Seat 12 · open pomodoro.html in Chrome');
  await dialog.getByLabel(/Screenshot link/).fill('');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();

  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await expect(page.getByRole('row', { name: /Demo Team Nova/ })).toContainText('Demo not verified');
  await page.getByRole('row', { name: /Demo Team Nova/ }).getByRole('button', { name: 'Review & score' }).click();
  const review = page.getByRole('dialog', { name: 'Pomodoro' });
  await expect(review).toContainText('Seat 12 · open pomodoro.html in Chrome');
  await review.getByLabel('Local demo verified').check();
  await expect(page.getByText('Local demo marked as verified.')).toBeVisible();
  await review.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: /Demo Team Nova/ })).toContainText('Demo verified');
});

test('Round 4 stores initial and revised plans separately', async ({ page }) => {
  await hostOpensRounds(page, 'AI Survival Dilemma');
  await as(page, 'Dev (demo)');
  const card = roundCard(page, 'AI Survival Dilemma');
  await card.getByLabel('AI platform for Round 4').selectOption({ label: 'DeepSeek' });
  await expect(page.getByText('AI platform saved for Round 4.')).toBeVisible();
  await card.getByRole('button', { name: 'Submit work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit team work' });
  await dialog.getByLabel('Submission title').fill('Flood response');
  await dialog.getByLabel('Prompts used *').fill('Plan for a campus flood.');
  await dialog.getByLabel('Initial plan *').fill('Evacuate block A.');
  await dialog.getByLabel('Revised plan after the update *').fill('Block A road closed: use the east exit.');
  await dialog.getByLabel('Risks and mitigation steps *').fill('Crowding → stagger by floor.');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();
  await card.getByRole('button', { name: 'View' }).click();
  const view = page.getByRole('dialog', { name: 'Flood response' });
  await expect(view.getByRole('heading', { name: 'Initial plan' })).toBeVisible();
  await expect(view.getByRole('heading', { name: 'Revised plan after the update' })).toBeVisible();
  await expect(view).toContainText('Block A road closed: use the east exit.');
});

test('host team management: create, rename, captain, and finalize only with valid sizes', async ({ page }) => {
  await as(page, 'Demo Host');
  await nav(page, 'Teams');
  await page.getByRole('button', { name: 'Create team' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create team' });
  await dialog.getByLabel('Team name').fill('Demo Team Comet');
  await dialog.getByLabel(/Assign registered students/).selectOption({ label: 'Jay (demo, unassigned)' });
  await dialog.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByText('Team created.')).toBeVisible();
  const comet = page.getByTestId('team-Demo Team Comet');
  await expect(comet).toContainText('1/4 MEMBERS');

  await page.getByRole('button', { name: 'Finalize teams' }).click();
  await expect(page.getByRole('alert')).toContainText('Demo Team Comet has 1 member (needs 3–4)');

  await comet.getByRole('button', { name: 'Rename Demo Team Comet' }).click();
  await comet.getByLabel('Team name').fill('Demo Team Meteor');
  await comet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Team renamed.')).toBeVisible();
  const meteor = page.getByTestId('team-Demo Team Meteor');
  await meteor.getByRole('button', { name: 'Make captain' }).click();
  await expect(page.getByText('Captain set.')).toBeVisible();
  await meteor.getByRole('button', { name: 'Delete Demo Team Meteor' }).click();
  await expect(page.getByText('Team deleted.')).toBeVisible();

  await page.getByRole('button', { name: 'Finalize teams' }).click();
  await expect(page.getByText('Teams finalized.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create team' })).toBeDisabled();
  await expect(page.getByTestId('team-Demo Team Nova').getByLabel('Assign a student')).toHaveCount(0);
});

test('roster import validates every line before applying', async ({ page }) => {
  await as(page, 'Demo Host');
  await nav(page, 'Teams');
  await page.getByRole('button', { name: 'Import roster' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import roster' });
  await dialog.getByLabel('Roster CSV').fill('email,team,captain\ndemo-unassigned@demo.local,Demo Team Orbit,\nnobody@demo.local,Demo Team Orbit');
  await dialog.getByRole('button', { name: 'Check roster' }).click();
  await expect(dialog).toContainText('No registered account with this email.');
  await expect(dialog.getByRole('button', { name: /Import 2 rows/ })).toBeDisabled();
  await dialog.getByLabel('Roster CSV').fill('demo-unassigned@demo.local,Demo Team Orbit');
  await dialog.getByRole('button', { name: 'Check roster' }).click();
  await expect(dialog).toContainText('Will be added.');
  await dialog.getByRole('button', { name: /Import 1 rows/ }).click();
  await expect(page.getByText('Roster imported.')).toBeVisible();
  await expect(page.getByTestId('team-Demo Team Orbit')).toContainText('4/4 MEMBERS');
});

test('host can hide standings from students and set a tie-break rule', async ({ page }) => {
  await as(page, 'Demo Host');
  await nav(page, 'Event settings');
  await page.getByLabel(/Tie-break rule/).fill('Higher Round 4 score');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Event settings saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Hide from students' }).click();
  await expect(page.getByText('Leaderboard hidden from students.')).toBeVisible();
  await nav(page, 'Leaderboard');
  await expect(page.getByText('Tie-break (applied automatically): Higher Round 4 score, then Round 3')).toBeVisible();
  await as(page, 'Asha (demo)');
  await nav(page, 'Leaderboard');
  await expect(page.getByText('Standings are hidden by the host until the results announcement.')).toBeVisible();
});

test('Round 3 checker explains errors, previews the app safely, and judges see the same app with auto-checks', async ({ page }) => {
  await as(page, 'Gauri (demo)');
  await nav(page, 'Round 3 checker');
  await expect(page.getByText('checker, not an AI', { exact: false })).toBeVisible();
  expectedErrors.push('Unexpected end of input'); // the broken sample below runs in the sandbox
  const broken = '<!DOCTYPE html>\n<html><head><title>Clicker</title></head><body>\n<div id="n">0\n<script>\nlet n = 0;\ndocument.body.onclick = () => { n++; document.getElementById("n").textContent = n;\n</script>\n</body></html>';
  await page.getByLabel('Your HTML file').fill(broken);
  await page.getByRole('button', { name: 'Check & preview' }).click();
  const result = page.getByRole('status', { name: 'Checker result' });
  await expect(result).toContainText('problem');
  await expect(result).toContainText('JavaScript');
  await expect(result).toContainText('<div> (line 3) is not closed');

  const fixed = '<!DOCTYPE html>\n<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clicker</title></head><body>\n<div id="n">0</div>\n<script>\nlocalStorage.setItem("k", "1");\ndocument.getElementById("n").textContent = "ready";\n</script>\n</body></html>';
  await page.getByLabel('Your HTML file').fill(fixed);
  await page.getByRole('button', { name: 'Check & preview' }).click();
  await expect(result).toContainText('No problems found.');
  // Runs inside the sandbox even though the app uses localStorage.
  await expect(page.frameLocator('iframe[title="App preview"]').locator('#n')).toHaveText('ready');

  // Host opens Round 3; the team submits with the draft from the checker.
  await as(page, 'Demo Host');
  await nav(page, 'Rounds & scoring');
  await roundCard(page, 'Artifact Forge').getByRole('button', { name: 'Open round' }).click();
  await expect(roundCard(page, 'Artifact Forge').locator('.tag.round-open')).toBeVisible();
  await as(page, 'Gauri (demo)');
  const card = roundCard(page, 'Artifact Forge');
  await card.getByLabel('AI platform for Round 3').selectOption({ label: 'Perplexity' });
  await expect(page.getByText('AI platform saved for Round 3.')).toBeVisible();
  await card.getByRole('button', { name: 'Submit work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit team work' });
  await dialog.getByRole('button', { name: 'Use my draft from the HTML checker' }).click();
  await dialog.getByLabel('Submission title').fill('Clicker');
  await dialog.getByLabel('Main prompt (+ at most one debugging prompt) *').fill('Build a clicker.');
  await dialog.getByLabel('What the app does and how you tested it *').fill('Counts clicks.');
  await dialog.getByLabel('HTML / project file name *').fill('clicker.html');
  await dialog.getByLabel('Local demo details *').fill('Seat 7 · open clicker.html');
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();

  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await page.getByRole('row', { name: /Demo Team Orbit/ }).getByRole('button', { name: 'Review & score' }).click();
  const review = page.getByRole('dialog', { name: 'Clicker' });
  const checks = review.getByLabel('Auto-checks');
  await expect(checks).toContainText('All required parts present');
  await expect(checks).toContainText('No problems found.');
  await expect(checks).toContainText('Not verified yet');
  await review.getByRole('button', { name: 'Run app preview' }).click();
  await expect(review.frameLocator('iframe[title="App preview"]').locator('#n')).toHaveText('ready');
});

test('leaderboard breaks equal totals by Round 4 first', async ({ page }) => {
  await hostOpensRounds(page, 'Prompt Golf', 'AI Survival Dilemma');
  const plan = { 'Submission title': 'Plan', 'Prompts used *': 'p', 'Initial plan *': 'a', 'Revised plan after the update *': 'b c', 'Risks and mitigation steps *': 'r' };
  const golf = { 'Submission title': 'Golf', 'Prompt used *': 'p', 'Generated output *': 'o' };
  async function submit(persona, roundName, platform, fields) {
    await as(page, persona);
    const card = roundCard(page, roundName);
    await card.locator('select').selectOption({ label: platform });
    await expect(page.getByText(/AI platform saved/)).toBeVisible();
    await card.getByRole('button', { name: 'Submit work' }).click();
    const dialog = page.getByRole('dialog', { name: 'Submit team work' });
    for (const [label, value] of Object.entries(fields)) await dialog.getByLabel(label, { exact: true }).fill(value);
    await dialog.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submission sent for review.')).toBeVisible();
  }
  await submit('Asha (demo)', 'Prompt Golf', 'ChatGPT', golf);
  await submit('Esha (demo)', 'AI Survival Dilemma', 'Gemini', plan);
  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  async function score(team, values) {
    await page.getByRole('row', { name: new RegExp(team) }).getByRole('button', { name: 'Review & score' }).click();
    const dialog = page.getByRole('dialog');
    const inputs = dialog.locator('input[type="number"]');
    for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(String(values[i]));
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(page.getByText('Scores saved. Leaderboard updated.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  }
  await score('Demo Team Nova', [10, 5, 5]);
  await score('Demo Team Orbit', [10, 5, 3, 2]);
  await nav(page, 'Leaderboard');
  const rows = page.locator('table').first().getByRole('row');
  await expect(rows.nth(1)).toContainText('Demo Team Orbit');
  await expect(rows.nth(1)).toContainText('Ahead on tie-break (Round 4)');
  await expect(rows.nth(2)).toContainText('Demo Team Nova');
  await expect(rows.nth(2)).toContainText('02');
});
