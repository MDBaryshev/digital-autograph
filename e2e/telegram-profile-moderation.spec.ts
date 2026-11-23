import { screenNextTelegramProfile } from '../apps/api/src/telegram-profile-screening';
import { createPgTelegramProfileRepository } from '../packages/db/src/index';
import { e2eUserId, expect, test } from './fixtures';

test('moderator reviews a flagged Telegram snapshot and the signed-in owner sees the decision', async ({
  scenario,
}) => {
  const repository = createPgTelegramProfileRepository(scenario.database.pool);
  await repository.enqueue(
    e2eUserId,
    {
      name: 'Synthetic Telegram sample',
      username: 'sample_42',
      avatarDataUrl: null,
    },
    new Date(),
  );
  await screenNextTelegramProfile(repository, 'synthetic/vision', async () => ({
    decision: 'rejected',
    reasonCode: 'SEXUAL_CONTENT',
    confidence: 0.99,
  }));

  const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
  const moderator = await scenario.actorContext(scenario.ownerId);
  const review = await moderator.newPage();
  await review.goto(web + '/moderation');
  await review.getByRole('button', { name: 'Profiles', exact: true }).click();
  await review.getByRole('button', { name: /Telegram profile ·/ }).click();
  await expect(
    review.getByText('Synthetic Telegram sample', { exact: true }),
  ).toBeVisible();
  await expect(
    review.getByText(/Automated check flagged this profile/),
  ).toBeVisible();
  await review.setViewportSize({ width: 320, height: 850 });
  expect(
    await review.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await review.getByLabel('Rejection reason').selectOption('SEXUAL_CONTENT');
  await review
    .getByRole('button', { name: 'Return for correction', exact: true })
    .click();
  await expect(
    review.getByText('Changes returned to the owner for correction.'),
  ).toBeVisible();

  const owner = await scenario.actorContext(e2eUserId);
  const settings = await owner.newPage();
  await settings.goto(web + '/me/settings');
  await expect(
    settings.getByText(/Update your Telegram profile and sign in again/),
  ).toBeVisible();
});
