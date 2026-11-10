import { randomUUID } from 'node:crypto';
import { buildApi } from '../../apps/api/src/app';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { SessionService } from '../../packages/auth/src/index';
import {
  createPgSessionRepository,
  createPgAccountWorkspaceRepository,
  createDatabase,
  createPgProfileModerationRepository,
  createPgTelegramProfileRepository,
  migrate,
} from '../../packages/db/src/index';
import { registerAccountWorkspace } from '../../apps/api/src/account-workspace';
import { scram, sqlScript } from '../../deploy/manual-deploy.mjs';
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/autograph_test' ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
)
  throw Error('Isolated local DB required');
const control = createDatabase(url);
const name = 'account_' + randomUUID().replaceAll('-', '');
const isolatedUrl = new URL(url);
isolatedUrl.pathname = '/' + name;
const admin = createDatabase(isolatedUrl.href);
let created = false,
  rolesOwned = false;
const id = randomUUID(),
  other = randomUUID(),
  moderator = randomUUID(),
  slug = 'account-' + randomUUID();
const runtimeUrl = new URL(isolatedUrl);
runtimeUrl.username = 'da_api';
runtimeUrl.password = 'synthetic-account-test-password-0123456789';
const db = createDatabase(runtimeUrl.href);
const sessions = new SessionService(createPgSessionRepository(db.pool), 3600);
const tokens: Record<string, string> = {};
const headers = (user: string) => ({
  cookie: `da_session=${tokens[user]}`,
  origin: 'http://127.0.0.1:3000',
});
const app = buildApi(db, sessions, {
  appEnvironment: 'test',
  sessionTtlSeconds: 3600,
  trustedWebOrigins: ['http://127.0.0.1:3000'],
});
registerAccountWorkspace(
  app,
  createPgAccountWorkspaceRepository(db.pool),
  true,
);
beforeAll(async () => {
  expect(
    (
      await control.pool.query(
        "SELECT rolname FROM pg_roles WHERE rolname IN ('da_api','da_worker','da_migrator')",
      )
    ).rows,
  ).toHaveLength(0);
  await control.pool.query(`CREATE DATABASE ${name}`);
  created = true;
  await migrate(admin.db, { migrationsFolder: 'packages/db/drizzle' });
  await admin.pool.query(`INSERT INTO users(id) VALUES ($1),($2),($3)`, [
    id,
    other,
    moderator,
  ]);
  await admin.pool.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'moderator')",
    [moderator],
  );
  await admin.pool.query(
    `INSERT INTO autographs(user_id,source) VALUES ($1,'canvas'),($2,'photo')`,
    [id, other],
  );
  const passwords = [
    runtimeUrl.password,
    'synthetic-worker-test-password-0123456789',
    'synthetic-migration-test-password-0123456789',
  ];
  await admin.pool.query(
    passwords
      .map(
        (p, i) =>
          `SET destka.${['api', 'worker', 'migrator'][i]}_scram='${scram(p)}';`,
      )
      .join('\n') + sqlScript('deploy', 'postgres-bootstrap.sql'),
  );
  rolesOwned = true;
  await admin.pool.query(sqlScript('deploy', 'postgres-runtime.sql'));
  tokens[id] = (await sessions.createSession(id)).token;
  tokens[other] = (await sessions.createSession(other)).token;
});
afterAll(async () => {
  await app.close();
  await db.close();
  await admin.close();
  if (created) await control.pool.query(`DROP DATABASE ${name} WITH (FORCE)`);
  if (rolesOwned)
    await control.pool.query('DROP ROLE da_api,da_worker,da_migrator');
  await control.close();
});
it('denies anonymous access and lists only the authenticated owner, with no private keys', async () => {
  expect((await app.inject('/me/workspace')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/me/profile',
        payload: { displayName: 'Anonymous', slug: 'anonymous' },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/me/profile',
        headers: { ...headers(id), origin: 'https://untrusted.example.test' },
        payload: { displayName: 'Forged', slug: 'forged' },
      })
    ).statusCode,
  ).toBe(403);
  const r = await app.inject({
    url: '/me/workspace',
    headers: headers(id),
  });
  expect(r.statusCode).toBe(200);
  expect(r.headers['cache-control']).toBe('no-store');
  expect(r.json().autographs).toHaveLength(1);
  expect(r.json().autographs[0].source).toBe('canvas');
  expect(r.body).not.toMatch(/storage_key|secret_hash|provider_user_id/);
});
it('screens Telegram snapshots with the restricted runtime role', async () => {
  const repository = createPgTelegramProfileRepository(db.pool);
  await repository.enqueue(
    id,
    { name: 'Synthetic name', username: 'sample', avatarDataUrl: null },
    new Date(),
  );
  const job = (await repository.claim())!;
  await repository.finish(job, {
    kind: 'flagged',
    model: 'synthetic/vision',
    reason: 'SEXUAL_CONTENT',
  });
  const profiles = createPgProfileModerationRepository(db.pool);
  const item = (await profiles.list(moderator, 1)).items[0]!;
  expect(await profiles.preview(moderator, item.id)).toMatchObject({
    kind: 'telegram',
    suggestedReason: 'SEXUAL_CONTENT',
  });
  await profiles.decide(
    moderator,
    item.id,
    { decision: 'rejected', reasonCode: 'SEXUAL_CONTENT' },
    false,
  );
  expect(await repository.status(id)).toEqual({
    status: 'rejected',
    reasonCode: 'SEXUAL_CONTENT',
  });
});
it('serializes concurrent profile creation with restricted credentials; collisions roll back', async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      app.inject({
        method: 'PUT',
        url: '/me/profile',
        headers: headers(id),
        payload: { displayName: 'My studio', slug },
      }),
    ),
  );
  expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
  await createPgProfileModerationRepository(db.pool).decide(
    moderator,
    results[0]!.json().submissionId,
    { decision: 'approved' },
  );
  expect(
    (
      await admin.pool.query(
        'SELECT count(*)::int AS n FROM creators WHERE owner_user_id=$1',
        [id],
      )
    ).rows[0].n,
  ).toBe(1);
  const duplicate = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(other),
    payload: { displayName: 'Other', slug },
  });
  expect(duplicate.statusCode).toBe(409);
  expect(
    (
      await admin.pool.query(
        'SELECT count(*)::int AS n FROM creators WHERE owner_user_id=$1',
        [other],
      )
    ).rows[0].n,
  ).toBe(0);
  const result = await app.inject({
    url: '/me/workspace',
    headers: headers(other),
  });
  expect(result.json().profile).toBeNull();
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/me/profile',
        headers: headers(id),
        payload: { displayName: 'x', slug, userId: other },
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await db.pool.query(
        "SELECT rolsuper,has_database_privilege(current_user,current_database(),'CREATE') AS ddl FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0],
  ).toEqual({ rolsuper: false, ddl: false });
});
it('updates the display name on the server and exposes only owned Walls', async () => {
  const r = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(id),
    payload: { displayName: 'New name', slug },
  });
  expect(r.statusCode).toBe(200);
  await createPgProfileModerationRepository(db.pool).decide(
    moderator,
    r.json().submissionId,
    { decision: 'approved' },
  );
  const summary = await app.inject({
    url: '/me/workspace',
    headers: headers(id),
  });
  expect(summary.json().profile.displayName).toBe('New name');
  expect(summary.json().walls).toEqual([]);
  expect(summary.json().canModerate).toBe(false);
});
it('never returns another owner’s private draft Wall', async () => {
  const p = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(other),
    payload: { displayName: 'Other creator', slug: 'other-' + slug },
  });
  expect(p.statusCode).toBe(200);
  await createPgProfileModerationRepository(db.pool).decide(
    moderator,
    p.json().submissionId,
    { decision: 'approved' },
  );
  const otherCreator = (
    await admin.pool.query('SELECT id FROM creators WHERE owner_user_id=$1', [
      other,
    ])
  ).rows[0].id;
  const ownCreator = (
    await admin.pool.query('SELECT id FROM creators WHERE owner_user_id=$1', [
      id,
    ])
  ).rows[0].id;
  const own = (
    await admin.pool.query(
      'INSERT INTO walls(creator_id,slot_count) VALUES ($1,10) RETURNING id',
      [ownCreator],
    )
  ).rows[0].id;
  const foreign = (
    await admin.pool.query(
      'INSERT INTO walls(creator_id,slot_count) VALUES ($1,10) RETURNING id',
      [otherCreator],
    )
  ).rows[0].id;
  const result = await app.inject({
    url: '/me/workspace',
    headers: headers(id),
  });
  expect(result.json().walls.map((w: { id: string }) => w.id)).toEqual([own]);
  expect(result.body).not.toContain(foreign);
});
it.each(['x', 'a'.repeat(128)])(
  'can edit an existing valid creator slug of length %s without changing its URL',
  async (existingSlug) => {
    const user = randomUUID();
    await admin.pool.query('INSERT INTO users(id) VALUES ($1)', [user]);
    tokens[user] = (await sessions.createSession(user)).token;
    const creator = (
      await admin.pool.query(
        'INSERT INTO creators(owner_user_id) VALUES ($1) RETURNING id',
        [user],
      )
    ).rows[0].id;
    await admin.pool.query(
      'INSERT INTO creator_profiles(creator_id,slug,display_name) VALUES ($1,$2,$3)',
      [creator, existingSlug, 'Existing creator'],
    );
    const result = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: headers(user),
      payload: { displayName: 'Updated creator', slug: existingSlug },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().slug).toBe(existingSlug);
  },
);
it('keeps public profile writes closed by default without mutating existing data', async () => {
  const closed = buildApi(db, sessions, {
    appEnvironment: 'test',
    sessionTtlSeconds: 3600,
    trustedWebOrigins: ['http://127.0.0.1:3000'],
  });
  registerAccountWorkspace(closed, createPgAccountWorkspaceRepository(db.pool));
  try {
    const result = await closed.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: headers(id),
      payload: { displayName: 'Must not publish', slug: 'must-not-publish' },
    });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('PROFILE_PUBLICATION_UNAVAILABLE');
    const summary = await closed.inject({
      url: '/me/workspace',
      headers: headers(id),
    });
    expect(summary.json().canEditProfile).toBe(false);
    expect(summary.json().profile.slug).toBe(slug);
    expect(result.headers['cache-control']).toBe('no-store');
  } finally {
    await closed.close();
  }
});
it('requires the first-use gate even when profile publication has been separately approved', async () => {
  const gated = buildApi(db, sessions, {
    appEnvironment: 'test',
    sessionTtlSeconds: 3600,
    trustedWebOrigins: ['http://127.0.0.1:3000'],
    firstUseEnforced: true,
  });
  registerAccountWorkspace(
    gated,
    createPgAccountWorkspaceRepository(db.pool),
    true,
  );
  try {
    const result = await gated.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: headers(id),
      payload: { displayName: 'Not accepted', slug: 'not-accepted' },
    });
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('LEGAL_DOCUMENT_UNAVAILABLE');
    expect(
      (
        await admin.pool.query(
          'SELECT slug FROM creator_profiles WHERE creator_id IN (SELECT id FROM creators WHERE owner_user_id=$1)',
          [id],
        )
      ).rows,
    ).toEqual([{ slug }]);
  } finally {
    await gated.close();
  }
});
it('updates the displayed profile when an older owned creator has no profile', async () => {
  const user = randomUUID();
  await admin.pool.query('INSERT INTO users(id) VALUES ($1)', [user]);
  tokens[user] = (await sessions.createSession(user)).token;
  await admin.pool.query(
    "INSERT INTO creators(owner_user_id,created_at) VALUES ($1,'2020-01-01')",
    [user],
  );
  const current = (
    await admin.pool.query(
      "INSERT INTO creators(owner_user_id,created_at) VALUES ($1,'2021-01-01') RETURNING id",
      [user],
    )
  ).rows[0].id;
  await admin.pool.query(
    'INSERT INTO creator_profiles(creator_id,slug,display_name) VALUES ($1,$2,$3)',
    [current, 'legacy-' + user, 'Existing profile'],
  );
  const before = await app.inject({
    url: '/me/workspace',
    headers: headers(user),
  });
  expect(before.json().profile.id).toBe(current);
  const result = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(user),
    payload: { displayName: 'Changed name', slug: 'legacy-' + user },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json().id).toBe(current);
  expect(
    (
      await admin.pool.query(
        'SELECT creator_id FROM creator_profiles WHERE creator_id IN (SELECT id FROM creators WHERE owner_user_id=$1)',
        [user],
      )
    ).rows,
  ).toEqual([{ creator_id: current }]);
});
it('preserves PostgreSQL Unicode name limits and rejects invalid names before SQL', async () => {
  const name = '😀'.repeat(200);
  const result = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(id),
    payload: { displayName: name, slug },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json().displayName).toBe(name);
  await createPgProfileModerationRepository(db.pool).decide(
    moderator,
    result.json().submissionId,
    { decision: 'approved' },
  );
  for (const displayName of ['x\u0000y', '\uD800', '😀'.repeat(201)]) {
    const invalid = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: headers(id),
      payload: { displayName, slug },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_PROFILE');
  }
  expect(
    (await app.inject({ url: '/me/workspace', headers: headers(id) })).json()
      .profile.displayName,
  ).toBe(name);
});
