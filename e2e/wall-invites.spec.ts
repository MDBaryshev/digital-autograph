import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { e2eWallId, expect, test } from './fixtures';

test('a guest can copy and download a readable QR invitation before any claim', async ({
  page,
  scenario,
}, testInfo) => {
  test.setTimeout(60_000);
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: web });
  await page.goto('/walls/' + e2eWallId);
  const invite = page.getByRole('region', { name: 'Invite to this Wall' });
  await invite.getByRole('button', { name: 'Copy Wall link' }).click();
  await expect(invite.getByRole('status')).toHaveText('Link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    web + '/walls/' + e2eWallId,
  );
  await invite.getByText('Show QR code', { exact: true }).click();
  await expect(
    invite.getByRole('img', { name: 'QR code for this Wall' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await invite.getByRole('link', { name: 'Download QR code' }).click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const { data, info } = await sharp(await readFile(file!))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(
    web + '/walls/' + e2eWallId,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    api + '/walls/' + e2eWallId + '/invite-card?locale=en',
  );
  const card = await page.request.get(
    api + '/walls/' + e2eWallId + '/invite-card?locale=en',
  );
  expect(card.status()).toBe(200);
  expect((await sharp(await card.body()).metadata()).width).toBe(1200);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await invite.screenshot({ path: testInfo.outputPath('wall-invitation.png') });
  const owner = await scenario.actorContext(scenario.ownerId);
  for (const action of ['end', 'archive'])
    expect(
      (
        await owner.request.post(api + '/walls/' + e2eWallId + '/transitions', {
          headers: { origin: web },
          data: { action },
        })
      ).status(),
    ).toBe(200);
  expect(
    (
      await page.request.get(api + '/walls/' + e2eWallId + '/invite-card')
    ).status(),
  ).toBe(404);
});
