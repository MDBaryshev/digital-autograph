import { e2eWallId, expect, test } from './fixtures';

test.use({ uiLocale: 'ru' });
test('administrator reads a record at mobile width and loses access immediately on the next read after revocation', async ({
  scenario,
}, testInfo) => {
  await scenario.database.pool.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'admin')",
    [scenario.ownerId],
  );
  const context = await scenario.actorContext(scenario.ownerId);
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/admin');
  await page.getByLabel('ID записи', { exact: true }).fill(e2eWallId);
  await page.getByRole('button', { name: 'Найти запись', exact: true }).click();
  await expect(page.getByText(e2eWallId, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('admin-lookup-320.png'),
    fullPage: true,
  });
  await scenario.database.pool.query(
    "DELETE FROM user_roles WHERE user_id=$1 AND role='admin'",
    [scenario.ownerId],
  );
  await page.getByRole('button', { name: 'Найти запись', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Нужен доступ администратора.',
  );
  await expect(page.getByText(e2eWallId, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('ID записи', { exact: true })).toHaveCount(0);
});
