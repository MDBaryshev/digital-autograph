import { e2eUserId, expect, test } from './fixtures';

test('follows a creator from their profile, tracks their Wall, and controls discovery from the owner account', async ({
  page,
  scenario,
}) => {
  const base = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const profile = '/creators/e2e-creator';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/feed');
  await expect(
    page.getByRole('heading', { name: 'No Walls in your feed yet' }),
  ).toBeVisible();
  const dock = page.getByRole('navigation', { name: 'Product navigation' });
  await expect(dock.getByRole('link', { name: 'Wall feed' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const owner = await (await scenario.actorContext(scenario.ownerId)).newPage();
  await owner.goto(base + '/me/walls');
  await owner.getByText('Feed visibility', { exact: true }).click();
  await owner.getByRole('button', { name: 'Show in recommendations' }).click();
  await expect(
    owner.getByRole('button', { name: 'Remove from recommendations' }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'E2E Creator', exact: true }).click();
  await expect(
    page.getByText('Sign in to follow', { exact: true }),
  ).toBeVisible();
  const fan = await (await scenario.actorContext(e2eUserId)).newPage();
  await fan.goto(base + profile);
  await fan
    .getByRole('button', { name: 'Follow creator', exact: true })
    .click();
  await expect(
    fan.getByRole('button', { name: 'Unfollow creator' }),
  ).toBeVisible();
  await owner
    .getByRole('button', { name: 'Remove from recommendations' })
    .click();
  await expect(
    owner.getByRole('button', { name: 'Show in recommendations' }),
  ).toBeVisible();

  await fan.goto(base + '/feed?view=following');
  await expect(
    fan.getByRole('heading', { name: 'E2E Creator’s Wall' }),
  ).toBeVisible();
  await fan.getByRole('link', { name: 'E2E Creator', exact: true }).click();
  await fan.getByRole('button', { name: 'Unfollow creator' }).click();
  await expect(
    fan.getByRole('button', { name: 'Follow creator', exact: true }),
  ).toBeVisible();
  await fan.goto(base + '/feed?view=following');
  await expect(
    fan.getByRole('heading', { name: 'No Walls from your follows yet' }),
  ).toBeVisible();
  await page.reload();
  await page.goto('/feed');
  await expect(
    page.getByRole('heading', { name: 'No Walls in your feed yet' }),
  ).toBeVisible();
});
