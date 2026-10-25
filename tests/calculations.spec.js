import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kolkata' });

// Expected values below are hand-calculated from complete run/walk cycles,
// with walking distance included and no walk added after the finish.
const scenarios = [
  { name: 'continuous 10K', preset: 'continuous', finish: '1:00:00', pace: '6:00/km', walks: '0', checkpoint: '30:00' },
  { name: '500 m / 60 s', preset: '500', finish: '1:08:30', pace: '6:51/km', walks: '17', checkpoint: '34:00' },
  { name: '1 km / 60 s', preset: '1000', finish: '1:04:30', pace: '6:27/km', walks: '9', checkpoint: '32:00' },
  { name: '2 km / 60 s', preset: '2000', finish: '1:02:00', pace: '6:12/km', walks: '4', checkpoint: '31:00' },
  { name: '5 minutes / 60 s', preset: '300', finish: '1:05:00', pace: '6:30/km', walks: '10', checkpoint: '32:30' },
  { name: 'extra stopped time', preset: '1000', extra: '2', finish: '1:06:30', pace: '6:39/km', walks: '9', checkpoint: '33:00' },
  { name: 'finish before the first walk', segment: '3000', distance: '3', finish: '18:00', pace: '6:00/km', walks: '0' },
  { name: 'finish partway through a walk', segment: '2900', walk: '120', distance: '3', finish: '18:36', pace: '6:12/km', walks: '1' },
  { name: 'finish at a run boundary', segment: '1400', walk: '144', distance: '3', finish: '19:12', pace: '6:24/km', walks: '1' },
  { name: 'finish at a walk boundary', segment: '1000', walk: '360', distance: '3', finish: '24:00', pace: '8:00/km', walks: '2' },
  { name: 'short time intervals', mode: 'time', segment: '30', distance: '3', finish: '27:00', pace: '9:00/km', walks: '18' },
  { name: 'small intervals without a computation limit', segment: '1', walk: '0', distance: '42.195', runPace: '6:40', finish: '4:41:18', pace: '6:40/km', walks: '0' },
];

for (const scenario of scenarios) {
  test(`run/walk arithmetic: ${scenario.name}`, async ({ page }) => {
    await page.goto('/#tab-strategy');
    await page.locator(`[data-preset="${scenario.preset || '1000'}"]`).click();
    await page.locator('#runPace').fill(scenario.runPace || '6:00');
    await page.locator('#walkPace').fill('12:00');
    await page.locator('#raceDistance').selectOption(scenario.distance || '10');
    if (scenario.mode) await page.locator('#runMode').selectOption(scenario.mode);
    if (scenario.segment) await page.locator('#runSegment').fill(scenario.segment);
    if (scenario.walk) await page.locator('#walkBreak').fill(scenario.walk);
    await page.locator('#raceExtra').fill(scenario.extra || '0');
    await expect(page.locator('#raceProjected')).toHaveText(scenario.finish);
    await expect(page.locator('#raceOverall')).toHaveText(scenario.pace);
    await expect(page.locator('#raceWalks')).toHaveText(scenario.walks);
    await expect(page.locator('#projectedCheckpoints .metric-pair').last().locator('strong')).toHaveText(scenario.finish);
    if (scenario.checkpoint) await expect(page.locator('#projectedCheckpoints .metric-pair').first().locator('strong')).toHaveText(scenario.checkpoint);
  });
}

test('all goal distances produce correct continuous finish times and second rounding', async ({ page }) => {
  await page.goto('/#tab-strategy');
  await page.locator('[data-preset="continuous"]').click();
  await page.locator('#runPace').fill('6:00');
  for (const [distance, finish] of [['3', '18:00'], ['5', '30:00'], ['10', '1:00:00'], ['21.0975', '2:06:35'], ['42.195', '4:13:10']]) {
    await page.locator('#raceDistance').selectOption(distance);
    await expect(page.locator('#raceProjected')).toHaveText(finish);
    await expect(page.locator('#raceOverall')).toHaveText('6:00/km');
    await expect(page.locator('#raceWalks')).toHaveText('0');
  }
});

test('invalid calculator inputs clear previous results and the removed preset is absent', async ({ page }) => {
  await page.goto('/#tab-strategy');
  await expect(page.locator('[data-preset]')).toHaveCount(5);
  await expect(page.locator('[data-preset="descending"]')).toHaveCount(0);
  for (const [field, value] of [['runPace', '0:00'], ['runPace', '6:90'], ['walkPace', 'invalid'], ['runSegment', '0'], ['runSegment', '30001'], ['walkBreak', '-1'], ['walkBreak', '1001'], ['raceExtra', '-1'], ['raceExtra', '121']]) {
    const input = page.locator(`#${field}`), previous = await input.inputValue();
    await input.fill(value);
    await expect(page.locator('#raceProjected')).toHaveText('Check inputs');
    await expect(page.locator('#raceOverall')).toHaveText('—');
    await expect(page.locator('#projectedCheckpoints')).toBeEmpty();
    await input.fill(previous);
  }
});

