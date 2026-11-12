import { expect, test } from '@playwright/test';
const api = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';
test('real draft identities stay unavailable alongside synthetic published E2E documents', async ({
  page,
  request,
}) => {
  for (const path of ['/legal/documents', '/security/documents']) {
    const result = await (await request.get(`${api}${path}`)).json();
    expect(
      result.documents.every((d: { version: string }) =>
        ['test-v1', 'test-v0'].includes(d.version),
      ),
    ).toBe(true);
  }
  const index = await page.goto('/legal');
  expect(index?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Юридические документы' }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  for (const path of [
    '/legal/terms/versions/1.0-destka-20261010',
    '/legal/terms/versions/unknown',
    '/security',
    '/security/archive',
    '/security/versions/1.0-destka-20261010',
    '/legal/privacy-data-map',
    '/sitemap.xml',
    '/.well-known/security.txt',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).not.toContain('Лошкарев');
    expect(html).not.toContain('[[URL');
    expect(html).not.toContain('loshkarv00');
  }
  await expect(page.locator('footer nav a')).toHaveAttribute('href', '/legal');
  await expect(
    page.getByRole('link', {
      name: 'Пользовательское соглашение',
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('link', {
      name: 'Пользовательское соглашение',
      exact: true,
    }),
  ).toHaveAccessibleDescription('Текущая редакция');
});

test('published synthetic editions have working current, archive and permanent links without accepting consent', async ({
  page,
  context,
}) => {
  // These are fixture texts; no real registry entry is made ready by this test.
  for (const slug of [
    'terms',
    'content-rules',
    'offer',
    'refunds',
    'privacy',
    'personal-data-consent',
    'dissemination-consent',
  ]) {
    expect((await page.goto(`/legal/${slug}`))?.status()).toBe(200);
    await expect(
      page.getByRole('region', { name: 'Текст документа' }),
    ).toHaveAttribute('lang', 'ru');
    await expect(
      page.getByRole('region', { name: 'Текст документа' }),
    ).toContainText('synthetic legal fixture');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Постоянная ссылка на эту редакцию' }),
    ).toHaveAttribute('href', `/legal/${slug}/versions/test-v1`);
  }
  await page.goto('/legal/terms/archive');
  await page
    .getByRole('link', { name: 'Редакция test-v0', exact: true })
    .click();
  await expect(page).toHaveURL(/\/legal\/terms\/versions\/test-v0$/);
  await expect(page.getByText(/Архивная редакция/)).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .getByRole('button', { name: 'Копировать ссылку на редакцию' })
    .click();
  await expect(
    page.getByText('Ссылка скопирована.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  );
});
