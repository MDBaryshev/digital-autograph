import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import {
  oauthRequestsPerMinute,
  registerOAuthRequestLimits,
} from './request-limits';

it('bounds concurrent OAuth requests before authentication/provider work, including query and HEAD variants', async () => {
  let instant = 0;
  const app = Fastify();
  registerOAuthRequestLimits(app, () => instant);
  const authenticate = vi.fn();
  app.addHook('preHandler', async () => {
    authenticate();
  });
  for (const provider of ['yandex', 'vk-id']) {
    for (const operation of ['start', 'callback']) {
      app.get(`/auth/${provider}/${operation}`, async () => ({ ok: true }));
    }
  }
  app.get('/health/live', async () => ({ status: 'ok' }));
  try {
    const burst = await Promise.all(
      Array.from({ length: oauthRequestsPerMinute }, (_, i) =>
        app.inject({
          method: i % 2 ? 'HEAD' : 'GET',
          url: `/auth/yandex/start?returnTo=${i}`,
          headers: { cookie: 'da_session=synthetic' },
        }),
      ),
    );
    expect(burst.every((r) => r.statusCode === 200)).toBe(true);
    expect(authenticate).toHaveBeenCalledTimes(oauthRequestsPerMinute);
    const refused = await app.inject('/auth/yandex/start?returnTo=different');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: { code: 'AUTH_RATE_LIMITED' } });
    expect(refused.headers['retry-after']).toBe('60');
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(authenticate).toHaveBeenCalledTimes(oauthRequestsPerMinute);
    expect(
      (await app.inject({ method: 'HEAD', url: '/auth/yandex/start' }))
        .statusCode,
    ).toBe(429);
    for (const path of [
      '/auth/yandex/callback',

      '/auth/vk-id/start',
      '/health/live',
    ]) {
      expect((await app.inject(path)).statusCode).toBe(200);
    }
    instant = 59_500;
    expect(
      (await app.inject('/auth/yandex/start')).headers['retry-after'],
    ).toBe('1');
    instant = 60_000;
    expect((await app.inject('/auth/yandex/start')).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});

it('bounds POST Telegram linking starts before any session/provider work', async () => {
  const app = Fastify();
  registerOAuthRequestLimits(app);
  const work = vi.fn(async () => ({ ok: true }));
  app.post('/me/connections/telegram/start', work);
  try {
    for (let i = 0; i < oauthRequestsPerMinute; i++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/me/connections/telegram/start',
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/me/connections/telegram/start?different=1',
        })
      ).statusCode,
    ).toBe(429);
    expect(work).toHaveBeenCalledTimes(oauthRequestsPerMinute);
  } finally {
    await app.close();
  }
});
