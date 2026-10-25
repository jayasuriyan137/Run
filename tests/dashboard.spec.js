import { test, expect } from '@playwright/test';

test('all eight sections render without JavaScript errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/Run/');
  await expect(page.locator('#databaseCount')).toHaveText('0 activities');
  await expect(page.locator('#stat-distance')).toHaveText('0.0 km');
  for (const tab of ['activities', 'strategy', 'training', 'nutrition', 'milestones', 'coach', 'settings', 'overview']) {
    await page.locator(`.sidebar [data-tab="${tab}"]`).click();
    await expect(page.locator(`#tab-${tab}`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('new activity, edit, coaching review, and deletion persist across reloads', async ({ page }) => {
  await page.goto('/#tab-activities');
  await page.locator('[data-action="new"]').click();
  await page.locator('#wDate').fill('2026-10-24');
  await page.locator('#wTitle').fill('Browser test run');
  await page.locator('#wType').fill('Easy run');
  await page.locator('#wKm').fill('5');
  await page.locator('#wDuration').fill('30:00');
  await page.locator('#wHR').fill('145');
  await page.locator('#workoutForm button[type="submit"]').click();
  await page.reload();
  const activity = page.locator('#activityList .activity-card').filter({ hasText: 'Browser test run' });
  await expect(activity).toHaveCount(1);
  await activity.locator('[data-open]').click();
  await page.locator('#editWorkout').click();
  await page.locator('#wTitle').fill('Edited browser test run');
  await page.locator('#workoutForm button[type="submit"]').click();
  await page.reload();
  await expect(page.locator('#activityList')).toContainText('Edited browser test run');
  await page.locator('#activityList .activity-card').filter({ hasText: 'Edited browser test run' }).locator('[data-open]').click();
  await page.locator('#showReviewForm').click();
  await page.locator('#rvSummary').fill('A useful recovery effort.');
  await page.locator('#reviewForm button[type="submit"]').click();
  await expect(page.locator('#modalContent')).toContainText('A useful recovery effort.');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#deleteWorkout').click();
  await page.reload();
  await expect(page.locator('#activityList')).not.toContainText('Edited browser test run');
});

test('run/walk calculator updates and rejects invalid pace', async ({ page }) => {
  await page.goto('/#tab-strategy');
  await page.locator('[data-preset="continuous"]').click();
  await page.locator('#raceDistance').selectOption('10');
  await page.locator('#runPace').fill('6:00');
  await page.locator('#raceExtra').fill('0');
  await expect(page.locator('#raceProjected')).toHaveText('1:00:00');
  await page.locator('[data-preset="500"]').click();
  await expect(page.locator('#raceProjected')).not.toHaveText('1:00:00');
  await page.locator('#runPace').fill('6:90');
  await expect(page.locator('#raceProjected')).toHaveText('Check inputs');
});

test('edits and deletions of imported workouts survive reload', async ({ page }) => {
  await page.goto('/#tab-settings');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ workouts: [{ id: 'synthetic-run', date: '2026-10-24', sport: 'run', title: 'Synthetic test run', distanceKm: 5, durationSec: 1800 }] })) });
  await page.locator('#importBtn').click();
  await expect(page.locator('#importMsg')).toContainText('Imported 1 new');
  await page.locator('.sidebar [data-tab="activities"]').click();
  const originalId = await page.locator('#activityList [data-open]').first().getAttribute('data-open');
  await page.locator('#activityList [data-open]').first().click();
  await page.locator('#editWorkout').click();
  await page.locator('#wTitle').fill('My updated activity title');
  await page.locator('#workoutForm button[type="submit"]').click();
  await page.reload();
  await expect(page.locator('#activityList')).toContainText('My updated activity title');
  await page.locator('#activityList .activity-card').filter({ hasText: 'My updated activity title' }).locator('[data-open]').click();
  await page.locator('#deleteWorkout').click();
  await page.reload();
  expect(await page.locator('#activityList [data-open]').evaluateAll((elements, id) => elements.some(element => element.dataset.open === id), originalId)).toBe(false);
});

test('custom heart-rate settings survive reload', async ({ page }) => {
  await page.goto('/#tab-settings');
  await page.locator('#hrEasyCap').fill('150');
  await page.locator('#hrZ3Low').fill('151');
  await page.locator('#hrZ3High').fill('165');
  await page.locator('#saveZones').click();
  await page.reload();
  await expect(page.locator('#hrEasyCap')).toHaveValue('150');
  await expect(page.locator('#hrZ3Low')).toHaveValue('151');
  await expect(page.locator('#hrZ3High')).toHaveValue('165');
});

