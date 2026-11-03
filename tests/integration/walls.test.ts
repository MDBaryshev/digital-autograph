import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionService } from '../../packages/auth/src/index';
import { buildApi } from '../../apps/api/src/app';
import {
  createDatabase,
  createPgSessionRepository,
  createPgWallRepository,
} from '../../packages/db/src/index';
import { WallService } from '../../packages/walls/src/index';
import { creatorProfiles, creators, users } from '../../packages/db/src/schema';
import { userFixture } from './fixtures';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test') {
  throw new Error(
    'Wall integration tests require the isolated autograph_test database',
  );
}

const database = createDatabase(url);
const sessions = new SessionService(
  createPgSessionRepository(database.pool),
  1209600,
);
const walls = new WallService(createPgWallRepository(database.pool));
const app = buildApi(
  database,
  sessions,
  {
    appEnvironment: 'test',
    sessionTtlSeconds: 1209600,
    trustedWebOrigins: ['http://127.0.0.1:3000'],
  },
  undefined,
  undefined,
  walls,
);

async function fixture() {
  const [owner] = await database.db
    .insert(users)
    .values(userFixture(1))
    .returning();
  const [other] = await database.db
    .insert(users)
    .values(userFixture(2))
    .returning();
  if (!owner || !other) throw new Error('Expected users');
  const [creator] = await database.db
    .insert(creators)
    .values({ ownerUserId: owner.id })
    .returning();
  if (!creator) throw new Error('Expected creator');
  await database.db.insert(creatorProfiles).values({
    creatorId: creator.id,
    slug: 'creator-one',
    displayName: 'Creator One',
  });
  const ownerToken = (await sessions.createSession(owner.id)).token;
  const otherToken = (await sessions.createSession(other.id)).token;
  return { owner, other, creator, ownerToken, otherToken };
}

function headers(token?: string) {
  return token
    ? { cookie: `da_session=${token}`, origin: 'http://127.0.0.1:3000' }
    : {};
}

async function create(
  creatorId: string,
  token: string,
  body: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: `/creators/${creatorId}/walls`,
    headers: headers(token),
    payload: body,
  });
}

async function patch(id: string, token: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: `/walls/${id}`,
    headers: headers(token),
    payload: body,
  });
}

async function action(id: string, token: string, name: string) {
  return app.inject({
    method: 'POST',
    url: `/walls/${id}/transitions`,
    headers: headers(token),
    payload: { action: name },
  });
}

