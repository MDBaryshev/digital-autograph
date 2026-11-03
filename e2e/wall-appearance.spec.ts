import sharp from 'sharp';
import { e2eWallId, expect, test } from './fixtures';

test('owner imports a private account avatar, can replace it, and publishes responsive Wall appearance', async ({
  scenario,
}, testInfo) => {
  test.setTimeout(120_000);
  const provider =
    'data:image/jpeg;base64,' +
    (
      await sharp({
        create: { width: 256, height: 256, channels: 3, background: '#6e78da' },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64');
  await scenario.database.pool.query(
    'INSERT INTO account_appearance(user_id,provider_avatar_data_url) VALUES($1,$2)',
    [scenario.ownerId, provider],
  );
  const context = await scenario.actorContext(scenario.ownerId);
  const page = await context.newPage();
  await page.goto(
    (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000') + '/me/settings',
  );
  await expect(page.getByLabel('Avatar source')).toHaveValue('provider');
  await page.getByLabel('Wall name', { exact: true }).fill('Our ten places');
  await page
    .getByLabel('Wall description', { exact: true })
    .fill('Leave your mark here.');
  const photo = await sharp({
    create: { width: 600, height: 400, channels: 3, background: '#f5cf78' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Upload avatar', { exact: true }).setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await expect(page.getByLabel('Avatar source')).toHaveValue('upload');
  await page
    .getByLabel('Upload cover', { exact: true })
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: photo });
  await expect(
    page.getByRole('img', { name: 'Cover preview', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Save Wall appearance', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Wall appearance saved.');
  const stored = await scenario.database.pool.query(
    'SELECT avatar_data_url FROM account_appearance WHERE user_id=$1',
    [scenario.ownerId],
  );
  expect(stored.rows[0].avatar_data_url).not.toBe(provider);
  // A later sign-in changes only the private candidate.
  await scenario.database.pool.query(
    'UPDATE account_appearance SET provider_avatar_data_url=$2 WHERE user_id=$1',
    [scenario.ownerId, provider],
  );
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('combobox', { name: 'Color theme' })
      .selectOption(theme);
    await page.goto(
      (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000') +
        '/walls/' +
        e2eWallId,
    );
    await expect(
      page.getByRole('heading', { name: 'Our ten places', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Wall owner avatar' }),
    ).toHaveAttribute('src', stored.rows[0].avatar_data_url);
    await expect(page.getByRole('img', { name: 'Wall cover' })).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath('appearance-' + theme + '-' + width + '.png'),
        fullPage: true,
      });
    }
    await page.goto(
      (process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000') + '/me/settings',
    );
  }
  // Choosing initials survives reload and a later text-only update.
  await page.getByLabel('Avatar source').selectOption('none');
  await page
    .getByRole('button', { name: 'Save Wall appearance', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Wall appearance saved.');
  await page.reload();
  await expect(page.getByLabel('Avatar source')).toHaveValue('none');
  await page.getByLabel('Wall name', { exact: true }).fill('Initials only');
  await page
    .getByRole('button', { name: 'Save Wall appearance', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Wall appearance saved.');
  const result = await scenario.database.pool.query(
    'SELECT avatar_source,avatar_data_url FROM account_appearance WHERE user_id=$1',
    [scenario.ownerId],
  );
  expect(result.rows).toEqual([
    { avatar_source: 'none', avatar_data_url: null },
  ]);
});
