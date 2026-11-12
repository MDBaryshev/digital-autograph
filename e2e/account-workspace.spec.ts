import { e2eUserId, expect, test } from './fixtures';
test.use({ uiLocale: 'ru' });
test('maximum-length public names remain readable without horizontal overflow', async ({
  scenario,
}) => {
  const context = await scenario.actorContext(e2eUserId);
  const page = await context.newPage();
  const name = 'Ж'.repeat(80);
  const response = await context.request.put(
    (process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000') + '/me/profile',
    {
      headers: { origin: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000' },
      data: { displayName: name, slug: 'long-name-owner' },
    },
  );
  expect(response.status()).toBe(200);
  await scenario.approveProfileSubmission((await response.json()).submissionId);
  await page.goto((process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000') + '/me');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  for (const width of [320, 390, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      `overflow at ${width}px`,
    ).toBe(true);
  }
});
test('owner sets up a profile, creates a draft and explicitly publishes their own Wall', async ({
  scenario,
}, testInfo) => {
  const context = await scenario.actorContext(e2eUserId);
  const page = await context.newPage();
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  await page.goto(web + '/me');
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByLabel('Отображаемое имя', { exact: true }).fill('Александр');
  await page.getByLabel('Ник', { exact: true }).fill('my-studio');
  await page
    .getByRole('button', { name: 'Сохранить профиль', exact: true })
    .click();
  await expect(page.getByText('Изменения профиля на проверке.')).toBeVisible();
  const moderator = await scenario.actorContext(scenario.ownerId);
  const review = await moderator.newPage();
  await review.goto(web + '/moderation');
  await review.getByRole('button', { name: 'Профили', exact: true }).click();
  await review.getByRole('button', { name: /Публичный профиль ·/ }).click();
  await expect(review.getByText('Александр', { exact: true })).toBeVisible();
  await review.setViewportSize({ width: 320, height: 850 });
  expect(
    await review.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await review.screenshot({
    path: testInfo.outputPath('profile-review-320.png'),
    fullPage: true,
  });
  await review.getByRole('button', { name: 'Одобрить', exact: true }).click();
  await expect(
    review.getByText('Изменения профиля опубликованы.'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('link', { name: 'Александр', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Мои стены', exact: true }).click();
  await expect(page.getByLabel('Количество мест', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Создать черновик стены', exact: true })
    .click();
  await expect(
    page.getByText('Черновик · Мест: 10', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Открыть стену', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Опубликовать стену', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Подтвердить: Опубликовать стену',
      exact: true,
    })
    .click();
  await page.getByRole('link', { name: 'Открыть стену', exact: true }).click();
  await expect(page).toHaveURL(/\/walls\/[a-f0-9-]+$/);
  await expect(page.getByRole('listitem', { name: /^Место \d+$/ })).toHaveCount(
    10,
  );
  const states = await scenario.database.pool.query(
    'SELECT w.status,w.slot_count FROM walls w JOIN creators c ON c.id=w.creator_id WHERE c.owner_user_id=$1',
    [e2eUserId],
  );
  expect(states.rows).toEqual([{ status: 'live', slot_count: 10 }]);
  await page.goto(web + '/me');
  await page.setViewportSize({ width: 1000, height: 850 });
  await expect(
    page.getByRole('heading', { name: 'Александр', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('account-overview.png'),
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1440])
    for (const scale of [100, 200]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (s) => {
          document.documentElement.style.fontSize = s + 'px';
        },
        (16 * scale) / 100,
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '16px';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Основная навигация' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('account-mobile-menu.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Меню', exact: true }),
  ).toBeFocused();
});
