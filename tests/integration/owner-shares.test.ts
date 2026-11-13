import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { buildApi } from '../../apps/api/src/app';
import { SessionService } from '../../packages/auth/src/index';
import { ownerSharesPageSchema } from '../../packages/contracts/src/index';
import {
  createDatabase,
  createPgNotificationRepository,
  createPgSessionRepository,
  createPgShareRepository,
} from '../../packages/db/src/index';
import { NotificationService } from '../../packages/notifications/src/index';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw new Error('Isolated autograph_test required');
const database = createDatabase(url);
const shares = createPgShareRepository(database.pool);
const sessions = new SessionService(
  createPgSessionRepository(database.pool),
  1209600,
);
const origin = 'http://127.0.0.1:3000';
const args: Parameters<typeof buildApi> = [
  database,
  sessions,
  {
    appEnvironment: 'test',
    sessionTtlSeconds: 1209600,
    trustedWebOrigins: [origin],
  },
];
args[15] = {
  shares,
  service: new NotificationService(
    createPgNotificationRepository(database.pool),
  ),
};
const app = buildApi(...args);

async function fixture() {
  const userId = randomUUID();
  const otherId = randomUUID();
  const creatorId = randomUUID();
  const wallId = randomUUID();
  await database.pool.query('INSERT INTO users (id) VALUES ($1),($2)', [
    userId,
    otherId,
  ]);
  await database.pool.query(
    'INSERT INTO creators (id,owner_user_id) VALUES ($1,$2)',
    [creatorId, userId],
  );
  await database.pool.query(
    "INSERT INTO creator_profiles (creator_id,slug,display_name) VALUES ($1,'owner-shares','Share owner')",
    [creatorId],
  );
  await database.pool.query(
    "INSERT INTO walls (id,creator_id,status,slot_count) VALUES ($1,$2,'ended',10)",
    [wallId, creatorId],
  );
  const owner = await sessions.createSession(userId);
  const other = await sessions.createSession(otherId);
  return {
    userId,
    otherId,
    wallId,
    ownerHeaders: { cookie: `da_session=${owner.token}`, origin },
    otherHeaders: { cookie: `da_session=${other.token}`, origin },
  };
}

async function seedShare(
  userId: string,
  wallId: string,
  options: { id?: string; time?: string; slotId?: string } = {},
) {
  const id = options.id ?? randomUUID();
  await database.pool.query(
    `INSERT INTO share_links (id,user_id,wall_id,slot_id,event,public_alias,created_at)
    VALUES ($1,$2,$3,$4,$5,'Owner alias',$6::timestamptz)`,
    [
      id,
      userId,
      wallId,
      options.slotId ?? null,
      options.slotId ? 'slot_claimed' : 'final_wall',
      options.time ?? '2026-11-12T12:00:00.000Z',
    ],
  );
  return id;
}

beforeEach(() => database.pool.query('TRUNCATE users CASCADE'));
afterAll(async () => {
  await app.close();
  await database.close();
});

it('requires a session and returns only the authenticated owner minimal DTO', async () => {
  const f = await fixture();
  const slot = (
    await database.pool.query<{ id: string }>(
      'SELECT id FROM slots WHERE wall_id=$1 AND position=0',
      [f.wallId],
    )
  ).rows[0]!;
  const mine = await seedShare(f.userId, f.wallId, { slotId: slot.id });
  const theirs = await seedShare(f.otherId, f.wallId);
  const anonymous = await app.inject({ url: '/me/shares' });
  expect(anonymous.statusCode).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const owner = await app.inject({
    url: '/me/shares',
    headers: f.ownerHeaders,
  });
  expect(owner.statusCode).toBe(200);
  expect(owner.headers['cache-control']).toBe('no-store');
  const page = ownerSharesPageSchema.parse(owner.json());
  expect(page).toEqual({
    items: [
      {
        id: mine,
        wallId: f.wallId,
        slotNumber: 1,
        event: 'slot_claimed',
        publicAlias: 'Owner alias',
        createdAt: '2026-11-12T12:00:00.000Z',
        revokedAt: null,
      },
    ],
    nextCursor: null,
  });
  expect(Object.keys(page.items[0]!).sort()).toEqual(
    [
      'id',
      'wallId',
      'slotNumber',
      'event',
      'publicAlias',
      'createdAt',
      'revokedAt',
    ].sort(),
  );
  const other = await app.inject({
    url: '/me/shares',
    headers: f.otherHeaders,
  });
  expect(other.json().items.map((item: { id: string }) => item.id)).toEqual([
    theirs,
  ]);
  expect(owner.body).not.toContain(f.userId);
  expect(owner.body).not.toContain(f.otherId);
  expect(owner.body).not.toContain(slot.id);
});

