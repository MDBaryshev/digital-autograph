import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'destka-locale',
      value: 'en',
      url: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
    },
  ]);
});
// UI contract fixtures only. Real money/locking lives in PostgreSQL integration tests.
test('provider return is navigation only; status comes from the owner-only backend', async ({
  page,
}) => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  let state = 'provider_pending';
  const methods: string[] = [];
  await page.route(`**/payments/orders/${orderId}**`, async (route) => {
    const method = route.request().method();
    methods.push(method);
    if (method === 'POST') expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: orderId, status: state }),
    });
  });
  await page.goto(
    `/payments/return?orderId=${orderId}&status=succeeded&paid=true`,
  );
  await expect(page.getByRole('status')).toHaveText('Payment is pending.');
  expect(methods.length).toBeGreaterThanOrEqual(1);
  expect(methods.every((method) => method === 'GET')).toBe(true);
  state = 'paid_but_not_fulfilled';
  await page.getByRole('button', { name: 'Refresh payment status' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Manual review is required',
  );
  expect(methods.filter((method) => method === 'POST')).toHaveLength(1);
  expect(methods.at(-1)).toBe('POST');
});
test('anonymous payment return does not expose an order', async ({ page }) => {
  await page.route('**/payments/orders/*', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.goto(
    '/payments/return?orderId=11111111-1111-4111-8111-111111111111',
  );
  await expect(page.getByRole('status')).toHaveText(
    'Sign in to view your payment.',
  );
});

test('mismatched success and a lost refresh response recover by reading the same order', async ({
  page,
}) => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  let state = 'provider_pending';
  let wrongIdentity = true;
  const methods: string[] = [];
  await page.route(`**/payments/orders/${orderId}**`, async (route) => {
    const method = route.request().method();
    methods.push(method);
    if (method === 'POST') {
      state = 'fulfilled';
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      json: wrongIdentity
        ? { id: otherId, status: 'fulfilled' }
        : { id: orderId, status: state },
    });
  });
  await page.goto(
    `/payments/return?orderId=${orderId}&status=fulfilled&paid=true`,
  );
  const recovery = page.getByRole('button', {
    name: 'Check saved payment status',
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await expect(page.getByRole('status')).not.toHaveText(
    'Your placement is complete.',
  );
  wrongIdentity = false;
  await recovery.click();
  await expect(page.getByRole('status')).toHaveText('Payment is pending.');
  await page
    .getByRole('button', { name: 'Refresh payment status', exact: true })
    .click();
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect(page.getByRole('status')).toHaveText(
    'Your placement is complete.',
  );
  expect(methods.filter((method) => method === 'POST')).toHaveLength(1);
  expect(methods.slice(-3)).toEqual(['GET', 'POST', 'GET']);
});
