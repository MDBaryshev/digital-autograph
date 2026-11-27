import { EmailAuthService, SessionService } from '../packages/auth/src/index';
import { createAuthEmailSender } from '../packages/integrations/src/index';
import {
  createPgEmailAuthRepository,
  createPgSessionRepository,
} from '../packages/db/src/index';
import { buildApi } from '../apps/api/src/app';
import { e2eWallId, expect, test } from './fixtures';

const webOrigin = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const apiOrigin = process.env.API_PUBLIC_ORIGIN ?? 'http://127.0.0.1:4000';

test('verified email confirms mailbox ownership, signs in and revokes old sessions on reset', async ({
  page,
  scenario,
}) => {
  const mails: URL[] = [];
  const sessions = new SessionService(
    createPgSessionRepository(scenario.database.pool),
    1209600,
  );
  const email = `browser-${Date.now()}@example.test`;
  const password = 'a secure browser password 🔐';
  const args: Parameters<typeof buildApi> = [
    scenario.database,
    sessions,
    {
      appEnvironment: 'test',
      sessionTtlSeconds: 1209600,
      trustedWebOrigins: [webOrigin],
    },
  ];
  args[19] = new EmailAuthService(
    createPgEmailAuthRepository(scenario.database.pool),
    createAuthEmailSender(
      { apiKey: 'synthetic-api-key', from: 'accounts@example.test', webOrigin },
      async (endpoint, request) => {
        expect(endpoint).toBe(
          'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json',
        );
        const { message } = JSON.parse(String(request?.body));
        expect(message.recipients).toEqual([{ email }]);
        const link = message.body.plaintext
          .split('\n')
          .find((line: string) =>
            line.startsWith(webOrigin + '/auth/email/confirm#'),
          );
        mails.push(new URL(link));
        return Response.json({
          status: 'success',
          job_id: 'synthetic-job',
          emails: [email],
        });
      },
    ),
    1209600,
  );
  args[18] = { write() {} };
  const app = buildApi(...args);
  const localOrigin = await app.listen({ port: 0, host: '127.0.0.1' });
  await page.context().route(
    (url) =>
      url.origin === apiOrigin &&
      (url.pathname === '/auth/providers' ||
        url.pathname.startsWith('/auth/email/')),
    async (route) => {
      const original = new URL(route.request().url());
      const response = await route.fetch({
        url: `${localOrigin}${original.pathname}`,
      });
      await route.fulfill({ response });
    },
  );
  try {
    const firstUse = `/legal/first-use?returnTo=${encodeURIComponent(`/walls/${e2eWallId}`)}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(firstUse);
    const emailSignIn = page.getByRole('link', { name: 'Continue with email' });
    await expect(emailSignIn).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: 'initial',
      path: test.info().outputPath('first-use-email-mobile.png'),
      fullPage: true,
    });
    await emailSignIn.click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({
      caret: 'initial',
      path: test.info().outputPath('email-sign-in-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: 'initial',
      path: test.info().outputPath('email-sign-in-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page
      .getByRole('button', { name: 'Create an account', exact: true })
      .click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send email', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'an email with a link',
    );
    await expect.poll(() => mails.length).toBe(1);
    const confirmationPage = await page.context().newPage();
    await page.close();
    page = confirmationPage;
    await page.goto(mails[0]!.href);
    await expect(page).toHaveURL(/\/auth\/email\/confirm$/);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Repeat password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Your password is saved',
    );
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new URL(firstUse, webOrigin).href);
    const checkboxes = page.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(3);
    for (const checkbox of await checkboxes.all()) await checkbox.check();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('You can continue.')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Return to your action' }),
    ).toHaveAttribute('href', `/walls/${e2eWallId}`);
    const cookie = (await page.context().cookies(apiOrigin)).find(
      (c) => c.name === 'da_session',
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 13 * 86400);

    await page.goto('/me/settings');
    await expect(
      page.getByRole('heading', { name: 'Telegram', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /Войти через Telegram|Continue with Telegram/,
      }),
    ).toHaveCount(0);
    await page.goto('/auth/email?returnTo=%2Fme%2Fsettings');
    await page.reload();
    expect((await page.request.get(`${apiOrigin}/auth/me`)).status()).toBe(200);
    await page
      .getByRole('button', { name: 'Forgot password?', exact: true })
      .click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send email', exact: true }).click();
    await expect.poll(() => mails.length).toBe(2);
    await page.goto(mails[1]!.href);
    await page
      .getByLabel('Password', { exact: true })
      .fill('a different secure browser password');
    await page
      .getByLabel('Repeat password', { exact: true })
      .fill('a different secure browser password');
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Your password is saved',
    );
    expect((await page.request.get(`${apiOrigin}/auth/me`)).status()).toBe(401);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    );
    await page
      .getByLabel('Password', { exact: true })
      .fill('a different secure browser password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new URL('/me/settings', webOrigin).href);
  } finally {
    await app.close();
    await scenario.database.pool.query(
      'DELETE FROM email_auth_challenges WHERE email = $1',
      [email],
    );
    await scenario.database.pool.query('TRUNCATE auth_rate_limits');
  }
});
