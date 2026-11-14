import { expect, test } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'destka-locale',
      value: 'en',
      url: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
    },
  ]);
});

test('a cube supports face controls, dragging, keyboard rotation and focus return without requests', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto('/');
  const open = page.getByRole('button', {
    name: 'Explore demo cube in place 1',
    exact: true,
  });
  const object = open.locator('[data-cube-object]');
  await expect(object).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await open.hover();
  await expect(object).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.mouse.move(0, 0);
  await expect(object).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await open.click();
  const viewer = page.getByRole('dialog', {
    name: 'Cube · place 1',
    exact: true,
  });
  const close = viewer.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeFocused();
  const controls = viewer.getByRole('group', {
    name: 'Cube faces',
    exact: true,
  });
  await controls.getByRole('button', { name: 'Links', exact: true }).click();
  await expect(
    viewer.getByText(
      'Telegram, YouTube and a website: example channels, not real accounts.',
    ),
  ).toBeVisible();
  await expect(viewer.getByRole('link')).toHaveCount(0);
  const rotation = viewer.getByRole('group', {
    name: 'Rotate cube',
    exact: true,
  });
  await rotation.press('Home');
  await rotation.press('ArrowRight');
  await expect(
    controls.getByRole('button', { name: 'Profile', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const before = await rotation
    .locator('[data-cube-object]')
    .getAttribute('style');
  const box = (await rotation.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 140,
    box.y + box.height / 2 + 30,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(
    controls.getByRole('button', { name: 'Autograph', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await rotation.locator('[data-cube-object]').getAttribute('style'),
  ).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(writes).toEqual([]);
});

test('cube inspection stays usable on touch screens and with reduced motion', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  try {
    await context.addCookies([
      {
        name: 'destka-locale',
        value: 'en',
        url: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
      },
    ]);
    const page = await context.newPage();
    await page.goto(process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000');
    await page
      .getByRole('button', {
        name: 'Explore demo cube in place 2',
        exact: true,
      })
      .tap();
    const viewer = page.getByRole('dialog', {
      name: 'Cube · place 2',
      exact: true,
    });
    await viewer.getByRole('button', { name: 'Turn right', exact: true }).tap();
    await expect(
      viewer.getByRole('button', { name: 'Profile', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await viewer
        .locator('[data-cube-object]')
        .evaluate((element) =>
          parseFloat(getComputedStyle(element).transitionDuration),
        ),
    ).toBeLessThan(0.001);
    const rotation = viewer.getByRole('group', {
      name: 'Rotate cube',
      exact: true,
    });
    const box = (await rotation.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await cdp.detach();
    await expect(rotation).not.toHaveAttribute('data-dragging');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-cube.png') });
    await viewer.getByRole('button', { name: 'Close', exact: true }).tap();
    await page
      .getByRole('button', { name: 'Sign demo place 4', exact: true })
      .tap();
    await expect(
      page.getByRole('dialog', {
        name: 'Your autograph · place 4',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
