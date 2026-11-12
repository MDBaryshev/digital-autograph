import { e2eUserId, expect, test } from './fixtures';

test('a committed preferences change with a lost response recovers by GET without replaying the write', async ({
  scenario,
}) => {
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const context = await scenario.actorContext(e2eUserId);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: { path: string; method: string }[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(api + '/me/notifications'))
      requests.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
      });
  });
  let lostResponse = false;
  await page.route(api + '/me/notifications/preferences', async (route) => {
    if (route.request().method() === 'PUT' && !lostResponse) {
      lostResponse = true;
      // The actual backend commits first; only its browser response is lost.
      const saved = await route.fetch();
      expect(saved.status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto(web + '/me/notifications');
  const checkbox = page.getByRole('checkbox', {
    name: 'In-app notifications',
    exact: true,
  });
  await expect(checkbox).toBeChecked();
  // Initial mount may include an aborted development StrictMode read.
  const readsBefore = requests.filter(
    (request) => request.method === 'GET',
  ).length;
  await checkbox.uncheck();
  await page
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Changes could not be confirmed. Refresh notifications before trying again.',
  );
  const persisted = () =>
    scenario.database.pool.query<{ web: boolean }>(
      'SELECT web FROM notification_preferences WHERE user_id=$1',
      [e2eUserId],
    );
  expect((await persisted()).rows[0]!.web).toBe(false);
  await expect(
    page.getByRole('button', { name: 'Save preferences', exact: true }),
  ).toHaveCount(0);
  expect(requests.filter((request) => request.method === 'GET')).toHaveLength(
    readsBefore,
  );
  const refresh = page.getByRole('button', {
    name: 'Refresh notifications',
    exact: true,
  });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await expect(refresh).toBeFocused();
  expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(
    1,
  );
  expect(requests.filter((request) => request.method === 'GET')).toHaveLength(
    readsBefore + 2,
  );
  await checkbox.check();
  await page
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect.poll(async () => (await persisted()).rows[0]!.web).toBe(true);
  await expect(checkbox).toBeChecked();
  expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(
    2,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
