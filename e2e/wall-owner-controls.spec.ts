import { e2eUserId, e2eWallId, expect, test } from './fixtures';

const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';

test('owner confirms pause, resume, irreversible end and archive through the UI', async ({
  scenario,
}, testInfo) => {
  const owner = await scenario.actorContext(scenario.ownerId);
  const page = await owner.newPage();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/transitions'))
      writes.push(request.postData() ?? '');
  });
  await page.goto(web + '/me/walls');
  const pause = page.getByRole('button', { name: 'Pause Wall', exact: true });
  await pause.click();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pause).toBeFocused();
  expect(writes).toHaveLength(0);
  await pause.click();
  await page
    .getByRole('button', { name: 'Confirm: Pause Wall', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resume Wall', exact: true }),
  ).toBeEnabled();
  expect(
    (
      await scenario.database.pool.query(
        'SELECT status FROM walls WHERE id=$1',
        [e2eWallId],
      )
    ).rows[0].status,
  ).toBe('paused');
  await page.getByRole('button', { name: 'Resume Wall', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm: Resume Wall', exact: true })
    .click();
  await expect(pause).toBeEnabled();
  await page.getByRole('button', { name: 'End Wall', exact: true }).click();
  await expect(page.getByText(/Ending cannot be undone/)).toBeVisible();
  // Opening focuses the safe cancellation choice; Tab reaches explicit confirm.
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Confirm: End Wall', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Archive Wall', exact: true }),
  ).toBeEnabled();
  expect((await owner.request.get(`${api}/walls/${e2eWallId}`)).status()).toBe(
    200,
  );
  await page.getByRole('button', { name: 'Archive Wall', exact: true }).click();
  await expect(page.getByText(/Archiving cannot be undone/)).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const fontSize of [16, 32]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`;
      }, fontSize);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const confirmation = await page
        .getByRole('group', { name: 'Confirm Wall action' })
        .boundingBox();
      expect(confirmation?.width).toBeGreaterThan(200);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '16px';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath('wall-archive-confirmation-mobile.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Confirm: Archive Wall', exact: true })
    .click();
  await expect(
    page.getByText(
      'This Wall is archived. Your account cannot create another Wall.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open Wall', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Create draft Wall', exact: true }),
  ).toHaveCount(0);
  expect((await owner.request.get(`${api}/walls/${e2eWallId}`)).status()).toBe(
    404,
  );
  expect(writes.map((body) => JSON.parse(body).action)).toEqual([
    'pause',
    'resume',
    'end',
    'archive',
  ]);
  expect(
    (
      await scenario.database.pool.query(
        'SELECT status,slot_count FROM walls WHERE id=$1',
        [e2eWallId],
      )
    ).rows[0],
  ).toEqual({ status: 'archived', slot_count: 10 });
});

test('a lost response after committed pause is recovered by reading status, never replaying the action', async ({
  scenario,
}) => {
  const owner = await scenario.actorContext(scenario.ownerId);
  const page = await owner.newPage();
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/transitions'))
      writes++;
  });
  await page.goto(web + '/me/walls');
  await page.route(`**/walls/${e2eWallId}/transitions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Pause Wall', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm: Pause Wall', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Refresh Wall status', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'End Wall', exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await page
    .getByRole('button', { name: 'Refresh Wall status', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resume Wall', exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(1);
  const other = await scenario.actorContext(e2eUserId);
  expect(
    (
      await other.request.post(`${api}/walls/${e2eWallId}/transitions`, {
        headers: { Origin: web },
        data: { action: 'end' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await scenario.database.pool.query(
        'SELECT status FROM walls WHERE id=$1',
        [e2eWallId],
      )
    ).rows[0].status,
  ).toBe('paused');
});
