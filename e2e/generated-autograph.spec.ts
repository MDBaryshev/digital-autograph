import { e2eUserId, expect, test } from './fixtures';

test('signed-in owner creates a ten-place Wall, chooses a generated variant, reviews and places it', async ({
  page,
  scenario,
}, testInfo) => {
  test.setTimeout(120_000);
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  await page.goto(
    api +
      '/auth/test/start?returnTo=' +
      encodeURIComponent('/autograph/create'),
  );
  await page.getByLabel('I am at least 18 years old.').check();
  await page.getByLabel('I accept the Terms of use.').check();
  await page.getByLabel('I accept the Content rules.').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Draw your autograph', exact: true }),
  ).toBeVisible();
  await page.goto('/me/settings');
  await page.getByLabel('Display name', { exact: true }).fill('Generated Fan');
  await page.getByLabel('Username', { exact: true }).fill('generated-fan');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Changes saved.');
  await page.goto('/me/walls');
  await page
    .getByRole('button', { name: 'Create draft Wall', exact: true })
    .click();
  await page.getByRole('button', { name: 'Publish Wall', exact: true }).click();
  await page.getByRole('link', { name: 'Open Wall', exact: true }).click();
  const wallId = page.url().split('/').at(-1)!;
  await expect(page.getByRole('listitem', { name: /^Slot \d+$/ })).toHaveCount(
    10,
  );
  await page.goto('/autograph/create');
  await page
    .getByRole('button', { name: 'AI autograph suggestions', exact: true })
    .click();
  await page.getByLabel('Your nickname', { exact: true }).fill('neo_42');
  const generation = page.waitForResponse(
    (r) =>
      r.url() === api + '/ai/autographs/suggestions' &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Suggest 3 variants', exact: true })
    .click();
  const started = await generation;
  expect(started.status()).toBe(202);
  const request = started.request().postDataJSON();
  await expect(
    page.getByRole('img', { name: /^Autograph variant \d$/ }),
  ).toHaveCount(3);
  const count = async () =>
    (
      await scenario.database.pool.query(
        'SELECT count(*)::int AS n FROM autographs WHERE user_id=$1',
        [e2eUserId],
      )
    ).rows[0].n;
  expect(await count()).toBe(0);
  const replay = await page.request.post(api + '/ai/autographs/suggestions', {
    headers: { origin: web },
    data: request,
  });
  expect(replay.status()).toBe(202);
  expect(
    (
      await scenario.database.pool.query(
        'SELECT count(*)::int AS n FROM ai_autograph_requests WHERE user_id=$1',
        [e2eUserId],
      )
    ).rows[0].n,
  ).toBe(1);
  await page
    .getByRole('button', { name: 'Choose variant 2', exact: false })
    .click();
  expect(await count()).toBe(0);
  const created = page.waitForResponse(
    (r) => r.url() === api + '/autographs' && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create private preview', exact: true })
    .click();
  const autograph = await (await created).json();
  await expect(
    page.getByRole('heading', { name: 'Your cleaned preview', exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const assets = await scenario.database.pool.query(
    'SELECT storage_key FROM autograph_assets WHERE autograph_id=$1',
    [autograph.id],
  );
  expect(assets.rows).toHaveLength(2);
  for (const asset of assets.rows)
    expect(
      (
        await page.request.get(
          process.env.S3_ENDPOINT +
            '/' +
            process.env.S3_BUCKET +
            '/' +
            asset.storage_key,
        )
      ).status(),
    ).toBe(403);
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
  expect(
    (
      await moderator.request.post(
        api + '/moderation/autographs/' + autograph.id + '/decision',
        { headers: { origin: web }, data: { decision: 'approved' } },
      )
    ).status(),
  ).toBe(200);
  await page.goto('/walls/' + wallId);
  const first = page.getByRole('listitem', { name: 'Slot 1', exact: true });
  await first
    .getByRole('button', { name: 'Claim this slot', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm free claim', exact: true })
    .click();
  await expect(
    page.getByText('Your autograph is on the Wall.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  const image = first.getByRole('img', {
    name: 'Digital autograph in slot 1',
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('generated-placed-390.png'),
    fullPage: true,
  });
  const placements = await scenario.database.pool.query(
    'SELECT count(*)::int AS n FROM placements p JOIN slots s ON s.id=p.slot_id WHERE s.wall_id=$1 AND p.ended_at IS NULL',
    [wallId],
  );
  expect(placements.rows[0].n).toBe(1);
});
