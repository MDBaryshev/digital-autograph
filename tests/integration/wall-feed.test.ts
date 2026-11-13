import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { SessionService } from '../../packages/auth/src';
import { wallFeedResponse } from '../../packages/contracts/src';
import {
  createDatabase,
  createPgAppearanceRepository,
  createPgSessionRepository,
  createPgWallFeedRepository,
  createPgWallRepository,
} from '../../packages/db/src';
import { WallService } from '../../packages/walls/src';
import {
  autographs,
  creatorProfiles,
  creators,
  placements,
  users,
  walls,
} from '../../packages/db/src/schema';
import { buildApi } from '../../apps/api/src/app';
import { registerWallFeedRoutes } from '../../apps/api/src/walls/feed-http';
import {
  creatorFixture,
  fixtureId,
  slotForWall,
  userFixture,
  wallFixture,
} from './fixtures';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('Isolated test database required');
const database = createDatabase(url);
const sessionService = new SessionService(
  createPgSessionRepository(database.pool),
  1209600,
);
const app = buildApi(database, sessionService, {
  appEnvironment: 'test',
  sessionTtlSeconds: 1209600,
  trustedWebOrigins: ['http://127.0.0.1:3000'],
});
registerWallFeedRoutes(app, createPgWallFeedRepository(database.pool));

const actor = userFixture(1).id!;
const signer = userFixture(2).id!;
const now = Date.now();
const day = 86_400_000;
let actorToken: string;

beforeAll(async () => {
  await app.ready();
});
beforeEach(async () => {
  await database.pool.query('TRUNCATE users CASCADE');
  await database.db.insert(users).values([userFixture(1), userFixture(2)]);
  actorToken = (await sessionService.createSession(actor)).token;
});
afterAll(async () => {
  await app.close();
  await database.close();
});

async function wall(
  n: number,
  discoverable = false,
  daysAgo = 2,
  status: 'live' | 'archived' | 'draft' = 'live',
) {
  const owner = userFixture(n);
  const creator = creatorFixture(n, owner.id);
  const record = wallFixture(creator.id!, n);
  const slug = `wall-feed-${n}`;
  await database.db.insert(users).values(owner);
  await database.db.insert(creators).values(creator);
  await database.db
    .insert(creatorProfiles)
    .values({ creatorId: creator.id!, slug, displayName: `Author ${n}` });
  await database.db.insert(walls).values({
    ...record,
    status,
    discoverable,
    updatedAt: new Date(now - daysAgo * day),
  });
  return { id: record.id!, owner: owner.id!, creatorId: creator.id!, slug };
}

function request(
  method: 'GET' | 'PUT' | 'DELETE',
  url: string,
  token?: string,
) {
  return app.inject({
    method,
    url,
    headers: {
      origin: 'http://127.0.0.1:3000',
      ...(token && { cookie: `da_session=${token}` }),
    },
  });
}

async function feed(query: string, token?: string) {
  const response = await request('GET', '/wall-feed' + query, token);
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toContain('no-store');
  return wallFeedResponse.parse(response.json());
}

async function sign(
  wallId: string,
  userId: string,
  id: number,
  position: number,
  daysAgo: number,
) {
  const autographId = fixtureId(8000 + id);
  const slot = await slotForWall(database, wallId, position);
  await database.db
    .insert(autographs)
    .values({ id: autographId, userId, source: 'canvas', status: 'ready' });
  await database.db.insert(placements).values({
    slotId: slot.id,
    userId,
    autographId,
    source: 'free_claim',
    startedAt: new Date(now - daysAgo * day),
  });
}

it('keeps discovery opt-in, allows idempotent follows, and keeps follows across profile renames', async () => {
  const profile = await wall(10);
  const archived = await wall(11, true, 0, 'archived');
  const draft = await wall(12, true, 0, 'draft');
  const disabled = await wall(13, true, 0);
  await database.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
    disabled.owner,
  ]);
  const follow = `/creators/${profile.slug}/follow`;
  const setting = `/me/walls/${profile.id}/discovery`;
  const owner = (await sessionService.createSession(profile.owner)).token;
  const draftOwner = (await sessionService.createSession(draft.owner)).token;

  expect((await feed('')).items).toEqual([]);
  expect((await request('GET', '/wall-feed?mode=following')).statusCode).toBe(
    401,
  );
  expect((await request('PUT', follow)).statusCode).toBe(401);
  expect((await request('PUT', follow, owner)).statusCode).toBe(403);
  expect((await request('PUT', setting, actorToken)).statusCode).toBe(404);
  expect(
    (await request('PUT', `/me/walls/${draft.id}/discovery`, draftOwner))
      .statusCode,
  ).toBe(404);
  expect((await request('PUT', setting, owner)).json()).toEqual({
    discoverable: true,
  });
  expect((await feed('')).items.map((item) => item.id)).toEqual([profile.id]);
  expect((await request('DELETE', setting, owner)).json()).toEqual({
    discoverable: false,
  });

  const responses = await Promise.all(
    Array.from({ length: 4 }, () => request('PUT', follow, actorToken)),
  );
  expect(responses.map((response) => response.json().state)).toEqual(
    Array(4).fill('following'),
  );
  expect(
    (await database.pool.query('SELECT 1 FROM creator_follows')).rowCount,
  ).toBe(1);
  expect((await feed('')).items).toEqual([]);
  expect(
    (await feed('?mode=following', actorToken)).items.map((item) => item.id),
  ).toEqual([profile.id]);

  await database.pool.query(
    'UPDATE creator_profiles SET slug=$1 WHERE creator_id=$2',
    ['renamed-creator', profile.creatorId],
  );
  const renamed = '/creators/renamed-creator/follow';
  expect((await request('GET', renamed, actorToken)).json()).toEqual({
    state: 'following',
  });
  await request('PUT', `/creators/${archived.slug}/follow`, actorToken);
  expect((await feed('?mode=following', actorToken)).items).toHaveLength(1);
  expect((await request('DELETE', renamed, actorToken)).json()).toEqual({
    state: 'not-following',
  });
  expect((await request('DELETE', renamed, actorToken)).json()).toEqual({
    state: 'not-following',
  });
  expect((await feed('?mode=following', actorToken)).items).toEqual([]);
});

