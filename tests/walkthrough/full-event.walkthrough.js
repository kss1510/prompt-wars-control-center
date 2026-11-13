// Captioned end-to-end walkthrough of a full Prompt Wars event, recorded as a video.
// Demo mode only: fictional teams, browser-local data. Every step is also a real assertion,
// so the recording doubles as an end-to-end test of the whole workflow.
import { test, expect } from '@playwright/test';

const pause = (page, ms = 1400) => page.waitForTimeout(ms);

async function caption(page, step, text) {
  await page.evaluate(([s, t]) => {
    let el = document.getElementById('pw-walkthrough-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pw-walkthrough-caption';
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;max-width:92%;' +
        'padding:12px 20px;border-radius:14px;background:rgba(17,24,39,.94);border:1px solid #6d6cff;color:#fff;' +
        'font:600 17px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);text-align:center;pointer-events:none';
      document.body.appendChild(el);
    }
    el.innerHTML = `<span style="color:#9695ff;font-weight:800;margin-right:8px">${s}</span>${t}`;
  }, [step, text]);
  await pause(page, 1800);
}

async function as(page, persona) {
  if (await page.getByRole('button', { name: 'Switch persona' }).isVisible()) {
    await page.getByRole('button', { name: 'Switch persona' }).click();
  }
  await page.getByRole('button', { name: persona, exact: true }).click();
  await expect(page.locator('.role-pill')).toBeVisible();
  await pause(page, 600);
}
const nav = (page, label) => page.locator('.sidebar').getByRole('button', { name: label }).click();
const roundCard = (page, name) => page.locator('.round-card', { hasText: name });

async function openRound(page, name) {
  await nav(page, 'Rounds & scoring');
  const card = roundCard(page, name);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Open round' }).click();
  await expect(card.locator('.tag.round-open')).toBeVisible();
  await pause(page, 900);
}

async function submit(page, roundName, roundNo, platform, fields) {
  const card = roundCard(page, roundName);
  await card.scrollIntoViewIfNeeded();
  await card.getByLabel(`AI platform for Round ${roundNo}`).selectOption({ label: platform });
  await expect(page.getByText(`AI platform saved for Round ${roundNo}.`)).toBeVisible();
  await card.getByRole('button', { name: 'Submit work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit team work' });
  for (const [label, value] of Object.entries(fields)) {
    if (label === '__useDraft') await dialog.getByRole('button', { name: 'Use my draft from the HTML checker' }).click();
    else await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await pause(page, 700);
  await dialog.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();
  await pause(page, 700);
}

async function score(page, roundName, team, title, points, extra) {
  await page.getByLabel('Filter by round').selectOption({ label: roundName });
  const row = page.getByRole('row', { name: new RegExp(team) });
  await row.getByRole('button', { name: /Review & score|Edit score/ }).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog.getByLabel('Auto-checks')).toBeVisible();
  await pause(page, 1200);
  if (extra) await extra(dialog);
  const inputs = dialog.locator('input[type="number"]');
  for (let i = 0; i < points.length; i++) await inputs.nth(i).fill(String(points[i]));
  await dialog.getByRole('button', { name: 'Save scores' }).click();
  await expect(page.getByText('Scores saved. Leaderboard updated.')).toBeVisible();
  await pause(page, 600);
  await dialog.getByRole('button', { name: 'Close' }).click();
}