async function importBackup(page, backup) {
  await page.goto('/#tab-settings');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'synthetic-calculation-fixtures.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('#importBtn').click();
  await expect(page.locator('#importMsg')).toContainText('Imported');
}

test('milestones use full matching distances, paired official times and the fastest valid effort', async ({ page }) => {
  const run = (id, distanceKm, durationSec, extra = {}) => ({ id, date: '2026-10-24', title: id, sport: 'run', evidence: 'confirmed', distanceKm, durationSec, source: 'Synthetic calculation fixture', ...extra });
  await importBackup(page, { workouts: [
    run('400m-ordinary', 0.4, 84),
    run('400m-official', 0.425, 80, { officialDistanceKm: 0.4, officialDurationSec: 78 }),
    run('short-400m', 0.39, 30),
    run('overlong-400m', 0.42, 40),
    run('mile-watch-rounded', 1.61, 430),
    run('mile-official', 1.65, 425, { officialDistanceKm: 1.609344, officialDurationSec: 420 }),
    run('short-mile', 1.6, 300),
    run('20km-official', 20.3, 7000, { officialDistanceKm: 20, officialDurationSec: 6900 }),
    run('short-20km', 19.99, 6500),
    run('incomplete-official-pair', 10, 3000, { officialDistanceKm: 20, officialDurationSec: null }),
    run('50km', 50, 18000),
    run('short-50km', 49.99, 9000),
    run('other-sport', 50, 7200, { sport: 'football' }),
    run('short-1km', 0.98, 100),
    run('5km', 5, 1500),
    run('unconfirmed-5km', 5, 1000, { evidence: 'reported' }),
  ] });
  await page.locator('.sidebar [data-tab="milestones"]').click();
  await expect(page.locator('#milestoneCards .milestone')).toHaveCount(12);
  const card = name => page.locator('#milestoneCards .milestone').filter({ has: page.getByText(name, { exact: true }) });
  for (const [name, time] of [['400 m', '1:18'], ['1 mile', '7:00'], ['20 km', '1:55:00'], ['50 km', '5:00:00'], ['10 km', '50:00'], ['5 km', '25:00'], ['1 km', '—:—']]) await expect(card(name).locator('b')).toHaveText(time);
  await page.reload();
  await expect(card('1 mile').locator('b')).toHaveText('7:00');
});

test('a rounded watch mile qualifies but a 1.6 km partial run does not', async ({ page }) => {
  await importBackup(page, { workouts: [
    { id: 'rounded-mile', date: '2026-10-24', sport: 'run', evidence: 'confirmed', distanceKm: 1.61, durationSec: 430 },
    { id: 'partial-mile', date: '2026-10-24', sport: 'run', evidence: 'confirmed', distanceKm: 1.6, durationSec: 300 },
  ] });
  await page.locator('.sidebar [data-tab="milestones"]').click();
  await expect(page.locator('.milestone').filter({ has: page.getByText('1 mile', { exact: true }) }).locator('b')).toHaveText('7:10');
});

test('distance, time, monthly totals and activity rings use the correct sports and date windows', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T06:00:00+05:30'));
  const run = (id, date, distanceKm, durationSec, sport = 'run') => ({ id, date, distanceKm, durationSec, sport });
  await importBackup(page, { workouts: [
    run('outside-window', '2026-10-19', 5, 1500),
    run('window-start', '2026-10-20', 5, 1500),
    run('weekend', '2026-10-25', 8, 2880),
    run('today', '2026-10-26', 2, 660),
    run('football', '2026-10-26', 4, 3600, 'football'),
    run('previous-year', '2025-10-26', 1, 600),
  ], fuel: [], planDone: ['2026-10-20', '2026-10-26'], options: { weeklyGoal: 10 } });
  await page.locator('.sidebar [data-tab="overview"]').click();
  for (const [id, value] of [['stat-distance', '21.0 km'], ['stat-count', '6'], ['stat-duration', '179 min'], ['stat-longest', '8.0 km'], ['weekKmMetric', '15.0 km'], ['weekSportMinutes', '144 min'], ['weekSessionsMetric', '4'], ['weekChecksMetric', '2']]) await expect(page.locator(`#${id}`)).toHaveText(value);
  await expect(page.locator('#monthlyChart .month').nth(9)).toHaveAttribute('title', '2026-10: 20.00 km');
  expect(await page.locator('#ringDistance').evaluate(el => Number(el.style.getPropertyValue('--percent')))).toBe(100);
  expect(await page.locator('#ringChecks').evaluate(el => Number(el.style.getPropertyValue('--percent')))).toBeCloseTo(200 / 7, 8);
  await page.locator('[data-range="week"]').click();
  for (const [id, value] of [['weekKmMetric', '2.0 km'], ['weekSportMinutes', '71 min'], ['weekSessionsMetric', '2'], ['weekChecksMetric', '1']]) await expect(page.locator(`#${id}`)).toHaveText(value);
  await page.locator('.sidebar [data-tab="activities"]').click();
  await expect(page.locator('#activityList .activity-card').filter({ has: page.locator('[data-open="today"]') })).toContainText('5:30/km');
});