describe('Creator and Wall Domain with PostgreSQL', () => {
  beforeAll(async () => database.checkConnection());
  beforeEach(async () => database.pool.query('TRUNCATE TABLE users CASCADE'));
  afterAll(async () => {
    await app.close();
    await database.close();
  });

  it('authorizes owner mutations and exposes only public creator data', async () => {
    const { creator, ownerToken, otherToken } = await fixture();
    const publicCreator = await app.inject('/creators/creator-one');
    expect(publicCreator.statusCode).toBe(200);
    expect(publicCreator.json()).toEqual({
      id: creator.id,
      slug: 'creator-one',
      displayName: 'Creator One',
      walls: [],
    });
    expect(publicCreator.body).not.toContain('ownerUserId');
    expect((await create(creator.id, otherToken)).statusCode).toBe(403);
    expect((await create(creator.id, '')).statusCode).toBe(401);
    const created = await create(creator.id, ownerToken);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      creatorId: creator.id,
      status: 'draft',
      slotCount: 10,
    });
    const id = created.json().id as string;
    expect((await patch(id, otherToken, { startAt: null })).statusCode).toBe(
      403,
    );
    expect((await action(id, otherToken, 'publish')).statusCode).toBe(403);
    expect((await app.inject(`/walls/${id}`)).statusCode).toBe(404);
    expect((await app.inject('/creators/unknown')).statusCode).toBe(404);
  });

  it('creates ten stable positions and forbids every resize, including before publication', async () => {
    const { creator, owner, ownerToken } = await fixture();
    const created = await create(creator.id, ownerToken);
    const id = created.json().id as string;
    const initial = created.json().slots as Array<{
      id: string;
      position: number;
    }>;
    expect(initial.map((slot) => slot.position)).toEqual(
      Array.from({ length: 10 }, (_, i) => i),
    );
    const grown = await patch(id, ownerToken, { slotCount: 5 });
    expect(grown.statusCode).toBe(400);
    const shrunk = await patch(id, ownerToken, { slotCount: 2 });
    expect(shrunk.statusCode).toBe(400);
    expect(
      (await patch(id, ownerToken, { startAt: null })).json().slots,
    ).toEqual(initial);
    await database.pool.query(
      "INSERT INTO placements (slot_id, user_id, source) VALUES ($1::uuid, $2::uuid, 'admin')",
      [initial[0]?.id, owner.id],
    );
    expect((await patch(id, ownerToken, { slotCount: 1 })).json()).toEqual({
      error: { code: 'INVALID_REQUEST' },
    });
    await database.pool.query(
      "UPDATE placements SET ended_at = now(), end_reason = 'test' WHERE slot_id = $1::uuid",
      [initial[0]?.id],
    );
    expect((await patch(id, ownerToken, { slotCount: 1 })).statusCode).toBe(
      400,
    );
    const counts = await database.pool.query<{ count: string }>(
      'SELECT count(*) FROM slots WHERE wall_id = $1::uuid',
      [id],
    );
    expect(counts.rows[0]?.count).toBe('10');
  });

  it('enforces explicit lifecycle and public visibility with active placement occupancy', async () => {
    const { creator, owner, ownerToken } = await fixture();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const created = await create(creator.id, ownerToken, {
      startAt: future,
    });
    const id = created.json().id as string;
    expect((await action(id, ownerToken, 'publish')).statusCode).toBe(400);
    expect((await action(id, ownerToken, 'schedule')).json().status).toBe(
      'scheduled',
    );
    expect((await app.inject(`/walls/${id}`)).statusCode).toBe(200);
    expect(
      (await app.inject('/creators/creator-one')).json().walls,
    ).toHaveLength(1);
    expect((await patch(id, ownerToken, { slotCount: 3 })).statusCode).toBe(
      400,
    );
    expect((await action(id, ownerToken, 'pause')).statusCode).toBe(409);
    expect((await action(id, ownerToken, 'unschedule')).json().status).toBe(
      'draft',
    );
    expect((await patch(id, ownerToken, { startAt: null })).statusCode).toBe(
      200,
    );
    expect((await action(id, ownerToken, 'publish')).json().status).toBe(
      'live',
    );
    const slotId = created.json().slots[0].id as string;
    await database.pool.query(
      "INSERT INTO placements (slot_id, user_id, source) VALUES ($1::uuid, $2::uuid, 'admin')",
      [slotId, owner.id],
    );
    const publicWall = await app.inject(`/walls/${id}`);
    expect(publicWall.json().slots[0]).toMatchObject({
      occupied: true,
      currentPlacement: { source: 'admin' },
    });
    expect(publicWall.body).not.toContain(owner.id);
    expect((await action(id, ownerToken, 'pause')).json().status).toBe(
      'paused',
    );
    expect((await action(id, ownerToken, 'resume')).json().status).toBe('live');
    expect((await action(id, ownerToken, 'end')).json().status).toBe('ended');
    expect((await action(id, ownerToken, 'archive')).json().status).toBe(
      'archived',
    );
    expect((await app.inject(`/walls/${id}`)).statusCode).toBe(404);
    expect(
      (await app.inject('/creators/creator-one')).json().walls,
    ).toHaveLength(0);
  });

  it('serializes concurrent transitions on the same Wall', async () => {
    const { creator, ownerToken } = await fixture();
    const id = (await create(creator.id, ownerToken)).json().id as string;
    expect((await action(id, ownerToken, 'publish')).statusCode).toBe(200);
    const results = await Promise.all([
      action(id, ownerToken, 'pause'),
      action(id, ownerToken, 'end'),
    ]);
    expect(
      results.find(
        (result) =>
          result.statusCode === 200 && result.json().status === 'ended',
      ),
    ).toBeDefined();
    expect(
      results.every(
        (result) => result.statusCode === 200 || result.statusCode === 409,
      ),
    ).toBe(true);
    const stored = await database.pool.query<{ status: string }>(
      'SELECT status FROM walls WHERE id = $1::uuid',
      [id],
    );
    expect(stored.rows[0]?.status).toBe('ended');
  });

  it('admits only one Wall across concurrent pools and different Creators of one account', async () => {
    const { creator, owner } = await fixture();
    const [secondCreator] = await database.db
      .insert(creators)
      .values({ ownerUserId: owner.id })
      .returning();
    const second = createDatabase(url!);
    const services = [
      walls,
      new WallService(createPgWallRepository(second.pool)),
    ];
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          services[i % 2]!.createWall(
            owner.id,
            i % 2 ? secondCreator!.id : creator.id,
            { startAt: null, endAt: null },
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const result of results)
        if (result.status === 'rejected')
          expect(result.reason.code).toBe('WALL_ALREADY_EXISTS');
      const stored = await database.pool.query(
        'SELECT id,slot_count,owner_user_id FROM walls',
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]).toMatchObject({
        slot_count: 10,
        owner_user_id: owner.id,
      });
      expect(
        (
          await database.pool.query(
            'SELECT position FROM slots ORDER BY position',
          )
        ).rows.map((r) => r.position),
      ).toEqual(Array.from({ length: 10 }, (_, i) => i));
    } finally {
      await second.close();
    }
  });

  it('creates all ten positions with the limited API row-lock and insert privileges', async () => {
    const { owner, creator } = await fixture();
    const role = 'wall_policy_api_' + creator.id.replaceAll('-', '');
    const password = randomUUID();
    await database.pool.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`,
    );
    const target = new URL(url!);
    target.username = role;
    target.password = password;
    const restricted = createDatabase(target.href);
    try {
      await database.pool.query(
        `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON creators,walls,slots,placements,platform_pricing_default,pricing_config_versions TO ${role}; GRANT INSERT ON walls,slots TO ${role}; GRANT UPDATE(updated_at) ON creators TO ${role}; GRANT UPDATE(position) ON slots TO ${role}`,
      );
      const service = new WallService(createPgWallRepository(restricted.pool));
      const created = await service.createWall(owner.id, creator.id, {
        startAt: null,
        endAt: null,
      });
      expect(created.slots).toHaveLength(10);
      await expect(
        service.createWall(owner.id, creator.id, {
          startAt: null,
          endAt: null,
        }),
      ).rejects.toMatchObject({ code: 'WALL_ALREADY_EXISTS' });
    } finally {
      await restricted.close();
      await database.pool.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
    }
  });

  it('counts an archived Wall toward the account limit and returns a clear conflict', async () => {
    const { creator, ownerToken } = await fixture();
    const id = (await create(creator.id, ownerToken)).json().id;
    for (const transition of ['publish', 'end', 'archive'])
      expect((await action(id, ownerToken, transition)).statusCode).toBe(200);
    const retry = await create(creator.id, ownerToken);
    expect(retry.statusCode).toBe(409);
    expect(retry.json()).toEqual({ error: { code: 'WALL_ALREADY_EXISTS' } });
  });

  it('enforces account ownership and the ten positions even for direct SQL writes', async () => {
    const { creator, owner, other, ownerToken } = await fixture();
    const wall = (await create(creator.id, ownerToken)).json();
    await expect(
      database.pool.query('UPDATE walls SET slot_count=9 WHERE id=$1', [
        wall.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.pool.query('DELETE FROM slots WHERE id=$1', [wall.slots[0].id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.pool.query('INSERT INTO slots(wall_id,position) VALUES($1,10)', [
        wall.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.pool.query('UPDATE slots SET position=11 WHERE id=$1', [
        wall.slots[0].id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await database.pool.query('UPDATE walls SET owner_user_id=$1 WHERE id=$2', [
      other.id,
      wall.id,
    ]);
    expect(
      (
        await database.pool.query(
          'SELECT owner_user_id FROM walls WHERE id=$1',
          [wall.id],
        )
      ).rows[0].owner_user_id,
    ).toBe(owner.id);
    const [secondCreator] = await database.db
      .insert(creators)
      .values({ ownerUserId: other.id })
      .returning();
    await walls.createWall(other.id, secondCreator!.id, {
      startAt: null,
      endAt: null,
    });
    await expect(
      database.pool.query('UPDATE creators SET owner_user_id=$1 WHERE id=$2', [
        owner.id,
        secondCreator!.id,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (
        await database.pool.query(
          'SELECT count(*)::int n FROM slots WHERE wall_id=$1',
          [wall.id],
        )
      ).rows[0].n,
    ).toBe(10);
  });

  it('validates input and handles creators without owners', async () => {
    const { creator, ownerToken } = await fixture();
    expect(
      (await create(creator.id, ownerToken, { slotCount: 0 })).statusCode,
    ).toBe(400);
    expect(
      (
        await create(creator.id, ownerToken, {
          startAt: 'yesterday',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await create(creator.id, ownerToken, {
          startAt: '2026-09-29T00:00:00Z',
          endAt: '2026-09-28T00:00:00Z',
        })
      ).statusCode,
    ).toBe(400);
    expect((await create('not-a-uuid', ownerToken)).statusCode).toBe(400);
    await database.pool.query(
      'UPDATE creators SET owner_user_id = NULL WHERE id = $1::uuid',
      [creator.id],
    );
    expect((await create(creator.id, ownerToken)).statusCode).toBe(403);
    const [withoutProfile] = await database.db
      .insert(creators)
      .values({ ownerUserId: null })
      .returning();
    if (!withoutProfile) throw new Error('Expected creator');
    expect(
      (await app.inject(`/creators/${withoutProfile.id}`)).statusCode,
    ).toBe(404);
  });
});