it('ranks follows, personal placements and co-signers and pages through the score order', async () => {
  const followed = await wall(20);
  const signed = await wall(21);
  const related = await wall(22, true);
  const discovery = await wall(23, true, 0);
  const unlisted = await wall(24);
  await sign(signed.id, actor, 1, 0, 1);
  await sign(signed.id, signer, 2, 1, 1);
  await sign(related.id, signer, 3, 0, 0);
  await sign(unlisted.id, signer, 4, 0, 0);
  await request('PUT', `/creators/${followed.slug}/follow`, actorToken);

  const first = await feed('?limit=2', actorToken);
  expect(first.items.map(({ id, reason }) => [id, reason])).toEqual([
    [followed.id, 'following'],
    [signed.id, 'signed'],
  ]);
  expect(first.nextCursor).not.toBeNull();
  const cursor = encodeURIComponent(first.nextCursor!);
  const next = await feed(`?limit=2&cursor=${cursor}`, actorToken);
  expect(next.items.map(({ id, reason }) => [id, reason])).toEqual([
    [related.id, 'related'],
    [discovery.id, 'discovery'],
  ]);
  expect(next.nextCursor).toBeNull();
  expect(
    (await feed('', actorToken)).items.some((item) => item.id === unlisted.id),
  ).toBe(false);
  expect(
    (
      await request(
        'GET',
        `/wall-feed?mode=following&cursor=${cursor}`,
        actorToken,
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (await request('GET', '/wall-feed?cursor=invalid', actorToken)).statusCode,
  ).toBe(400);
});

it('sorts follows by public changes and excludes private avatar imports from activity', async () => {
  const older = await wall(30, false, 5);
  const newer = await wall(31, false, 2);
  const appearance = createPgAppearanceRepository(database.pool);
  for (const profile of [older, newer])
    await request('PUT', `/creators/${profile.slug}/follow`, actorToken);
  await appearance.saveProviderAvatar(
    older.owner,
    'data:image/jpeg;base64,cHJpdmF0ZQ==',
  );
  expect(
    (await feed('?mode=following', actorToken)).items.map((item) => item.id),
  ).toEqual([newer.id, older.id]);
  await sign(older.id, signer, 1, 0, 1);
  const [first] = (await feed('?mode=following', actorToken)).items;
  expect(first).toMatchObject({
    id: older.id,
    occupiedCount: 1,
    activityKind: 'placement',
  });
  await appearance.save(
    newer.owner,
    {
      title: 'New public title',
      description: '',
      avatarDataUrl: null,
      coverDataUrl: null,
    },
    'none',
  );
  const [updated] = (await feed('?mode=following', actorToken)).items;
  expect(updated).toMatchObject({
    id: newer.id,
    title: 'New public title',
    activityKind: 'wall',
  });
});

it('preserves public activity across discovery changes and retries while tracking real Wall changes', async () => {
  const older = await wall(40, false, 5);
  const newer = await wall(41, false, 2);
  const setting = `/me/walls/${older.id}/discovery`;
  const ownerToken = (await sessionService.createSession(older.owner)).token;
  for (const profile of [older, newer])
    await request('PUT', `/creators/${profile.slug}/follow`, actorToken);
  await sign(older.id, signer, 1, 0, 3);

  const baseline = await feed('?mode=following', actorToken);
  expect(baseline.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  expect(baseline.items[1]?.activityKind).toBe('placement');
  const wallTimestamp = async () =>
    (
      await database.pool.query<{ updated_at: Date }>(
        'SELECT updated_at FROM walls WHERE id=$1',
        [older.id],
      )
    ).rows[0]!.updated_at;
  const originalTimestamp = await wallTimestamp();

  for (const method of ['PUT', 'PUT', 'DELETE', 'DELETE'] as const) {
    expect((await request(method, setting, ownerToken)).json()).toEqual({
      discoverable: method === 'PUT',
    });
    expect(await wallTimestamp()).toEqual(originalTimestamp);
    expect(await feed('?mode=following', actorToken)).toEqual(baseline);
    expect((await feed('')).items.map((item) => item.id)).toEqual(
      method === 'PUT' ? [older.id] : [],
    );
  }

  const wallService = new WallService(createPgWallRepository(database.pool));
  await wallService.transitionWall(older.owner, older.id, 'pause');
  expect((await wallTimestamp()).getTime()).toBeGreaterThan(
    originalTimestamp.getTime(),
  );
  const changed = await feed('?mode=following', actorToken);
  expect(changed.items.map((item) => item.id)).toEqual([older.id, newer.id]);
  expect(changed.items[0]).toMatchObject({
    id: older.id,
    status: 'paused',
    activityKind: 'wall',
  });
  expect(new Date(changed.items[0]!.activityAt).getTime()).toBeGreaterThan(
    new Date(baseline.items[1]!.activityAt).getTime(),
  );
});
