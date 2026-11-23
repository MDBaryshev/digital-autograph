import { randomUUID } from 'node:crypto';
import { test, expect, e2eUserId, e2eWallId, e2eSlotId } from './fixtures';

const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';

test('public hold uses server time, survives reload, dims the slot and releases after server cancellation', async ({
  scenario,
}, testInfo) => {
  const db = scenario.database.pool;
  const config = (
    await db.query(
      `INSERT INTO pricing_config_versions
    (algorithm_version,currency,base_amount_minor,minimum_amount_minor,maximum_amount_minor,dynamic_takeover_limit,takeover_step_size,step_amount_minor,decay_interval_seconds,decay_amount_minor,decay_floor_amount_minor,guaranteed_visibility_seconds,created_by_user_id)
    VALUES ('takeover_ladder_v1','RUB',8900,8900,498900,49,1,10000,60,0,8900,2700,$1) RETURNING id`,
      [scenario.ownerId],
    )
  ).rows[0].id;
  await db.query('UPDATE walls SET pricing_config_id=$2 WHERE id=$1', [
    e2eWallId,
    config,
  ]);
  await db.query(
    "INSERT INTO placements(slot_id,user_id,source,started_at) VALUES($1,$2,'free_claim',now()-interval '1 hour')",
    [e2eSlotId, scenario.ownerId],
  );
  const buyer = await scenario.actorContext(e2eUserId);
  const headers = { origin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000' };
  const quote = await buyer.request.post(
    `${api}/walls/${e2eWallId}/slots/${e2eSlotId}/takeover-quote`,
    { headers, data: {} },
  );
  expect(quote.status()).toBe(201);
  const response = await buyer.request.post(`${api}/takeover-reservations`, {
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    data: { quoteId: (await quote.json()).id },
  });
  expect(response.status()).toBe(201);
  const hold = await response.json();
  expect(Date.parse(hold.expiresAt) - Date.parse(hold.createdAt)).toBe(300000);
  const page = await buyer.newPage();
  // A badly wrong device clock must not end a server-owned five-minute hold.
  await page.addInitScript(() => {
    Date.now = () => Date.parse('2050-01-01T00:00:00Z');
  });
  await page.goto(`/walls/${e2eWallId}`);
  const slot = page.locator(`#slot-${e2eSlotId}`);
  await expect(slot).toHaveAttribute('data-reserved', 'true');
  await expect(
    slot.getByText('Reserved for payment', { exact: true }),
  ).toBeVisible();
  await expect(slot.getByRole('timer')).toHaveText(/0[45]:[0-5][0-9]/);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await slot.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`reservation-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(slot.getByRole('timer')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('reservation-320-200.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.reload();
  await expect(slot).toHaveAttribute('data-reserved', 'true');
  await expect(slot.getByRole('timer')).toHaveText(/0[45]:[0-5][0-9]/);
  const cancelled = await buyer.request.post(
    `${api}/takeover-reservations/${hold.id}/cancel`,
    { headers, data: {} },
  );
  expect(cancelled.status()).toBe(200);
  await expect(slot).not.toHaveAttribute('data-reserved', 'true', {
    timeout: 10000,
  });
  const publicWall = await (
    await page.request.get(`${api}/walls/${e2eWallId}`)
  ).json();
  expect(
    publicWall.slots.find((s: { id: string }) => s.id === e2eSlotId)
      .reservationExpiresAt,
  ).toBeNull();
  expect(JSON.stringify(publicWall)).not.toContain(hold.id);
});