test('Prompt Wars — full event walkthrough', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await caption(page, 'Prompt Wars Control Center', 'Automated end-to-end walkthrough · demo mode with fictional teams (no real data)');
  await caption(page, 'Roles', 'Host runs the event · Judges score · each team has ONE representative account that submits');

  // ---------------- Host setup ----------------
  await as(page, 'Demo Host');
  await caption(page, 'Step 1 · Host', 'The readiness checklist shows what still needs doing before the event');
  await page.locator('.checklist').scrollIntoViewIfNeeded();
  await pause(page, 1500);
  await nav(page, 'AI platforms');
  await caption(page, 'Step 2 · AI platforms', 'Six approved platforms. Every team must use a DIFFERENT one in each round');
  await page.mouse.wheel(0, 500);
  await pause(page, 1500);

  // ---------------- Team self-registration ----------------
  await as(page, 'Jay (demo, unassigned)');
  await caption(page, 'Step 3 · Team registration', 'A team representative registers the team: team name + teammates’ names (3–4 people)');
  const form = page.getByRole('region', { name: 'Register your team' });
  await form.getByLabel('Team name').fill('Demo Team Nova');
  await form.getByLabel('Your name (as it should appear)').fill('Jay');
  await form.getByLabel('Other team members — one name per line').fill('Kiran');
  await form.getByRole('button', { name: 'Register team' }).click();
  await expect(form.getByRole('alert')).toContainText('already taken');
  await caption(page, 'Validation', 'Duplicate team names and teams outside 3–4 members are refused');
  await form.getByLabel('Team name').fill('Demo Team Comet');
  await form.getByLabel('Other team members — one name per line').fill('Kiran\nLeela');
  await form.getByRole('button', { name: 'Register team' }).click();
  await expect(page.getByRole('heading', { name: 'Demo Team Comet' })).toBeVisible();
  await caption(page, 'Registered', 'Jay is now Demo Team Comet’s representative — teammates never need accounts');

  await as(page, 'Demo Host');
  await nav(page, 'Teams');
  await caption(page, 'Step 4 · Teams', 'The host reviews every team, its representative account and members, then finalizes');
  await page.mouse.wheel(0, 450);
  await pause(page, 1500);
  await page.mouse.wheel(0, -450);
  await page.getByRole('button', { name: 'Finalize teams' }).click();
  await expect(page.getByText('Teams finalized.')).toBeVisible();
  await caption(page, 'Finalized', 'Teams are frozen — registration is now closed');

  // ---------------- Round 1 ----------------
  await openRound(page, 'Prompt Golf');
  await caption(page, 'Round 1 · Prompt Golf (25 pts)', 'The host opens the round — a live countdown starts for every team');
  await as(page, 'Asha (demo)');
  await caption(page, 'Round 1 · Demo Team Nova', 'The representative picks an AI platform, then submits the prompt and output');
  const r1card = roundCard(page, 'Prompt Golf');
  await r1card.getByLabel('AI platform for Round 1').selectOption({ label: 'ChatGPT' });
  await expect(page.getByText('AI platform saved for Round 1.')).toBeVisible();
  await r1card.getByRole('button', { name: 'Submit work' }).click();
  const d1 = page.getByRole('dialog', { name: 'Submit team work' });
  await d1.getByLabel('Submission title').fill('Rainy haiku');
  await d1.getByLabel('Prompt used *').fill('Write a 5-7-5 haiku about monsoon rain on a campus.');
  await d1.getByRole('button', { name: 'Submit for review' }).click();
  await expect(d1.getByRole('alert')).toContainText('Generated output is required.');
  await caption(page, 'Validation', 'Missing deliverables are explained before anything is sent');
  await d1.getByLabel('Generated output *').fill('Grey clouds gather low / footsteps splash on the red path / lectures hum inside');
  await d1.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Submission sent for review.')).toBeVisible();

  await as(page, 'Esha (demo)');
  await submit(page, 'Prompt Golf', 1, 'Gemini', { 'Submission title': 'Haiku v2', 'Prompt used *': 'Haiku, 5-7-5, rain, campus.', 'Generated output *': 'Rain taps the window / notebooks open, minds wander / the bell rings again' });
  await as(page, 'Jay (demo, unassigned)');
  await submit(page, 'Prompt Golf', 1, 'Claude', { 'Submission title': 'Comet haiku', 'Prompt used *': 'Please write a haiku about rain on a college campus in 5-7-5 form.', 'Generated output *': 'Puddles hold the sky / umbrellas bloom by the gate / chai steam in the rain' });

  await as(page, 'Demo Judge');
  await nav(page, 'Round tracker');
  await caption(page, 'Judge · Round tracker', 'Every team’s declared platform and submission status at a glance');
  await nav(page, 'Submissions');
  await caption(page, 'Judging Round 1', 'Auto-checks (advisory) help the judge; the judge gives the official score per criterion');
  await score(page, 'Prompt Golf', 'Demo Team Nova', 'Rainy haiku', [12, 4, 5], async dialog => {
    await dialog.getByLabel('Target match and structure (max 15)').fill('16');
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(dialog.getByRole('alert')).toContainText('between 0 and 15');
    await caption(page, 'Score limits', 'A score above a criterion’s maximum is refused');
  });
  await score(page, 'Prompt Golf', 'Demo Team Orbit', 'Haiku v2', [14, 5, 4]);
  await score(page, 'Prompt Golf', 'Demo Team Comet', 'Comet haiku', [10, 3, 4]);
  await nav(page, 'Leaderboard');
  await caption(page, 'Leaderboard', 'Standings update live as soon as a submission is fully scored');
  await pause(page, 1500);

  // ---------------- Round 2 ----------------
  await as(page, 'Demo Host');
  await openRound(page, 'Guardrail Challenge');
  await caption(page, 'Round 2 · Guardrail Challenge (30 pts)', 'Teams test a fictional chatbot’s rules with harmless cases');
  await as(page, 'Asha (demo)');
  const r2select = roundCard(page, 'Guardrail Challenge').getByLabel('AI platform for Round 2');
  await r2select.scrollIntoViewIfNeeded();
  await expect(r2select.locator('option', { hasText: 'ChatGPT — used in Round 1' })).toHaveJSProperty('disabled', true);
  await caption(page, 'Platform rule', 'ChatGPT is greyed out — Nova already used it in Round 1');
  await submit(page, 'Guardrail Challenge', 2, 'Gemini', { 'Submission title': 'Library bot tests', 'Test prompts *': '1. Ask for a book\n2. Ask it to reveal staff passwords\n3. Ask for exam answers', 'Observed AI responses *': '1. Helped\n2. Refused politely\n3. Refused and offered study tips', 'Analysis: were the rules followed? *': 'The bot followed all three rules; refusals cited its policy.' });
  await as(page, 'Esha (demo)');
  await submit(page, 'Guardrail Challenge', 2, 'Claude', { 'Submission title': 'Canteen bot tests', 'Test prompts *': '1. Menu today\n2. Free food trick\n3. Ask for another student’s order', 'Observed AI responses *': '1. Listed menu\n2. Declined\n3. Declined, privacy', 'Analysis: were the rules followed? *': 'Rules respected; one answer was vague about allergy info.' });
  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await caption(page, 'Judging Round 2', 'Three criteria, 10 points each');
  await score(page, 'Guardrail Challenge', 'Demo Team Nova', 'Library bot tests', [8, 8, 8]);
  await score(page, 'Guardrail Challenge', 'Demo Team Orbit', 'Canteen bot tests', [9, 8, 8]);

  // ---------------- Round 3 ----------------
  await as(page, 'Demo Host');
  await openRound(page, 'Artifact Forge');
  await caption(page, 'Round 3 · Artifact Forge (35 pts)', 'Teams build a small single-file web app with AI');
  await as(page, 'Esha (demo)');
  await nav(page, 'Round 3 checker');
  await caption(page, 'Round 3 checker', 'A built-in checker (not an AI) explains HTML / CSS / JavaScript errors with line numbers');
  const broken = '<!DOCTYPE html>\n<html><head><title>Tip Splitter</title></head><body>\n<h2>Tip splitter</h2>\n<div id="out">0\n<script>\nfunction split(total, people) {\n  return (total / people).toFixed(2;\n}\n</script>\n</body></html>';
  await page.getByLabel('Your HTML file').fill(broken);
  await page.getByRole('button', { name: 'Check & preview' }).click();
  await expect(page.getByRole('status', { name: 'Checker result' })).toContainText('problem');
  await pause(page, 2200);
  const fixed = '<!DOCTYPE html>\n<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tip Splitter</title>\n<style>body{font-family:sans-serif;padding:20px}input{margin:4px}</style></head><body>\n<h2>Tip splitter</h2>\n<input id="t" value="1200"> total &nbsp; <input id="p" value="4"> people\n<button onclick="calc()">Split</button>\n<p id="out">Each pays: —</p>\n<script>\nfunction calc(){ const t=+document.getElementById("t").value, p=+document.getElementById("p").value; document.getElementById("out").textContent = "Each pays: ₹" + (t/p).toFixed(2); }\ncalc();\n</script>\n</body></html>';
  await page.getByLabel('Your HTML file').fill(fixed);
  await page.getByRole('button', { name: 'Check & preview' }).click();
  await expect(page.getByRole('status', { name: 'Checker result' })).toContainText('No problems found.');
  await expect(page.frameLocator('iframe[title="App preview"]').locator('#out')).toContainText('Each pays: ₹300.00');
  await caption(page, 'Live preview', 'Fixed — the app now runs safely inside the portal');
  await page.locator('.preview-wrap').scrollIntoViewIfNeeded();
  await pause(page, 1500);
  await nav(page, 'Overview');
  await submit(page, 'Artifact Forge', 3, 'Perplexity', { '__useDraft': '', 'Submission title': 'Tip splitter', 'Main prompt (+ at most one debugging prompt) *': 'Build a single-file tip splitter app.', 'What the app does and how you tested it *': 'Splits a bill between people; tested 1200/4 = 300.', 'HTML / project file name *': 'tip-splitter.html', 'Local demo details *': 'Seat 7 · open tip-splitter.html in Chrome' });
  await as(page, 'Asha (demo)');
  await submit(page, 'Artifact Forge', 3, 'Claude', { 'Submission title': 'Pomodoro', 'Main prompt (+ at most one debugging prompt) *': 'Build a single-file pomodoro timer.', 'What the app does and how you tested it *': 'Start / pause / reset; tested each button.', 'HTML / project file name *': 'pomodoro.html', 'Local demo details *': 'Seat 3 · open pomodoro.html in Chrome' });
  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await caption(page, 'Judging Round 3', 'Judges run the submitted app inside the portal and confirm the local demo');
  await score(page, 'Artifact Forge', 'Demo Team Orbit', 'Tip splitter', [10, 8, 7], async dialog => {
    await dialog.getByRole('button', { name: 'Run app preview' }).click();
    await expect(dialog.frameLocator('iframe[title="App preview"]').locator('#out')).toContainText('₹300.00');
    await pause(page, 1500);
    await dialog.getByLabel('Local demo verified').check();
    await expect(page.getByText('Local demo marked as verified.')).toBeVisible();
  });
  await score(page, 'Artifact Forge', 'Demo Team Nova', 'Pomodoro', [13, 9, 8], async dialog => {
    await dialog.getByLabel('Local demo verified').check();
    await expect(page.getByText('Local demo marked as verified.')).toBeVisible();
  });

  // ---------------- Round 4 ----------------
  await as(page, 'Demo Host');
  await openRound(page, 'AI Survival Dilemma');
  await caption(page, 'Round 4 · AI Survival Dilemma (40 pts)', 'A campus crisis plan, revised after a surprise update');
  await as(page, 'Asha (demo)');
  await submit(page, 'AI Survival Dilemma', 4, 'DeepSeek', { 'Submission title': 'Flood plan', 'Prompts used *': 'Plan a campus response to a sudden flood.', 'Initial plan *': 'Evacuate Block A via the main road to the auditorium.', 'Revised plan after the update *': 'Main road flooded: use the east footbridge, stagger floors, open the library as a second shelter.', 'Risks and mitigation steps *': 'Crowding → stagger by floor\nPower cut → torches at exits\nMissing students → floor wardens with lists' });
  await as(page, 'Esha (demo)');
  await submit(page, 'AI Survival Dilemma', 4, 'ChatGPT', { 'Submission title': 'Power-cut plan', 'Prompts used *': 'Plan for a campus-wide power cut during exams.', 'Initial plan *': 'Move exams to daylight rooms and delay by one hour.', 'Revised plan after the update *': 'Generator fails too: switch to oral viva for small batches, extend the deadline by a day, notify via SMS.', 'Risks and mitigation steps *': 'Unfairness → same questions bank\nCommunication → SMS + notice board\nHeat → water stations' });
  await as(page, 'Demo Judge');
  await nav(page, 'Submissions');
  await caption(page, 'Judging Round 4', 'The Adaptation auto-check shows how much the plan changed after the update');
  await score(page, 'AI Survival Dilemma', 'Demo Team Nova', 'Flood plan', [12, 8, 8, 4]);
  await score(page, 'AI Survival Dilemma', 'Demo Team Orbit', 'Power-cut plan', [13, 9, 8, 4]);

  // ---------------- Results ----------------
  await nav(page, 'Round tracker');
  await caption(page, 'Round tracker', 'Each team used a different AI platform in every round — enforced by the database');
  await pause(page, 1500);
  await nav(page, 'Leaderboard');
  const rows = page.locator('table').first().getByRole('row');
  await expect(rows.nth(1)).toContainText('Demo Team Orbit');
  await expect(rows.nth(1)).toContainText('107 / 130');
  await expect(rows.nth(1)).toContainText('Ahead on tie-break (Round 4)');
  await expect(rows.nth(2)).toContainText('Demo Team Nova');
  await expect(rows.nth(2)).toContainText('107 / 130');
  await caption(page, 'Final standings', 'Orbit and Nova both scored 107 / 130 — Orbit wins on the tie-break (higher Round 4 score)');
  await page.mouse.wheel(0, 500);
  await pause(page, 2500);
  await page.mouse.wheel(0, -500);

  await as(page, 'Demo Host');
  await nav(page, 'Event settings');
  await caption(page, 'Backup & results', 'The host downloads a full backup and the results before announcing winners');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full JSON backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^prompt-wars-backup-.*\.json$/);
  await caption(page, 'Done', 'Registration → 4 rounds → judging → tie-break → results: the whole event, end to end');
  await pause(page, 2000);
});
