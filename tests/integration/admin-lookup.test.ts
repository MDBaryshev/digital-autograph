import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApi } from '../../apps/api/src/app';
import { registerAdminLookup } from '../../apps/api/src/admin-lookup';
import { SessionService } from '../../packages/auth/src/index';
import {
  createDatabase,
  createPgAdminLookupRepository,
  createPgSessionRepository,
  migrate,
} from '../../packages/db/src/index';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/autograph_test' ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
)
  throw Error('Isolated local test database required');
const control = createDatabase(url);
const name = 'admin_lookup_' + randomUUID().replaceAll('-', '');
const target = new URL(url);
target.pathname = '/' + name;
const database = createDatabase(target.href);
const sessions = new SessionService(
  createPgSessionRepository(database.pool),
  3600,
);
const repository = createPgAdminLookupRepository(database.pool);
const app = buildApi(database, sessions, {
  appEnvironment: 'test',
  sessionTtlSeconds: 3600,
  trustedWebOrigins: ['http://127.0.0.1:3000'],
});
registerAdminLookup(app, repository);
let created = false;
beforeAll(async () => {
  await control.pool.query(`CREATE DATABASE ${name}`);
  created = true;
  await migrate(database.db, { migrationsFolder: 'packages/db/drizzle' });
});
afterAll(async () => {
  await app.close();
  await database.close();
  if (created) await control.pool.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await control.close();
});
async function person(role?: 'admin' | 'moderator' | 'finance') {
  const id = randomUUID();
  await database.pool.query('INSERT INTO users(id) VALUES($1)', [id]);
  if (role)
    await database.pool.query(
      'INSERT INTO user_roles(user_id,role) VALUES($1,$2)',
      [id, role],
    );
  const { token } = await sessions.createSession(id);
  return { id, headers: { cookie: `da_session=${token}` } };
}
function read(headers?: { cookie: string }, id?: string) {
  return app.inject({
    url:
      '/admin/lookup' +
      (id === undefined ? '' : '?' + new URLSearchParams({ id })),
    headers,
  });
}

it('requires an active persistent admin for probes and records, including after role revocation', async () => {
  const target = await person();
  for (const role of [undefined, 'moderator', 'finance'] as const) {
    const actor = await person(role);
    for (const id of [undefined, target.id]) {
      const response = await read(actor.headers, id);
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain(target.id);
    }
  }
  expect((await read(undefined, target.id)).statusCode).toBe(401);
  const admin = await person('admin');
  expect((await read(admin.headers)).json()).toEqual({ items: [] });
  expect((await read(admin.headers, target.id)).statusCode).toBe(200);
  await database.pool.query(
    "DELETE FROM user_roles WHERE user_id=$1 AND role='admin'",
    [admin.id],
  );
  expect((await read(admin.headers, target.id)).statusCode).toBe(403);
  await database.pool.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'admin')",
    [admin.id],
  );
  await database.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
    admin.id,
  ]);
  expect((await read(admin.headers, target.id)).statusCode).toBe(401);
  await expect(repository.lookup(admin.id, target.id)).rejects.toThrow(
    'FORBIDDEN',
  );
});

it('returns exact user, creator, Wall and private Autograph metadata without private fields or enumeration', async () => {
  const admin = await person('admin');
  const owner = await person();
  const creator = (
    await database.pool.query(
      'INSERT INTO creators(owner_user_id) VALUES($1) RETURNING id',
      [owner.id],
    )
  ).rows[0]!.id;
  const wall = (
    await database.pool.query(
      "INSERT INTO walls(creator_id,status,slot_count) VALUES($1,'draft',10) RETURNING id",
      [creator],
    )
  ).rows[0]!.id;
  const autograph = (
    await database.pool.query(
      "INSERT INTO autographs(user_id,source) VALUES($1,'canvas') RETURNING id",
      [owner.id],
    )
  ).rows[0]!.id;
  for (const [id, kind, state] of [
    [owner.id, 'user', 'active'],
    [creator, 'creator', null],
    [wall, 'wall', 'draft'],
    [autograph, 'autograph', 'draft'],
  ]) {
    const response = await read(admin.headers, (id as string).toUpperCase());
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const result = response.json();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind, id, state });
    expect(Object.keys(result.items[0]).sort()).toEqual([
      'createdAt',
      'id',
      'kind',
      'state',
    ]);
    expect(Number.isFinite(Date.parse(result.items[0].createdAt))).toBe(true);
  }
  expect((await read(admin.headers, randomUUID())).json()).toEqual({
    items: [],
  });
  expect((await read(admin.headers)).json()).toEqual({ items: [] });
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    expect(
      (await createPgAdminLookupRepository(client).lookup(admin.id, autograph))
        .items,
    ).toHaveLength(1);
    await client.query('COMMIT');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

it('rejects malformed, oversized and extra query fields without changing records', async () => {
  const admin = await person('admin');
  for (const query of [
    'id=',
    'id=not-a-uuid',
    'id=' + 'a'.repeat(512),
    'id=' + randomUUID() + '&extra=1',
    'id=' + randomUUID() + '&id=' + randomUUID(),
  ]) {
    const response = await app.inject({
      url: '/admin/lookup?' + query,
      headers: admin.headers,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'INVALID_LOOKUP' } });
  }
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/admin/lookup',
        headers: { ...admin.headers, origin: 'http://127.0.0.1:3000' },
        payload: { id: admin.id },
      })
    ).statusCode,
  ).toBe(404);
});
