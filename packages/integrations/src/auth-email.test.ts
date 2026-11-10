import { expect, it, vi } from 'vitest';
import { createAuthEmailSender } from './auth-email';

const config = {
  apiKey: 'synthetic-key',
  from: 'accounts@example.test',
  webOrigin: 'https://destka.example',
};
const mail = {
  email: 'reader@example.test',
  purpose: 'register' as const,
  token: 'a'.repeat(43),
};

it('sends the confirmation through the UniSender Go HTTPS API without tracking or redirects', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      status: 'success',
      job_id: 'synthetic-job',
      emails: [mail.email],
      failed_emails: {},
    }),
  );
  await createAuthEmailSender(config, fetcher).send(mail);
  const [endpoint, options] = fetcher.mock.calls[0]!;
  expect(endpoint).toBe(
    'https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json',
  );
  expect(options).toMatchObject({
    method: 'POST',
    redirect: 'error',
    headers: { 'X-API-KEY': config.apiKey, 'Content-Type': 'application/json' },
  });
  const body = JSON.parse(String(options?.body));
  expect(body.message).toMatchObject({
    recipients: [{ email: mail.email }],
    from_email: config.from,
    track_links: 0,
    track_read: 0,
  });
  expect(body.message.body.plaintext).toContain(
    `${config.webOrigin}/auth/email/confirm#token=${mail.token}`,
  );
  expect(JSON.stringify(body)).not.toContain(config.apiKey);
});

it.each([
  () =>
    Response.json(
      { status: 'error', message: 'private provider diagnostics' },
      { status: 400 },
    ),
  () =>
    Response.json({
      status: 'success',
      job_id: 'partial',
      failed_emails: { [mail.email]: 'unavailable' },
    }),
  () => new Response('invalid JSON'),
])(
  'redacts delivery failures and refuses rejected recipients',
  async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    await expect(
      createAuthEmailSender(config, fetcher).send(mail),
    ).rejects.toThrow(/^Authentication email delivery failed$/);
  },
);
