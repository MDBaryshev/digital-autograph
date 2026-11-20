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
  await page.goto('/walls/demo');
  const open = page.getByRole('button', {
    name: 'Explore demo cube in place 1',
    exact: true,
  });
  await page
    .getByRole('button', { name: 'Polished metal', exact: true })
    .click();
  const podium = [1, 2, 3].map((place) =>
    page
      .getByRole('button', {
        name: 'Explore demo cube in place ' + place,
        exact: true,
      })
      .locator('[data-cube-face="front"]'),
  );
  const faceColor = (face: (typeof podium)[number]) =>
    face.evaluate((element) => getComputedStyle(element).backgroundColor);
  const originalColors = await Promise.all(podium.map(faceColor));
  await page.getByRole('textbox', { name: 'Cube front, HEX' }).fill('#254c81');
  await page
    .getByRole('textbox', { name: 'Other cube faces, HEX' })
    .fill('#c28a42');
  await page
    .getByRole('textbox', { name: 'Autograph ink, HEX' })
    .fill('#aad550');
  const newColors = await Promise.all(podium.map(faceColor));
  expect(new Set(newColors).size).toBe(3);
  for (const [index, color] of newColors.entries()) {
    expect(color).not.toBe(originalColors[index]);
    expect(color).not.toBe('rgb(37, 76, 129)');
  }
  await expect(
    page
      .getByRole('button', { name: 'Sign demo place 4' })
      .locator('[data-cube-face="front"]'),
  ).toHaveCSS('background-color', 'rgb(37, 76, 129)');
  const object = open.locator('[data-cube-object]');
  await expect(object.locator('[data-cube-face]')).toHaveCount(1);
  await expect(object.locator('[data-cube-artwork] path')).toHaveCSS(
    'stroke',
    'rgb(170, 213, 80)',
  );
  await expect(object).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const front = object.locator('[data-cube-face="front"]');
  const flatFront = await front.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  const cardSize = await open.boundingBox();
  const crown = open.locator('[data-preview-crown="1"]');
  await expect(crown).toHaveCSS('opacity', '0');
  const otherCrowns = page.locator(
    '[data-preview-crown="2"], [data-preview-crown="3"]',
  );
  await expect(otherCrowns).toHaveCount(2);
  const restingCrown = await crown.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  const sideOpacity = () =>
    object.evaluate((element) => getComputedStyle(element, '::before').opacity);
  await open.hover();
  await expect(object).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(front).not.toHaveCSS('transform', flatFront);
  await expect.poll(sideOpacity).toBe('1');
  await expect(crown).toHaveCSS('opacity', '1');
  await expect(crown).not.toHaveCSS('transform', restingCrown);
  await expect(open.locator('[data-solid-crown]')).toHaveCount(0);
  expect(await open.boundingBox()).toEqual(cardSize);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect.poll(sideOpacity).toBe('0');
  await expect(crown).toHaveCSS('opacity', '0');
  await expect(front).toHaveCSS('transform', flatFront);
  await expect(object).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await open.click();
  const viewer = page.getByRole('dialog', {
    name: 'Cube · place 1',
    exact: true,
  });
  const close = viewer.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeFocused();
  await expect(viewer.locator('[data-cube-face]')).toHaveCount(6);
  await expect(viewer.locator('[data-solid-crown="1"]')).toBeVisible();
  await expect(viewer.locator('[data-cube-face="front"]')).toHaveCSS(
    'background-color',
    newColors[0]!,
  );
  const side = viewer.locator('[data-cube-face="right"]');
  await expect(side).not.toHaveCSS('background-color', 'rgb(194, 138, 66)');
  await expect(side).not.toHaveCSS('background-color', newColors[0]!);
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
    await page.goto(
      new URL('/walls/demo', process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000')
        .href,
    );
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

test('wall materials look distinct and defaults and individual places can be edited', async ({
  page,
}) => {
  await page.goto('/walls/demo');
  const gold = page.locator('[data-wall-theme] [data-material="gold"]');
  const front = gold.locator('[data-cube-face="front"]');
  const baseColor = await front.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--face-paper'),
  );
  const materials = [
    ['Polished metal', 'metallic'],
    ['Brushed metal', 'brushed'],
    ['Clear glass', 'glass'],
    ['Satin glass', 'satin-glass'],
    ['Smoked glass', 'smoked-glass'],
    ['Matte', 'matte'],
    ['Glazed enamel', 'enamel'],
    ['Terrazzo', 'stone'],
    ['Carbon weave', 'weave'],
  ];
  const frontAlpha = (element: Element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[3]!;
  };
  const rendered = new Set<string>();
  const alphas = new Map<string, number>();
  for (const [label, value] of materials) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(gold).toHaveAttribute('data-cube-finish', value!);
    const image = await front.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(image).not.toBe('none');
    rendered.add(image);
    alphas.set(value!, await front.evaluate(frontAlpha));
    expect(
      await front.evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--face-paper'),
      ),
    ).toBe(baseColor);
  }
  expect(rendered.size).toBe(materials.length);
  expect(alphas.get('glass')).toBeGreaterThan(0);
  expect(alphas.get('glass')).toBeLessThan(alphas.get('smoked-glass')!);
  expect(alphas.get('smoked-glass')).toBeLessThan(alphas.get('satin-glass')!);
  expect(alphas.get('metallic')).toBe(255);

  const target = page.getByRole('combobox', { name: 'Apply material to' });
  const last = page
    .getByRole('button', { name: 'Sign demo place 10', exact: true })
    .locator('[data-cube-object]');
  await target.selectOption('10');
  await page.getByRole('button', { name: 'Terrazzo', exact: true }).click();
  await expect(last).toHaveAttribute('data-cube-finish', 'stone');
  await expect(gold).toHaveAttribute('data-cube-finish', 'weave');
  await expect.poll(() => front.evaluate(frontAlpha)).toBe(255);
  await target.selectOption('1');
  await page.getByRole('button', { name: 'Clear glass', exact: true }).click();
  await expect.poll(() => front.evaluate(frontAlpha)).toBeLessThan(100);
  await expect(gold.locator('[data-glass-interior="back"]')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Explore demo cube in place 1', exact: true })
    .click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.locator('[data-cube-object]')).toHaveAttribute(
    'data-cube-finish',
    'glass',
  );
  expect(
    new Set(
      await viewer
        .locator('[data-cube-face]')
        .evaluateAll((faces) =>
          faces.map((face) => getComputedStyle(face).backgroundImage),
        ),
    ),
  ).toEqual(
    new Set([
      await front.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      ),
    ]),
  );
  await expect(viewer.locator('[data-glass-interior]')).toHaveCount(6);
  for (const name of ['front', 'right', 'back', 'left', 'top', 'bottom']) {
    const exterior = viewer.locator('[data-cube-face="' + name + '"]');
    const interior = viewer.locator('[data-glass-interior="' + name + '"]');
    expect(await interior.textContent()).toBe(await exterior.textContent());
    await expect(interior).toHaveAttribute('aria-hidden', 'true');
  }
  const signOutside = viewer.locator(
    '[data-cube-face="front"] [data-cube-artwork] path',
  );
  const signInside = viewer.locator(
    '[data-glass-interior="front"] [data-cube-artwork] path',
  );
  expect(await signInside.getAttribute('d')).toBe(
    await signOutside.getAttribute('d'),
  );
  const insideFront = viewer.locator('[data-glass-interior="front"]');
  const orientation = await insideFront.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { horizontal: matrix.m11, normal: matrix.m33 };
  });
  expect(orientation.horizontal).toBeCloseTo(1);
  expect(orientation.normal).toBeCloseTo(-1);
  for (const face of await viewer.locator('[data-cube-face]').all()) {
    expect(await face.evaluate(frontAlpha)).toBeLessThan(100);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Use wall default' }).click();
  await expect(gold).toHaveAttribute('data-cube-finish', 'weave');
  await expect(last).toHaveAttribute('data-cube-finish', 'stone');
});
