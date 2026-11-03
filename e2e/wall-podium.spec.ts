import { e2eWallId, expect, test } from './fixtures';

test('the ten-place podium stays readable in light and dark themes on mobile and desktop', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/walls/' + e2eWallId);
  const slots = page.getByRole('listitem', { name: /^Slot \d+$/ });
  await expect(slots).toHaveCount(10);
  for (const theme of ['light', 'dark']) {
    await page.goto('/me/settings');
    await page
      .getByRole('combobox', { name: 'Color theme' })
      .selectOption(theme);
    await page.goto('/walls/' + e2eWallId);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [index, name] of [
        'Gold place',
        'Silver place',
        'Bronze place',
      ].entries())
        await expect(
          slots.nth(index).getByRole('img', { name, exact: true }),
        ).toBeVisible();
      for (let index = 3; index < 10; index++) {
        await expect(slots.nth(index).getByRole('img')).toHaveCount(0);
        await expect(slots.nth(index)).toHaveCSS(
          'border-top-color',
          'rgb(23, 23, 23)',
        );
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        theme + ' ' + width,
      ).toBe(true);
      await page
        .locator('section[aria-labelledby="slots-heading"]')
        .screenshot({
          path: testInfo.outputPath('podium-' + theme + '-' + width + '.png'),
        });
    }
  }
});
