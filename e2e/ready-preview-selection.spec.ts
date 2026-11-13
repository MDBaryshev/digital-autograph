import sharp from 'sharp';
import { e2eSlotId, e2eUserId, e2eWallId, expect, test } from './fixtures';

test('ready selection removes the previous private image while loading, keeps refresh focus and claims the selected autograph', async ({
  scenario,
}) => {
  test.setTimeout(120_000);
  const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const owner = await scenario.actorContext(e2eUserId);
  const moderator = await scenario.actorContext(scenario.ownerId);
  const headers = { Origin: web };
  for (const offset of [0, 20]) {
    const png = await sharp(
      Buffer.from(
        `<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="300" fill="white"/><path d="M80 ${160 + offset} Q200 50 300 170 T500 120" fill="none" stroke="black" stroke-width="12"/></svg>`,
      ),
    )
      .png()
      .toBuffer();
    const created = await owner.request.post(api + '/autographs', {
      headers,
      data: { source: 'canvas' },
    });
    expect(created.status()).toBe(201);
    const autograph = await created.json();
    const upload = await owner.request.post(
      api + '/autographs/' + autograph.id + '/upload',
      { headers, data: { contentType: 'image/png', sizeBytes: png.length } },
    );
    expect(upload.ok()).toBe(true);
    const signed = await upload.json();
    expect(
      (
        await owner.request.put(new URL(signed.url, api).href, {
          headers: { ...signed.headers, ...headers },
          data: png,
        })
      ).status(),
    ).toBe(204);
    expect(
      (
        await owner.request.post(
          api + '/autographs/' + autograph.id + '/upload/complete',
          { headers, data: {} },
        )
      ).ok(),
    ).toBe(true);
    await expect
      .poll(
        async () =>
          (
            await (
              await owner.request.get(api + '/autographs/' + autograph.id)
            ).json()
          ).status,
        { timeout: 30_000 },
      )
      .toBe('awaiting_approval');
    const preview = await (
      await owner.request.get(api + '/autographs/' + autograph.id + '/preview')
    ).json();
    expect(
      (
        await owner.request.post(
          api + '/autographs/' + autograph.id + '/approve',
          { headers, data: { reviewedAssetId: preview.assetId } },
        )
      ).ok(),
    ).toBe(true);
    expect(
      (
        await moderator.request.post(
          api + '/moderation/autographs/' + autograph.id + '/decision',
          { headers, data: { decision: 'approved' } },
        )
      ).ok(),
    ).toBe(true);
  }
  const ready = await (
    await owner.request.get(api + '/autographs?status=ready')
  ).json();
  expect(ready.items).toHaveLength(2);
  const first = ready.items[0].id as string;
  const second = ready.items[1].id as string;
  const page = await owner.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: { url: string; method: string }[] = [];
  page.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  await page.goto(web + '/walls/' + e2eWallId);
  const image = page.getByRole('img', {
    name: 'Private preview of your selected digital autograph',
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const originalImage = await image.getAttribute('src');
  expect(await page.locator(`input[value="${first}"]`).isChecked()).toBe(true);

  let release!: () => void;
  let intercepted!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  const secondUrl = api + '/autographs/' + second + '/preview';
  await page.route(secondUrl, async (route) => {
    intercepted();
    await blocked;
    await route.continue();
  });
  try {
    await page.locator(`input[value="${second}"]`).check();
    await started;
    await expect(image).toHaveCount(0);
    await expect(
      page.getByText('Loading preview…', { exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(await image.getAttribute('src')).not.toBe(originalImage);

  const refresh = page.getByRole('button', {
    name: 'Refresh private preview',
    exact: true,
  });
  const before = requests.filter((request) => request.url === secondUrl).length;
  const refreshed = page.waitForResponse(
    (response) => response.url() === secondUrl,
  );
  await refresh.focus();
  await page.keyboard.press('Enter');
  await refreshed;
  await expect(image).toBeVisible();
  await expect(refresh).toBeFocused();
  expect(requests.filter((request) => request.url === secondUrl)).toHaveLength(
    before + 1,
  );
  expect(requests.filter((request) => request.method !== 'GET')).toHaveLength(
    0,
  );

  await page
    .getByRole('listitem', { name: 'Slot 1', exact: true })
    .getByRole('button', { name: 'Claim this slot', exact: true })
    .click();
  const claimed = page.waitForRequest(
    (request) =>
      request.url() ===
        api + `/walls/${e2eWallId}/slots/${e2eSlotId}/free-claim` &&
      request.method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Confirm free claim', exact: true })
    .click();
  expect((await claimed).postDataJSON()).toEqual({ autographId: second });
  await expect(
    page.getByText('Your autograph is on the Wall.', { exact: true }),
  ).toBeVisible();
  const placements = await scenario.database.pool.query<{
    autograph_id: string;
  }>(
    'SELECT autograph_id FROM placements WHERE slot_id=$1 AND ended_at IS NULL',
    [e2eSlotId],
  );
  expect(placements.rows).toEqual([{ autograph_id: second }]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