it('rejects malformed queries and treats unknown and foreign cursors identically', async () => {
  const f = await fixture();
  const foreign = await seedShare(f.otherId, f.wallId);
  for (const query of [
    'limit=0',
    'limit=51',
    'limit=1.5',
    'limit=1&limit=2',
    'cursor=invalid',
    `userId=${f.otherId}`,
  ]) {
    const result = await app.inject({
      url: `/me/shares?${query}`,
      headers: f.ownerHeaders,
    });
    expect(result.statusCode, query).toBe(400);
    expect(result.json()).toEqual({ error: { code: 'INVALID_REQUEST' } });
  }
  const results = [];
  for (const cursor of [foreign, randomUUID()]) {
    const result = await app.inject({
      url: `/me/shares?cursor=${cursor}`,
      headers: f.ownerHeaders,
    });
    results.push({ status: result.statusCode, body: result.json() });
    expect(result.headers['cache-control']).toBe('no-store');
  }
  expect(results).toEqual([
    { status: 400, body: { error: { code: 'INVALID_REQUEST' } } },
    { status: 400, body: { error: { code: 'INVALID_REQUEST' } } },
  ]);
});

it('paginates every owned link with timestamp ties and sub-millisecond ordering', async () => {
  const f = await fixture();
  for (let i = 0; i < 7; i++)
    await seedShare(f.userId, f.wallId, {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      time: `2026-11-12T12:00:00.00000${Math.floor(i / 3) + 1}Z`,
    });
  await seedShare(f.otherId, f.wallId);
  const expected = (
    await database.pool.query<{ id: string }>(
      'SELECT id FROM share_links WHERE user_id=$1 ORDER BY created_at DESC,id DESC',
      [f.userId],
    )
  ).rows.map((row) => row.id);
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const result = await app.inject({
      url: '/me/shares?limit=2' + (cursor ? `&cursor=${cursor}` : ''),
      headers: f.ownerHeaders,
    });
    expect(result.statusCode).toBe(200);
    const page = ownerSharesPageSchema.parse(result.json());
    expect(page.items.length).toBeLessThanOrEqual(2);
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    expect(++pages).toBeLessThan(6);
  } while (cursor);
  expect(seen).toEqual(expected);
  expect(new Set(seen).size).toBe(7);
});

it('keeps revoked links and links from archived Walls manageable by their owner', async () => {
  const f = await fixture();
  const first = await seedShare(f.userId, f.wallId);
  const second = await seedShare(f.userId, f.wallId);
  await shares.revoke(f.userId, first);
  await database.pool.query("UPDATE walls SET status='archived' WHERE id=$1", [
    f.wallId,
  ]);
  const page = await shares.list(f.userId, 20);
  expect(new Set(page.items.map((item) => item.id))).toEqual(
    new Set([first, second]),
  );
  expect(
    page.items.find((item) => item.id === first)!.revokedAt,
  ).not.toBeNull();
  expect(page.items.find((item) => item.id === second)!.revokedAt).toBeNull();
  expect(await shares.public(second)).toBeNull();
  await shares.revoke(f.userId, second);
  expect(
    (await shares.list(f.userId, 20)).items.every((item) => item.revokedAt),
  ).toBe(true);
});

it('revokes a real created link idempotently without allowing another owner to revoke it', async () => {
  const f = await fixture();
  const created = await app.inject({
    method: 'POST',
    url: '/me/shares',
    headers: f.ownerHeaders,
    payload: { wallId: f.wallId },
  });
  expect(created.statusCode).toBe(200);
  const id = created.json().id as string;
  expect((await app.inject({ url: `/public/shares/${id}` })).statusCode).toBe(
    200,
  );
  const forbidden = await app.inject({
    method: 'DELETE',
    url: `/me/shares/${id}`,
    headers: f.otherHeaders,
  });
  expect(forbidden.statusCode).toBe(404);
  let timestamp: string | null = null;
  for (let i = 0; i < 2; i++) {
    const result = await app.inject({
      method: 'DELETE',
      url: `/me/shares/${id}`,
      headers: f.ownerHeaders,
    });
    expect(result.statusCode).toBe(204);
    const current = (await shares.list(f.userId, 20)).items[0]!;
    expect(current.revokedAt).not.toBeNull();
    if (timestamp) expect(current.revokedAt).toBe(timestamp);
    timestamp = current.revokedAt;
  }
  for (const path of [`/public/shares/${id}`, `/public/shares/${id}/card`])
    expect((await app.inject({ url: path })).statusCode).toBe(404);
});