test('direct links, tab changes, refresh and back navigation stay in sync', async ({ page }) => {
  await page.goto('/#tab-training');
  await expect(page.locator('#tab-training')).toBeVisible();
  await page.locator('.sidebar [data-tab="nutrition"]').click();
  await expect(page.locator('#tab-nutrition')).toBeVisible();
  await expect(page).toHaveURL(/#tab-nutrition$/);
  await page.reload();
  await expect(page.locator('#tab-nutrition')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#tab-training')).toBeVisible();
});

test('plan completion and nutrition entries persist', async ({ page }) => {
  await page.goto('/#tab-training');
  const checkbox = page.locator('.plancheck').first();
  await checkbox.check();
  await page.reload();
  await expect(page.locator('.plancheck').first()).toBeChecked();
  await page.locator('.sidebar [data-tab="nutrition"]').click();
  await page.locator('#fuelContent').fill('Banana and water before the easy run.');
  await page.locator('#fuelForm button[type="submit"]').click();
  await page.reload();
  await page.locator('.sidebar [data-tab="nutrition"]').click();
  await expect(page.locator('#fuelList')).toContainText('Banana and water before the easy run.');
});

test('JSON export and import round-trip with meaningful validation', async ({ page }) => {
  await page.goto('/#tab-settings');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBackup').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let contents = '';
  for await (const chunk of stream) contents += chunk;
  const backup = JSON.parse(contents);
  expect(backup.workouts).toEqual([]);
  expect(backup.fuel).toEqual([]);
  await page.locator('#importFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"workouts":[{"date":"invalid","sport":"run"}]}') });
  await page.locator('#importBtn').click();
  await expect(page.locator('#importMsg')).toContainText('Import failed:');
  page.on('dialog', dialog => dialog.accept());
  const incoming = { workouts: [{ id: 'import-test', date: '2026-10-24', sport: 'run', type: 'Easy', title: 'Imported activity test', distanceKm: 4, durationSec: 1500, splits: [], reviews: [] }] };
  await page.locator('#importFile').setInputFiles({ name: 'workout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await page.locator('#importBtn').click();
  await expect(page.locator('#importMsg')).toContainText('Imported 1 new');
  await page.reload();
  await page.locator('.sidebar [data-tab="activities"]').click();
  await expect(page.locator('#activityList')).toContainText('Imported activity test');
});

test('mobile navigation works without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#tab-overview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.locator('.mobile-nav [data-tab="activities"], .mobile-bottom-nav [data-tab="activities"], .bottom-nav [data-tab="activities"]').first().click();
  await expect(page.locator('#tab-activities')).toBeVisible();
});

test('desktop presentation has no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('fresh visitors have no personal history or outbound data requests', async ({ page }) => {
  const outbound = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4174/')) outbound.push(request.url()); });
  await page.goto('/#tab-settings');
  await expect(page.locator('#databaseCount')).toHaveText('0 activities');
  await expect(page.locator('#hrEasyCap')).toHaveValue('');
  await expect(page.locator('#hrZ3Low')).toHaveValue('');
  await expect(page.locator('#goalName')).toHaveValue('');
  expect(outbound).toEqual([]);
});

test('session notes and full-backup options restore locally', async ({ page }) => {
  await page.goto('/#tab-training');
  await page.locator('[data-plan-detail]').first().click();
  await page.locator('#sessionTitle').fill('My easy session');
  await page.locator('#sessionNotes').fill('A comfortable conversational effort.');
  await page.locator('#sessionForm button[type="submit"]').click();
  await page.reload();
  await page.locator('[data-plan-detail]').first().click();
  await expect(page.locator('#sessionTitle')).toHaveValue('My easy session');
  await expect(page.locator('#sessionNotes')).toHaveValue('A comfortable conversational effort.');
  await page.keyboard.press('Escape');
  await page.locator('.sidebar [data-tab="settings"]').click();
  page.on('dialog', dialog => dialog.accept());
  const backup = { version: 12, workouts: [{ id: 'sample-backup', date: '2026-10-24', sport: 'run', title: 'Sample restored run', distanceKm: 4, durationSec: 1500, reviews: [{ date: '2026-10-24', summary: 'Test review' }], splits: [{ label: 'Km 1', km: 1, seconds: 360 }] }], fuel: [{ id: 'sample-food', date: '2026-10-24', when: 'After workout', content: 'Sample food note' }], planDone: ['2026-10-24'], options: { easyHrCap: 140, zone3Low: 141, zone3High: 160, goalName: 'My next event', weeklyGoal: 20 } };
  await page.locator('#importFile').setInputFiles({ name: 'full-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('#importBtn').click();
  await expect(page.locator('#importMsg')).toContainText('Imported 1 new');
  await page.reload();
  await expect(page.locator('#databaseCount')).toHaveText('1 activities');
  await expect(page.locator('#hrEasyCap')).toHaveValue('140');
  await expect(page.locator('#goalName')).toHaveValue('My next event');
  await page.locator('.sidebar [data-tab="nutrition"]').click();
  await expect(page.locator('#fuelList')).toContainText('Sample food note');
  await page.locator('.sidebar [data-tab="overview"]').click();
  await expect(page.locator('#stat-distance')).toHaveText('4.0 km');
  await expect(page.locator('#monthlyChart .month-rail')).toHaveCount(12);
});
