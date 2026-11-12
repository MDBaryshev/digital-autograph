import { e2eUserId, expect, test } from './fixtures';

test('moderator refresh finds a newly submitted autograph without a page reload', async ({
  scenario,
}) => {
  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const context = await scenario.actorContext(scenario.ownerId);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: { url: string; method: string }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/moderation/autographs'))
      requests.push({ url: request.url(), method: request.method() });
  });
  await page.goto(web + '/moderation');
  await expect(page.getByText('No submissions in this page.')).toBeVisible();
  // Next dev may perform an aborted StrictMode mount read before the successful
  // initial read. The explicit refresh must add exactly one GET in either mode.
  const initialReads = requests.length;
  expect(initialReads).toBeGreaterThan(0);

  // Isolated PG fixture: real pending row and owner-approval evidence, not mocked queue HTTP.
  const autograph = (
    await scenario.database.pool.query<{ id: string }>(
      "INSERT INTO autographs(user_id,source,status) VALUES($1,'canvas','awaiting_moderation') RETURNING id",
      [e2eUserId],
    )
  ).rows[0]!;
  const cleaned = (
    await scenario.database.pool.query<{ id: string }>(
      "INSERT INTO autograph_assets(autograph_id,role,status,storage_key,actual_content_type,verified_size_bytes,width,height,uploaded_at) VALUES($1,'cleaned','uploaded',$2,'image/png',12,4,3,clock_timestamp()) RETURNING id",
      [autograph.id, `autographs/${autograph.id}/cleaned/queue-fixture.png`],
    )
  ).rows[0]!;
  await scenario.database.pool.query(
    'INSERT INTO autograph_user_approvals(autograph_id,user_id,cleaned_asset_id) VALUES($1,$2,$3)',
    [autograph.id, e2eUserId, cleaned.id],
  );
  const refresh = page.getByRole('button', {
    name: 'Refresh queue',
    exact: true,
  });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /canvas ·/ })).toBeVisible();
  await expect(refresh).toBeFocused();
  expect(requests).toHaveLength(initialReads + 1);
  for (const request of requests) {
    expect(request.method).toBe('GET');
    expect(new URL(request.url).searchParams.has('cursor')).toBe(false);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const ordinary = await scenario.actorContext(e2eUserId);
  const ordinaryPage = await ordinary.newPage();
  await ordinaryPage.goto(web + '/moderation');
  await expect(ordinaryPage.getByRole('main').getByRole('alert')).toHaveText(
    'Forbidden: a platform moderator or admin role is required.',
  );
  await expect(
    ordinaryPage.getByRole('button', { name: 'Refresh queue' }),
  ).toHaveCount(0);
});
