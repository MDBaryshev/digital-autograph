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
    // Wait for the client session check: the loading view exposes the SSR select
    // before its event handler is ready and replaces the preferences on completion.
    await expect(
      page.getByRole('heading', { name: 'Sign in to continue', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Color theme' })
      .selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('autograph-theme')))
      .toBe(theme);
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
        await expect(
          slots.nth(index).locator('[data-cube-object]'),
        ).toHaveAttribute('data-material', 'empty');
        await expect(slots.nth(index).locator('[data-cube-object]')).toHaveCSS(
          'transform-style',
          'preserve-3d',
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
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath('podium-' + theme + '-' + width + '.png'),
      });
    }
  }
});
