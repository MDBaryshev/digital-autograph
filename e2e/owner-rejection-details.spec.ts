import { e2eUserId, expect, test } from './fixtures';

test('owner reads the persisted rejection reason after moderator review without a mutation or private preview request', async ({
  scenario,
}) => {
  test.setTimeout(120_000);
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const owner = await scenario.actorContext(e2eUserId);
  const page = await owner.newPage();
  await page.goto(web + '/autograph/create');
  const canvas = page.getByLabel('Autograph drawing area', { exact: true });
  await canvas.focus();
  await canvas.press('Space');
  for (const key of [
    'ArrowRight',
    'ArrowRight',
    'ArrowRight',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
    'ArrowRight',
  ])
    await canvas.press(key);
  await canvas.press('Space');
  const created = page.waitForResponse(
    (response) =>
      response.url() === api + '/autographs' &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create private preview', exact: true })
    .click();
  const autograph = await (await created).json();
  await expect(
    page.getByRole('heading', { name: 'Your cleaned preview', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('button', {
      name: 'Approve and submit for moderation',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Submitted for moderation',
      exact: true,
    }),
  ).toBeVisible();

  const moderator = await scenario.actorContext(scenario.ownerId);
  const moderationPage = await moderator.newPage();
  await moderationPage.goto(web + '/moderation');
  await moderationPage.getByRole('button', { name: /^canvas ·/ }).click();
  await expect(
    moderationPage.getByRole('button', { name: 'Approve', exact: true }),
  ).toBeEnabled();
  await moderationPage
    .getByLabel('Rejection reason', { exact: true })
    .selectOption('NOT_AN_AUTOGRAPH');
  await moderationPage
    .getByRole('button', { name: 'Reject', exact: true })
    .click();
  await expect(
    moderationPage.getByText('Rejected. The owner can see the reason code.', {
      exact: true,
    }),
  ).toBeVisible();

  const saved = await (
    await owner.request.get(api + '/autographs/' + autograph.id)
  ).json();
  expect(saved.status).toBe('moderation_rejected');
  expect(saved.moderation.reasonCode).toBe('NOT_AN_AUTOGRAPH');
  const requests: { url: string; method: string }[] = [];
  page.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  await page.goto(web + '/me/autographs');
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(page.getByText('Not an autograph', { exact: true })).toHaveCount(
    0,
  );
  expect(
    requests.filter(
      (request) => request.url === api + '/autographs/' + autograph.id,
    ),
  ).toHaveLength(0);
  await page
    .getByRole('button', { name: 'View rejection details', exact: true })
    .click();
  const details = page.getByRole('region', {
    name: 'Rejection details',
    exact: true,
  });
  await expect(
    details.getByText('Not an autograph', { exact: true }),
  ).toBeVisible();
  await expect(details.locator('time')).toHaveAttribute(
    'datetime',
    saved.moderation.decidedAt,
  );
  await expect(
    details.getByRole('link', { name: 'Start a new autograph', exact: true }),
  ).toHaveAttribute('href', '/autograph/create');
  expect(
    requests.filter(
      (request) => request.url === api + '/autographs/' + autograph.id,
    ),
  ).toEqual([{ url: api + '/autographs/' + autograph.id, method: 'GET' }]);
  expect(requests.filter((request) => request.method !== 'GET')).toHaveLength(
    0,
  );
  expect(requests.some((request) => request.url.endsWith('/preview'))).toBe(
    false,
  );
  await page
    .getByRole('button', { name: 'Close rejection details', exact: true })
    .click();
  await expect(details).toHaveCount(0);
});
