import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerEmailAuthRoutes } from './email-http';

it.each(['register', 'reset'] as const)(
  'rejects %s at delivery capacity and permits an explicit retry',
  async (operation) => {
    const releases: (() => void)[] = [];
    const request = vi.fn(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const service = {
      allow: vi.fn().mockResolvedValue(true),
      request,
    } as unknown as Parameters<typeof registerEmailAuthRoutes>[1];
    const app = Fastify();
    const origin = 'http://127.0.0.1:3000';
    registerEmailAuthRoutes(app, service, {
      appEnvironment: 'test',
      sessionTtlSeconds: 1209600,
      trustedWebOrigins: [origin],
    });
    const send = (email: string) =>
      app.inject({
        method: 'POST',
        url: `/auth/email/${operation}`,
        headers: { origin },
        payload: { email },
      });
    try {
      for (let n = 0; n < 4; n++)
        expect((await send(`person${n}@example.test`)).statusCode).toBe(202);
      const rejected = await send('fifth@example.test');
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers['retry-after']).toBe('2');
      expect(rejected.json()).toEqual({ error: { code: 'AUTH_RATE_LIMITED' } });
      expect(request).toHaveBeenCalledTimes(4);
      releases[0]!();
      await new Promise((resolve) => setImmediate(resolve));
      expect(request).toHaveBeenCalledTimes(4);
      expect((await send('fifth@example.test')).statusCode).toBe(202);
      expect(request).toHaveBeenCalledTimes(5);
      expect(request.mock.calls.at(-1)).toEqual([
        'fifth@example.test',
        operation,
        undefined,
      ]);
    } finally {
      for (const release of releases) release();
      await app.close();
    }
  },
);
