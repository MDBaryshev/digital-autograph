import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailAuthService,
  SessionService,
  type AuthEmailSender,
} from '../../packages/auth/src/index';
import { authSecretHash } from '../../packages/auth/src/email';
import {
  createDatabase,
  createPgEmailAuthRepository,
  createPgSessionRepository,
  createPgOAuthAttemptCleanup,
} from '../../packages/db/src/index';
import { buildApi } from '../../apps/api/src/app';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw new Error('Isolated autograph_test DB required');
const db = createDatabase(url);
const repository = createPgEmailAuthRepository(db.pool);
const sessions = new SessionService(
  createPgSessionRepository(db.pool),
  1209600,
);
const mails: Parameters<AuthEmailSender['send']>[0][] = [];
const service = new EmailAuthService(
  repository,
  {
    async send(m) {
      mails.push(m);
    },
  },
  1209600,
);
const origin = 'http://127.0.0.1:3000';
const config = {
  appEnvironment: 'test' as const,
  sessionTtlSeconds: 1209600,
  trustedWebOrigins: [origin],
};
const password = 'a sufficiently long password 🔐';
const email = 'owner@example.test';
function appFor(
  emailService = service,
  environment = config.appEnvironment as 'test' | 'production',
) {
  const args: Parameters<typeof buildApi> = [
    db,
    sessions,
    { ...config, appEnvironment: environment },
  ];
  args[19] = emailService;
  return buildApi(...args);
}
async function register() {
  await service.request(email, 'register');
  expect(await service.complete(mails.at(-1)!.token, password)).toBe(true);
}
describe('verified email/password authentication with PostgreSQL', () => {
  beforeEach(async () => {
    mails.length = 0;
    await db.pool.query(
      'TRUNCATE users, email_auth_challenges, auth_rate_limits CASCADE',
    );
  });
  afterAll(async () => db.close());
  it('creates no account or password before proof of mailbox ownership; stores only hashes', async () => {
    await service.request(email, 'register');
    expect((await db.pool.query('SELECT * FROM users')).rowCount).toBe(0);
    const token = mails[0]!.token;
    const challenge = (
      await db.pool.query('SELECT * FROM email_auth_challenges')
    ).rows[0];
    expect(JSON.stringify(challenge)).not.toContain(token);
    expect(await service.complete(token, password)).toBe(true);
    const credential = (await db.pool.query('SELECT * FROM email_credentials'))
      .rows[0];
    expect(credential.password_hash).toMatch(/^\$scrypt\$131072\$8\$1\$/);
    expect(JSON.stringify(credential)).not.toContain(password);
    expect(await service.complete(token, 'attacker replacement password')).toBe(
      false,
    );
    expect(await service.login(email, password)).toMatch(/^da_s1_/);
  });
  it('omits external URLs and checkout data from registration emails', async () => {
    const app = appFor();
    try {
      const destinations = [
        'https://example.test',
        '//example.test',
        '/payments/checkout?reservationId=private-reference',
        '/legal/first-use?returnTo=%2Fpayments%2Fcheckout%3FreservationId%3Dprivate-reference',
      ];
      for (const [index, returnTo] of destinations.entries()) {
        const result = await app.inject({
          method: 'POST',
          url: '/auth/email/register',
          headers: { origin },
          payload: { email: `destination-${index}@example.test`, returnTo },
        });
        expect(result.statusCode).toBe(202);
      }
      await vi.waitFor(() => expect(mails).toHaveLength(destinations.length));
      expect(mails.every((mail) => mail.returnTo === undefined)).toBe(true);
    } finally {
      await app.close();
    }
  });
  it('allows a single concurrent challenge redemption and a single email account', async () => {
    await service.request(email, 'register');
    const token = mails[0]!.token;
    const results = await Promise.all([
      service.complete(token, password),
      service.complete(token, password),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await db.pool.query('SELECT * FROM email_credentials')).rowCount,
    ).toBe(1);
    expect((await db.pool.query('SELECT * FROM users')).rowCount).toBe(1);
  });
  it('invalidates every session and reset link and blocks stale logins after resetting the password', async () => {
    await register();
    const old = await service.login(email, password);
    const credential = (await repository.findCredential(email))!;
    await service.request(email, 'reset');
    const token = mails.at(-1)!.token;
    expect(await service.complete(token, 'a different secure password')).toBe(
      true,
    );
    expect(await sessions.validateSession(old!)).toBeNull();
    expect(await service.login(email, password)).toBeNull();
    expect(
      await service.login(email, 'a different secure password'),
    ).toBeTruthy();
    expect(
      await repository.createPasswordSession(
        credential.userId,
        credential.passwordHash,
        authSecretHash('stale-login'),
        1209600,
      ),
    ).toBe(false);
    expect(await service.complete(token, password)).toBe(false);
  });
  it('orders concurrent reset and session issuance so no old-password session survives', async () => {
    await register();
    const credential = (await repository.findCredential(email))!;
    await service.request(email, 'reset');
    const token = `da_s1_${randomBytes(32).toString('base64url')}`;
    await Promise.all([
      service.complete(
        mails.at(-1)!.token,
        'another sufficiently long password',
      ),
      repository.createPasswordSession(
        credential.userId,
        credential.passwordHash,
        authSecretHash(token),
        1209600,
      ),
    ]);
    expect(await sessions.validateSession(token)).toBeNull();
  });
  it('rejects expired links and disabled users without reviving the account', async () => {
    await service.request(email, 'register');
    await db.pool.query(
      "UPDATE email_auth_challenges SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'",
    );
    expect(await service.complete(mails[0]!.token, password)).toBe(false);
    await register();
    await service.request(email, 'reset');
    const token = mails.at(-1)!.token;
    await db.pool.query("UPDATE users SET status = 'disabled'");
    expect(await service.login(email, password)).toBeNull();
    expect(await service.complete(token, 'some other long password')).toBe(
      false,
    );
  });
  it('atomically enforces shared rate limits across concurrent requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        repository.takeRateLimit(authSecretHash('one-key'), 3),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    await db.pool.query(
      "UPDATE auth_rate_limits SET expires_at = now() - interval '1 second'",
    );
    expect(await repository.takeRateLimit(authSecretHash('one-key'), 3)).toBe(
      true,
    );
  });
  it('counts only requests within their address limit and keeps operation limits independent', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.allow('register', email)),
    );
    expect(results.filter(Boolean)).toHaveLength(8);
    const registerKey = authSecretHash('email-auth:register');
    const counter = await db.pool.query(
      'SELECT used FROM auth_rate_limits WHERE key_hash=$1',
      [registerKey],
    );
    expect(counter.rows).toEqual([{ used: 8 }]);
    await db.pool.query(
      'UPDATE auth_rate_limits SET used=1000 WHERE key_hash=$1',
      [registerKey],
    );
    const otherEmail = 'other@example.test';
    expect(await service.allow('register', otherEmail)).toBe(false);
    expect(
      (
        await db.pool.query(
          'SELECT 1 FROM auth_rate_limits WHERE key_hash=$1',
          [authSecretHash(`register:${otherEmail}`)],
        )
      ).rowCount,
    ).toBe(0);
    expect(await service.allow('login', email)).toBe(true);
    expect(await service.allow('reset', email)).toBe(true);
    expect(await service.allow('confirm')).toBe(true);
  });
  it('checks anonymous Origin, normalizes emails, uses persistent HttpOnly cookies and preserves sessions after reopening the app', async () => {
    const app = appFor();
    try {
      for (const headers of [{}, { origin: 'https://evil.example' }])
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/auth/email/register',
              headers,
              payload: { email },
            })
          ).statusCode,
        ).toBe(403);
      const post = (operation: string, payload: Record<string, unknown>) =>
        app.inject({
          method: 'POST',
          url: `/auth/email/${operation}`,
          headers: { origin },
          payload,
        });
      expect(
        (await post('register', { email: ' OWNER@EXAMPLE.TEST ' })).statusCode,
      ).toBe(202);
      await vi.waitFor(() => expect(mails).toHaveLength(1));
      expect(mails[0]?.email).toBe(email);
      expect(
        (await post('confirm', { token: mails[0]!.token, password }))
          .statusCode,
      ).toBe(204);
      expect(
        (await post('login', { email, password: 'incorrect' })).statusCode,
      ).toBe(401);
      const login = await post('login', { email, password });
      expect(login.statusCode).toBe(204);
      expect(login.body).toBe('');
      const cookie = login.cookies[0]!;
      expect(cookie).toMatchObject({
        name: 'da_session',
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 1209600,
      });
      await app.close();
      const reopened = appFor();
      try {
        const r = await reopened.inject({
          url: '/auth/me',
          headers: { cookie: `${cookie.name}=${cookie.value}` },
        });
        expect(r.statusCode).toBe(200);
        expect(r.headers['cache-control']).toBe('no-store');
        const logout = await reopened.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { origin, cookie: `${cookie.name}=${cookie.value}` },
        });
        expect(logout.statusCode).toBe(204);
        expect(await sessions.validateSession(cookie.value)).toBeNull();
      } finally {
        await reopened.close();
      }
    } finally {
      await app.close();
    }
  });
  it('returns generic responses, hides unavailable routes and uses Secure host-only cookies in production', async () => {
    await register();
    const app = appFor(service, 'production');
    try {
      for (const e of [email, 'missing@example.test']) {
        const r = await app.inject({
          method: 'POST',
          url: '/auth/email/reset',
          headers: { origin },
          payload: { email: e },
        });
        expect(r.statusCode).toBe(202);
        expect(r.json()).toEqual({ accepted: true });
      }
      const r = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        headers: { origin },
        payload: { email, password },
      });
      expect(r.cookies[0]).toMatchObject({
        name: '__Host-da_session',
        secure: true,
        httpOnly: true,
      });
      expect(r.cookies[0]?.domain).toBeUndefined();
    } finally {
      await app.close();
    }
    const disabled = buildApi(db, sessions, config);
    try {
      expect(
        (await disabled.inject('/auth/providers')).json().email,
      ).toBeUndefined();
      expect(
        (
          await disabled.inject({
            method: 'POST',
            url: '/auth/email/login',
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await disabled.close();
    }
  });
  it('responds before provider delivery completion and never logs request credentials or raw delivery failures', async () => {
    let output = '';
    let generatedToken = '';
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn(
      async (input: Parameters<AuthEmailSender['send']>[0]) => {
        generatedToken = input.token;
        await delivery;
        throw new Error('private-delivery-error-marker');
      },
    );
    const mailService = new EmailAuthService(repository, { send }, 1209600);
    const args: Parameters<typeof buildApi> = [db, sessions, config];
    args[18] = {
      write(line) {
        output += line;
      },
    };
    args[19] = mailService;
    const app = buildApi(...args);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/register',
        headers: { origin },
        payload: { email },
      });
      expect(response.statusCode).toBe(202);
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(generatedToken).toHaveLength(43);
      const invalid = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        headers: { origin },
        payload: { email, password: 'private-password-marker' },
      });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.body).not.toContain('private');
    } finally {
      release();
      await app.close();
    }
    expect(output).toContain('AUTH_EMAIL_REQUEST_FAILED');
    expect(output).not.toContain(email);
    expect(output).not.toContain('private-delivery-error-marker');
    expect(output).not.toContain('private-password-marker');
    expect(output).not.toContain(generatedToken);
  });
  it('enforces per-address limits before registration work and rejects extra client authority fields', async () => {
    // Delivery capacity is tested separately. Isolate the persisted address limiter
    // from platform-dependent background PostgreSQL delivery latency here.
    const delivery = vi.spyOn(service, 'request').mockResolvedValue();
    const app = appFor();
    try {
      for (let i = 0; i < 9; i++) {
        const r = await app.inject({
          method: 'POST',
          url: '/auth/email/register',
          headers: { origin },
          payload: { email },
        });
        expect(r.statusCode).toBe(i < 8 ? 202 : 429);
        if (i === 8) expect(r.headers['retry-after']).toBe('900');
      }
      const invalid = await app.inject({
        method: 'POST',
        url: '/auth/email/register',
        headers: { origin },
        payload: { email, userId: 'attacker-controlled', role: 'admin' },
      });
      expect(invalid.statusCode).toBe(400);
      const oversized = await app.inject({
        method: 'POST',
        url: '/auth/email/login',
        headers: { origin },
        payload: { email, password: 'a'.repeat(5000) },
      });
      expect(oversized.statusCode).toBe(413);
      expect((await db.pool.query('SELECT * FROM users')).rowCount).toBe(0);
    } finally {
      await app.close();
      delivery.mockRestore();
    }
  });
  it('cleans expired challenges and limiter records in bounded batches', async () => {
    await service.request(email, 'register');
    await repository.takeRateLimit(authSecretHash('cleanup'), 1);
    await db.pool.query(
      "UPDATE email_auth_challenges SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'",
    );
    await db.pool.query(
      "UPDATE auth_rate_limits SET expires_at = now() - interval '1 hour'",
    );
    await createPgOAuthAttemptCleanup(db.pool)(1);
    expect(
      (await db.pool.query('SELECT * FROM email_auth_challenges')).rowCount,
    ).toBe(0);
    expect(
      (await db.pool.query('SELECT * FROM auth_rate_limits')).rowCount,
    ).toBe(0);
  });
});
