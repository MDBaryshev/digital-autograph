import { e2eUserId, e2eWallId, expect, test } from './fixtures';

test('owner finds an old share after reload and revokes it with confirmation; other accounts cannot list or revoke it', async ({
  scenario,
}) => {
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const owner = await scenario.actorContext(scenario.ownerId);
  expect(
    (
      await owner.request.post(`${api}/walls/${e2eWallId}/transitions`, {
        headers: { Origin: web },
        data: { action: 'end' },
      })
    ).status(),
  ).toBe(200);
  const page = await owner.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const deletes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      request.url().startsWith(api + '/me/shares/')
    )
      deletes.push(request.url());
  });
  await page.goto(`${web}/walls/${e2eWallId}`);
  await page
    .getByRole('button', { name: 'Create share card', exact: true })
    .click();
  const share = page.getByRole('link', {
    name: 'Open share card',
    exact: true,
  });
  await expect(share).toBeVisible();
  const path = (await share.getAttribute('href'))!;
  const id = path.split('/').pop()!;
  expect((await owner.request.get(`${api}/public/shares/${id}`)).status()).toBe(
    200,
  );

  const other = await scenario.actorContext(e2eUserId);
  const foreignList = await other.request.get(`${api}/me/shares`);
  expect(foreignList.status()).toBe(200);
  expect(await foreignList.json()).toEqual({ items: [], nextCursor: null });
  expect(
    (
      await other.request.delete(`${api}/me/shares/${id}`, {
        headers: { Origin: web },
      })
    ).status(),
  ).toBe(404);

  await page.goto(`${web}/me/shares`);
  await expect(
    page.getByRole('heading', { name: 'My public links', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open share card', exact: true }),
  ).toHaveAttribute('href', path);
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Open share card', exact: true }),
  ).toHaveAttribute('href', path);
  const revoke = page.getByRole('button', {
    name: 'Revoke public link',
    exact: true,
  });
  await revoke.click();
  await expect(
    page.getByRole('button', { name: 'Confirm revocation', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Cancel revocation', exact: true })
    .click();
  await expect(revoke).toBeFocused();
  expect(deletes).toHaveLength(0);
  expect((await owner.request.get(`${api}/public/shares/${id}`)).status()).toBe(
    200,
  );
  await revoke.click();
  await expect(
    page.getByRole('button', { name: 'Confirm revocation', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Public link revoked.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh links', exact: true }),
  ).toBeFocused();
  expect(deletes).toEqual([`${api}/me/shares/${id}`]);
  expect((await owner.request.get(`${api}/public/shares/${id}`)).status()).toBe(
    404,
  );
  expect(
    (await owner.request.get(`${api}/public/shares/${id}/card`)).status(),
  ).toBe(404);
  const persisted = await scenario.database.pool.query(
    'SELECT revoked_at FROM share_links WHERE id=$1',
    [id],
  );
  expect(persisted.rows[0].revoked_at).not.toBeNull();
  await page.reload();
  await expect(page.getByText(/^Revoked:/)).toBeVisible();
  await expect(revoke).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open share card', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
