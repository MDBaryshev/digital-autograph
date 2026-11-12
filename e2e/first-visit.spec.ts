import { expect, test, e2eWallId } from './fixtures';

test('a visitor can draw and edit a demo autograph with the keyboard without uploading it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Product navigation' });
  await expect(dock.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const place = page.getByRole('button', {
    name: 'Sign demo place 4',
    exact: true,
  });
  await place.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Your autograph · place 4' });
  await expect(dialog.getByRole('heading')).toBeFocused();
  const show = dialog.getByRole('button', { name: 'Show on the demo Wall' });
  await expect(show).toBeDisabled();
  const canvas = dialog.getByLabel('Autograph drawing area', { exact: true });
  await canvas.focus();
  for (const key of ['Space', 'ArrowRight', 'ArrowUp', 'ArrowRight', 'Space']) {
    await canvas.press(key);
  }
  await expect(show).toBeEnabled();
  await show.click();
  const saved = page.getByRole('button', {
    name: 'Edit your autograph in place 4',
  });
  await expect(saved).toBeFocused();
  await expect(saved.locator('svg path')).toHaveAttribute('d', /^M.+L/);
  await expect(page.getByText('Your autograph is in place 4.')).toBeVisible();

  await saved.click();
  await expect(show).toBeEnabled();
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(show).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(saved).toBeFocused();
  await page
    .getByRole('button', {
      name: 'Move your autograph to place 5',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Move to this place' }).click();
  await expect(page.getByText('Your autograph is in place 5.')).toBeVisible();
  await expect(saved).toHaveCount(0);
  expect(writes).toEqual([]);
  await page.reload();
  await expect(place).toBeVisible();

  await dock.getByRole('link', { name: 'Studio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to continue' }),
  ).toBeVisible();
  await expect(dock.getByRole('link', { name: 'Studio' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('an invitation opens a real Wall and its selection offers a way back to the place', async ({
  page,
  scenario,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByText('Open an invitation', { exact: true }).click();
  const invitation = page.getByLabel('Paste your Destka invitation link');
  await invitation.fill(`https://example.test/walls/${e2eWallId}`);
  await invitation.press('Enter');
  await expect(invitation).toBeFocused();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Paste a link to a Wall on destka.ru.',
  );
  await invitation.fill(
    `https://destka.ru/walls/${e2eWallId}?source=invitation`,
  );
  await invitation.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/walls/${e2eWallId}$`));
  await expect(
    page.getByRole('heading', { name: "E2E Creator's Wall" }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Find a place' }).click();
  const signIn = page
    .getByRole('listitem', { name: 'Slot 1', exact: true })
    .getByRole('button', { name: 'Sign in to claim' });
  await signIn.click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to claim Slot 1' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Back to places' }).click();
  await expect(signIn).toBeFocused();
  await expect(signIn).toHaveAttribute('aria-expanded', 'false');
  expect(
    (await scenario.database.pool.query('SELECT id FROM autographs')).rowCount,
  ).toBe(0);
});
