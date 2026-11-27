import { randomUUID } from 'node:crypto';
import { e2eUserId, e2eWallId, e2eSlotId, expect, test } from './fixtures';
const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
const origin = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
test('durable displacement inbox, slot deep link, preferences and final Wall share/OG/referral', async ({
  scenario,
}) => {
  const placement = randomUUID();
  // Synthetic committed displacement fact; real financial races run separately.
  await scenario.database.pool.query(
    "INSERT INTO placements (id,slot_id,user_id,source) VALUES ($1,$2,$3,'admin')",
    [placement, e2eSlotId, e2eUserId],
  );
  await scenario.database.pool.query(
    "UPDATE placements SET ended_at=clock_timestamp(),end_reason='takeover' WHERE id=$1",
    [placement],
  );
  const user = await scenario.actorContext(e2eUserId);
  const page = await user.newPage();
  await expect
    .poll(
      async () => {
        const r = await user.request.get(`${api}/me/notifications`);
        return (await r.json()).some(
          (item: { kind: string }) => item.kind === 'user_displaced',
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page.goto(`${origin}/me/notifications`);
  await page
    .getByRole('link', { name: 'Your autograph moved to history' })
    .click();
  await expect(page).toHaveURL(new RegExp(`#slot-${e2eSlotId}$`));
  await expect(page.locator(`#slot-${e2eSlotId}`)).toBeVisible();
  await page.goto(`${origin}/me/notifications`);
  await page.getByRole('checkbox', { name: 'In-app notifications' }).uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await user.request.get(`${api}/me/notifications/preferences`)
          ).json()
        ).web,
    )
    .toBe(false);
  const owner = await scenario.actorContext(scenario.ownerId);
  const ended = await owner.request.post(
    `${api}/walls/${e2eWallId}/transitions`,
    { headers: { Origin: origin }, data: { action: 'end' } },
  );
  expect(ended.status()).toBe(200);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`${origin}/walls/${e2eWallId}`);
  await expect(ownerPage.getByLabel('Public username (optional)')).toHaveCount(
    0,
  );
  await ownerPage.getByRole('button', { name: 'Create share card' }).click();
  const link = ownerPage.getByRole('link', { name: 'Open share card' });
  await expect(link).toBeVisible();
  const shareId = (await link.getAttribute('href'))!.split('/').pop()!;
  // Simulate a pre-existing alias without creating an unreviewed text flow.
  await scenario.database.pool.query(
    'UPDATE share_links SET public_alias=$2 WHERE id=$1',
    [shareId, 'Synthetic_channel'],
  );
  await link.click();
  await expect(ownerPage).toHaveURL(new RegExp(`/s/${shareId}$`));
  await expect(
    ownerPage.getByText('Synthetic_channel', { exact: true }),
  ).toHaveCount(0);
  await expect(
    ownerPage.locator('meta[property="og:description"]'),
  ).toHaveAttribute('content', 'View this digital autograph Wall.');
  await expect(ownerPage.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    `${api}/public/shares/${shareId}/card`,
  );
  const image = await owner.request.get(`${api}/public/shares/${shareId}/card`);
  expect(image.headers()['content-type']).toContain('image/png');
  expect((await image.body()).subarray(1, 4).toString()).toBe('PNG');
  const data = await (
    await owner.request.get(`${api}/public/shares/${shareId}`)
  ).json();
  expect(JSON.stringify(data)).not.toContain(scenario.ownerId);
  expect(data.publicAlias).toBeNull();
  expect(JSON.stringify(data)).not.toContain('Synthetic_channel');
  const owned = await (await owner.request.get(`${api}/me/shares`)).json();
  expect(
    owned.items.find((item: { id: string }) => item.id === shareId).publicAlias,
  ).toBe('Synthetic_channel');
  await expect
    .poll(
      async () =>
        (
          await scenario.database.pool.query(
            "SELECT count(*)::int n FROM share_interactions WHERE share_id=$1 AND kind='referral_arrived'",
            [shareId],
          )
        ).rows[0].n,
    )
    .toBe(1);
  expect(
    (
      await owner.request.delete(`${api}/me/shares/${shareId}`, {
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(204);
  expect(
    (await owner.request.get(`${api}/public/shares/${shareId}/card`)).status(),
  ).toBe(404);
});
