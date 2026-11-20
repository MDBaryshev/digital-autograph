import { e2eUserId, expect, test } from './fixtures';

test('an approved autograph persists in the public cube and is removed on withdrawal', async ({
  page: guest,
  scenario,
}) => {
  test.setTimeout(120_000);
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const owner = await scenario.actorContext(e2eUserId);
  const moderator = await scenario.actorContext(scenario.ownerId);
  const page = await owner.newPage();

  await page.goto(`${web}/autograph/create`);
  const canvas = page.getByLabel('Autograph drawing area', { exact: true });
  await canvas.focus();
  for (const key of [
    'Space',
    'ArrowRight',
    'ArrowRight',
    'ArrowDown',
    'ArrowRight',
    'ArrowRight',
    'ArrowUp',
    'ArrowRight',
    'Space',
  ]) {
    await canvas.press(key);
  }
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${api}/autographs` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create private preview' }).click();
  const { id } = await (await created).json();
  await page
    .getByRole('button', { name: 'Approve and submit for moderation' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Submitted for moderation' }),
  ).toBeVisible();
  const decision = await moderator.request.post(
    `${api}/moderation/autographs/${id}/decision`,
    { headers: { Origin: web }, data: { decision: 'approved' } },
  );
  expect(decision.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${web}/community-cube/live`);
  await page.getByRole('radio').check();
  await page
    .getByRole('button', { name: 'Place 1 · Free', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Publish autograph', exact: true })
    .click();
  const saved = page.getByText('Your autograph is saved at place 1.', {
    exact: true,
  });
  await expect(saved).toBeVisible();
  await page.reload();
  await expect(saved).toBeVisible();

  await guest.goto(`${web}/community-cube/live`);
  await expect(
    guest.getByRole('img', { name: 'Place 1 · Occupied' }),
  ).toBeVisible();
  const media = await guest.request.get(`${api}/community-cube/cells/1/media`);
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toContain('image/png');
  expect(media.headers()['cache-control']).toBe('no-store');

  await page.getByRole('button', { name: 'Withdraw autograph' }).click();
  await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
  await expect(saved).toHaveCount(0);
  expect(
    (await guest.request.get(`${api}/community-cube/cells/1/media`)).status(),
  ).toBe(404);
  await guest.reload();
  await expect(
    guest.getByRole('img', { name: 'Place 1 · Free' }),
  ).toBeVisible();
  const autograph = await owner.request.get(`${api}/autographs/${id}`);
  expect((await autograph.json()).status).toBe('ready');
});
