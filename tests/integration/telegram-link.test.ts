import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import {
  OAuthAttemptService,
  SessionService,
} from '../../packages/auth/src/index';
import {
  createDatabase,
  createPgOAuthAttemptRepository,
  createPgSessionRepository,
  createPgTelegramLinkRepository,
} from '../../packages/db/src/index';
import { buildApi } from '../../apps/api/src/app';
import {
  TelegramLinkService,
  registerTelegramLinkRoutes,
} from '../../apps/api/src/auth/telegram-link';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('Isolated autograph_test DB required');
const db = createDatabase(url);
const sessions = new SessionService(
  createPgSessionRepository(db.pool),
  1209600,
);
const repository = createPgTelegramLinkRepository(db.pool);
const origin = 'http://127.0.0.1:3000';
beforeEach(async () => {
  await db.pool.query('TRUNCATE users,oauth_login_attempts CASCADE');
});
afterAll(async () => db.close());
async function person() {
  const id = randomUUID();
  await db.pool.query('INSERT INTO users(id) VALUES($1)', [id]);
  const issued = await sessions.createSession(id);
  return { id, ...issued, cookie: `da_session=${issued.token}` };
}
function fixture(verify?: () => Promise<void>) {
  let exchanges = 0;
  const service = new TelegramLinkService(
    new OAuthAttemptService(createPgOAuthAttemptRepository(db.pool), 600),
    {
      async authorizationUrl({ state }) {
        return `https://oauth.telegram.org/auth?state=${state}`;
      },
      async verifyCode() {
        exchanges++;
        await verify?.();
        return { subject: '123456' };
      },
    },
    repository,
  );
  const app = buildApi(db, sessions, {
    appEnvironment: 'test',
    sessionTtlSeconds: 1209600,
    trustedWebOrigins: [origin],
  });
  registerTelegramLinkRoutes(app, service, {
    appEnvironment: 'test',
    webOrigin: origin,
  });
  return { app, exchanges: () => exchanges };
}
async function start(app: ReturnType<typeof fixture>['app'], cookie: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/me/connections/telegram/start',
    headers: { cookie, origin },
  });
  expect(response.statusCode).toBe(200);
  const state = new URL(response.json().authorizationUrl).searchParams.get(
    'state',
  )!;
  const cookies = response.headers['set-cookie'];
  const temporary = (Array.isArray(cookies) ? cookies : [String(cookies)])
    .map((v) => v.split(';')[0])
    .join('; ');
  return {
    state,
    cookies: `${cookie}; ${temporary}`,
    callback: `/me/connections/telegram/callback?state=${state}&code=synthetic-code`,
  };
}
it('removes both legacy login routes, rejects anonymous linking and CSRF, and never advertises Telegram login', async () => {
  const { app } = fixture();
  try {
    for (const endpoint of [
      '/auth/google/start',
      '/auth/google/callback',
      '/auth/telegram/start',
      '/auth/telegram/callback',
    ])
      expect((await app.inject(endpoint)).statusCode).toBe(404);
    expect((await app.inject('/auth/providers')).json()).toEqual({
      yandex: false,
      vk_id: false,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/me/connections/telegram/start',
          headers: { origin },
        })
      ).statusCode,
    ).toBe(401);
    const owner = await person();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/me/connections/telegram/start',
          headers: { cookie: owner.cookie, origin: 'https://evil.test' },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
it('binds once to the same session, changes no session or credentials, and can disconnect privately', async () => {
  const owner = await person();
  const { app, exchanges } = fixture();
  try {
    const initial = (
      await db.pool.query(
        'SELECT id,secret_hash,expires_at FROM sessions ORDER BY id',
      )
    ).rows;
    const begun = await start(app, owner.cookie);
    const result = await app.inject({
      url: begun.callback,
      headers: { cookie: begun.cookies },
    });
    expect(result.headers.location).toBe(
      `${origin}/me/settings?telegram=linked`,
    );
    expect(String(result.headers['set-cookie'])).not.toContain('da_session=');
    expect(
      (
        await db.pool.query(
          'SELECT id,secret_hash,expires_at FROM sessions ORDER BY id',
        )
      ).rows,
    ).toEqual(initial);
    expect((await db.pool.query('SELECT * FROM users')).rowCount).toBe(1);
    expect(
      (await db.pool.query('SELECT * FROM email_credentials')).rowCount,
    ).toBe(0);
    expect(
      (
        await db.pool.query(
          'SELECT user_id,provider,provider_user_id,provider_username FROM social_identities',
        )
      ).rows,
    ).toEqual([
      {
        user_id: owner.id,
        provider: 'telegram',
        provider_user_id: '123456',
        provider_username: null,
      },
    ]);
    expect(
      (
        await app.inject({
          url: begun.callback,
          headers: { cookie: begun.cookies },
        })
      ).headers.location,
    ).toContain('telegram=failed');
    expect(exchanges()).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/me/connections/telegram',
          headers: { cookie: owner.cookie, origin },
        })
      ).statusCode,
    ).toBe(204);
    expect(await repository.linked(owner.id)).toBe(false);
    expect(await sessions.validateSession(owner.token)).not.toBeNull();
  } finally {
    await app.close();
  }
});
it('rejects copied callbacks and changed accounts/sessions before contacting Telegram', async () => {
  const a = await person(),
    b = await person();
  const { app, exchanges } = fixture();
  try {
    const begun = await start(app, a.cookie);
    expect(
      (await app.inject({ url: begun.callback, headers: { cookie: a.cookie } }))
        .headers.location,
    ).toContain('telegram=failed');
    const other = await start(app, a.cookie);
    expect(
      (
        await app.inject({
          url: other.callback,
          headers: { cookie: other.cookies.replace(a.cookie, b.cookie) },
        })
      ).headers.location,
    ).toContain('telegram=failed');
    expect(exchanges()).toBe(0);
    expect(
      (await db.pool.query('SELECT * FROM social_identities')).rowCount,
    ).toBe(0);
  } finally {
    await app.close();
  }
});
it('rechecks revocation after the provider response and rejects expired attempts', async () => {
  const owner = await person();
  const { app } = fixture(async () => sessions.revokeSession(owner.token));
  try {
    const begun = await start(app, owner.cookie);
    expect(
      (
        await app.inject({
          url: begun.callback,
          headers: { cookie: begun.cookies },
        })
      ).headers.location,
    ).toContain('telegram=failed');
    expect(await repository.linked(owner.id)).toBe(false);
    const next = await person();
    const expired = await start(app, next.cookie);
    await db.pool.query(
      "UPDATE oauth_login_attempts SET created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes'",
    );
    expect(
      (
        await app.inject({
          url: expired.callback,
          headers: { cookie: expired.cookies },
        })
      ).headers.location,
    ).toContain('telegram=failed');
  } finally {
    await app.close();
  }
});
it('serializes competing accounts for one Telegram subject and one account for different subjects', async () => {
  const a = await person(),
    b = await person();
  const { app } = fixture();
  async function claimed(owner: typeof a) {
    const begun = await start(app, owner.cookie);
    const hash = createHash('sha256').update(begun.state).digest('hex');
    await db.pool.query(
      'UPDATE oauth_login_attempts SET consumed_at=now() WHERE state_hash=$1',
      [hash],
    );
    return hash;
  }
  try {
    const ah = await claimed(a),
      bh = await claimed(b);
    const results = await Promise.all([
      repository.connect(a.id, a.sessionId, '555', ah),
      repository.connect(b.id, b.sessionId, '555', bh),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const owner = await person();
    const one = await claimed(owner),
      other = await claimed(owner);
    const two = await Promise.all([
      repository.connect(owner.id, owner.sessionId, '666', one),
      repository.connect(owner.id, owner.sessionId, '777', other),
    ]);
    expect(two.filter(Boolean)).toHaveLength(1);
    expect(
      (
        await db.pool.query(
          "SELECT * FROM social_identities WHERE provider='telegram'",
        )
      ).rowCount,
    ).toBe(2);
  } finally {
    await app.close();
  }
});
it('disconnect cancels an already claimed callback waiting for Telegram and all other pending attempts', async () => {
  const owner = await person();
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  const providerEntered = new Promise<void>((resolve) => (entered = resolve));
  const { app } = fixture(async () => {
    entered();
    await waiting;
  });
  try {
    const begun = await start(app, owner.cookie);
    const pending = await start(app, owner.cookie);
    const callback = app.inject({
      url: begun.callback,
      headers: { cookie: begun.cookies },
    });
    const completion = Promise.resolve(callback);
    await providerEntered;
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/me/connections/telegram',
          headers: { cookie: owner.cookie, origin },
        })
      ).statusCode,
    ).toBe(204);
    release();
    expect((await completion).headers.location).toContain('telegram=failed');
    expect(
      (
        await app.inject({
          url: pending.callback,
          headers: { cookie: pending.cookies },
        })
      ).headers.location,
    ).toContain('telegram=failed');
    expect(await repository.linked(owner.id)).toBe(false);
    expect(await sessions.validateSession(owner.token)).not.toBeNull();
  } finally {
    release();
    await app.close();
  }
});
