import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { registerCommunityCubeRoutes } from '../../apps/api/src/community-cube';
import { SessionService } from '../../packages/auth/src/index';
import {
  createDatabase,
  createPgCommunityCubeRepository,
  createPgSessionRepository,
} from '../../packages/db/src/index';
import { acceptedSession, buildAcceptedApi } from './first-use-fixtures';

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/autograph_test' ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
) {
  throw new Error('Community cube tests require isolated local PostgreSQL');
}
const database = createDatabase(url);
const sessions = new SessionService(
  createPgSessionRepository(database.pool),
  1209600,
);
const origin = 'http://127.0.0.1:3000';
const apiConfig = {
  appEnvironment: 'test' as const,
  sessionTtlSeconds: 1209600,
  trustedWebOrigins: [origin],
};
const repository = createPgCommunityCubeRepository(database.pool);
const storage = new Map<string, Buffer>();
const storageReads: { key: string; maxBytes: number }[] = [];
let beforeStorageRead: (() => Promise<void>) | undefined;
const app = buildAcceptedApi(database, sessions, apiConfig);
const paused = buildAcceptedApi(database, sessions, apiConfig);
const mediaStorage = {
  async getPrivateObject(key: string, maxBytes: number) {
    storageReads.push({ key, maxBytes });
    await beforeStorageRead?.();
    const bytes = storage.get(key);
    if (!bytes) throw new Error('Missing fixture bytes');
    return bytes;
  },
};
registerCommunityCubeRoutes(app, repository, mediaStorage, true);
registerCommunityCubeRoutes(paused, repository, mediaStorage, false);

let moderatorId: string;
let cleaned: Buffer;
let original: Buffer;

beforeAll(async () => {
  await Promise.all([app.ready(), paused.ready()]);
  moderatorId = randomUUID();
  await database.pool.query('INSERT INTO users (id) VALUES ($1)', [
    moderatorId,
  ]);
  const png = (background: string) =>
    sharp({ create: { width: 2, height: 2, channels: 4, background } })
      .png()
      .toBuffer();
  [cleaned, original] = await Promise.all([png('#102030'), png('#ab1234')]);
});

beforeEach(async () => {
  await database.pool.query('TRUNCATE community_cube_placements');
  await database.pool.query('UPDATE community_cube_state SET generation = 1');
  storage.clear();
  storageReads.length = 0;
  beforeStorageRead = undefined;
});

afterAll(async () => {
  await Promise.all([app.close(), paused.close()]);
  await database.close();
});

async function person(accepted = true) {
  const id = randomUUID();
  await database.pool.query('INSERT INTO users (id) VALUES ($1)', [id]);
  const { token } = accepted
    ? await acceptedSession(sessions, database, id)
    : await sessions.createSession(id);
  return { id, headers: { cookie: `da_session=${token}`, origin } };
}

async function autograph(
  userId: string,
  reviewed = true,
  verifiedSizeBytes = cleaned.length,
) {
  const id = randomUUID();
  await database.pool.query(
    `INSERT INTO autographs (id, user_id, source, status)
     VALUES ($1, $2, 'canvas', $3)`,
    [id, userId, reviewed ? 'ready' : 'awaiting_moderation'],
  );
  const originalKey = `autographs/${id}/original/test-private`;
  const cleanedKey = `autographs/${id}/cleaned/test-cleaned.png`;
  storage.set(originalKey, original);
  storage.set(cleanedKey, cleaned);
  await database.pool.query(
    `INSERT INTO autograph_assets
       (autograph_id, role, status, storage_key, expected_content_type,
        expected_size_bytes, verified_size_bytes, upload_expires_at, uploaded_at)
     VALUES ($1, 'original', 'uploaded', $2, 'image/png', $3, $3, now() + interval '1 hour', now())`,
    [id, originalKey, original.length],
  );
  const assetId = randomUUID();
  await database.pool.query(
    `INSERT INTO autograph_assets
       (id, autograph_id, role, status, storage_key, actual_content_type,
        verified_size_bytes, width, height, uploaded_at)
     VALUES ($1, $2, 'cleaned', 'uploaded', $3, 'image/png', $4, 2, 2, now())`,
    [assetId, id, cleanedKey, verifiedSizeBytes],
  );
  const approvalId = randomUUID();
  await database.pool.query(
    `INSERT INTO autograph_user_approvals (id, autograph_id, user_id, cleaned_asset_id)
     VALUES ($1, $2, $3, $4)`,
    [approvalId, id, userId, assetId],
  );
  if (reviewed) {
    await database.pool.query(
      `INSERT INTO autograph_moderation_decisions
         (autograph_id, moderator_user_id, user_approval_id, cleaned_asset_id, decision)
       VALUES ($1, $2, $3, $4, 'approved')`,
      [id, moderatorId, approvalId, assetId],
    );
  }
  return { id, cleanedKey };
}

function request(autographId: string, cell: number, generation = 1) {
  return { autographId, cell, generation, requestId: randomUUID() };
}

function pauseStorageReads() {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeStorageRead = () => blocked;
  return release;
}

function place(
  body: ReturnType<typeof request>,
  actor?: Awaited<ReturnType<typeof person>>,
) {
  return app.inject({
    method: 'POST',
    url: '/me/community-cube',
    headers: actor?.headers,
    payload: body,
  });
}

it('arbitrates concurrent claims and does not resurrect a withdrawn request', async () => {
  const [a, b] = await Promise.all([person(), person()]);
  const [first, second] = await Promise.all([autograph(a.id), autograph(b.id)]);
  const contenders = [a, b];
  const payloads = [request(first.id, 7), request(second.id, 7)];
  const outcomes = await Promise.all([
    place(payloads[0]!, a),
    place(payloads[1]!, b),
  ]);
  const won = outcomes.findIndex((result) => result.statusCode === 201);
  expect(won).not.toBe(-1);
  const winner = contenders[won]!;
  const loser = contenders[1 - won]!;
  expect(outcomes[1 - won]?.json()).toEqual({
    error: { code: 'CUBE_CELL_OCCUPIED' },
  });
  const actual = outcomes[won]!.json();
  const deletedPath = `/me/community-cube/${actual.placement.id}`;
  const replay = await place(payloads[won]!, winner);
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toEqual(actual);
  expect((await place({ ...payloads[won]!, cell: 8 }, winner)).json()).toEqual({
    error: { code: 'CUBE_REQUEST_CONFLICT' },
  });
  expect(
    (await place(request(actual.placement.autographId, 8), winner)).json(),
  ).toEqual({
    error: { code: 'CUBE_ALREADY_PLACED' },
  });
  expect(
    (
      await app.inject({
        method: 'DELETE',
        url: deletedPath,
        headers: loser.headers,
      })
    ).statusCode,
  ).toBe(404);
  for (const runtime of [paused, app]) {
    expect(
      (
        await runtime.inject({
          method: 'DELETE',
          url: deletedPath,
          headers: winner.headers,
        })
      ).statusCode,
    ).toBe(204);
  }
  expect((await place(payloads[won]!, winner)).json()).toEqual({
    error: { code: 'CUBE_REQUEST_CONFLICT' },
  });
  expect((await place(payloads[1 - won]!, loser)).statusCode).toBe(201);
});

it('requires current first-use evidence and owned moderated artwork, and serves only the cleaned bytes', async () => {
  const [owner, other, unaccepted] = await Promise.all([
    person(),
    person(),
    person(false),
  ]);
  const ready = await autograph(owner.id);
  const reviewPending = await autograph(owner.id, false);
  const ownsButUnaccepted = await autograph(unaccepted.id);
  const payload = request(ready.id, 18);
  expect((await place(payload)).statusCode).toBe(401);
  expect(
    (await place(request(ownsButUnaccepted.id, 18), unaccepted)).json(),
  ).toEqual({
    error: { code: 'FIRST_USE_REQUIRED' },
  });
  for (const response of [
    await place(payload, other),
    await place(request(reviewPending.id, 18), owner),
  ]) {
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'AUTOGRAPH_NOT_AVAILABLE' },
    });
  }
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/me/community-cube',
        headers: { ...owner.headers, origin: 'https://other.example' },
        payload,
      })
    ).statusCode,
  ).toBe(403);

  const placed = await place(payload, owner);
  expect(placed.statusCode).toBe(201);
  expect(
    (
      await app.inject({ url: '/me/community-cube', headers: owner.headers })
    ).json(),
  ).toEqual(placed.json());
  expect(
    (
      await app.inject({ url: '/me/community-cube', headers: other.headers })
    ).json(),
  ).toEqual({ placement: null });
  expect((await app.inject({ url: '/community-cube' })).json()).toEqual({
    generation: 1,
    capacity: 24,
    occupiedCells: [18],
  });
  const media = await app.inject({ url: '/community-cube/cells/18/media' });
  expect(media.statusCode).toBe(200);
  expect(media.headers['cache-control']).toBe('no-store');
  expect(media.headers['content-type']).toBe('image/png');
  expect(media.rawPayload).toEqual(cleaned);
  expect(storageReads).toEqual([
    { key: ready.cleanedKey, maxBytes: cleaned.length },
  ]);
  expect((await paused.inject({ url: '/community-cube' })).statusCode).toBe(
    404,
  );
  expect(
    (await paused.inject({ url: '/community-cube/cells/18/media' })).statusCode,
  ).toBe(404);
  expect(
    (
      await paused.inject({ url: '/me/community-cube', headers: owner.headers })
    ).json(),
  ).toEqual(placed.json());

  const { placement } = placed.json();
  beforeStorageRead = () =>
    repository.withdraw(owner.id, placement.id).then(() => {});
  expect(
    (await app.inject({ url: '/community-cube/cells/18/media' })).statusCode,
  ).toBe(404);
  expect(
    (await app.inject({ url: '/community-cube' })).json().occupiedCells,
  ).toEqual([]);
});

it('allows media reads during an account update and revalidates after it commits', async () => {
  const owner = await person();
  const ready = await autograph(owner.id);
  expect((await place(request(ready.id, 4), owner)).statusCode).toBe(201);

  const editor = await database.pool.connect();
  const release = pauseStorageReads();
  const url = '/community-cube/cells/4/media';
  try {
    await editor.query('BEGIN');
    await editor.query('UPDATE users SET status = $1 WHERE id = $2', [
      'disabled',
      owner.id,
    ]);
    const response = app.inject({ url }).then((result) => result);
    try {
      await vi.waitFor(() => expect(storageReads).toHaveLength(1), {
        timeout: 3000,
      });
      await editor.query('COMMIT');
    } finally {
      release();
      await editor.query('ROLLBACK');
      await response;
    }
    expect((await response).statusCode).toBe(404);
  } finally {
    editor.release();
  }
});

it('rejects excess verified media bytes before storage and frees the budget on failure', async () => {
  const owner = await person();
  const ready = await autograph(owner.id, true, 10 * 1024 * 1024);
  expect((await place(request(ready.id, 5), owner)).statusCode).toBe(201);

  const release = pauseStorageReads();
  const url = '/community-cube/cells/5/media';
  const active = Promise.all(
    Array.from({ length: 4 }, () => app.inject({ url })),
  );
  try {
    await vi.waitFor(() => expect(storageReads).toHaveLength(4), {
      timeout: 3000,
    });
    const excess = app.inject({ method: 'HEAD', url }).then((result) => result);
    try {
      const busy = await Promise.race([
        excess,
        delay(3000, undefined, { ref: false }),
      ]);
      expect(busy?.statusCode).toBe(503);
      expect(busy?.headers['retry-after']).toBe('1');
      expect(busy?.headers['cache-control']).toBe('no-store');
      expect(storageReads).toHaveLength(4);
    } finally {
      release();
      await excess;
    }
  } finally {
    release();
    // The test storage returns fewer bytes than the verified size.
    expect((await active).map((response) => response.statusCode)).toEqual([
      404, 404, 404, 404,
    ]);
  }
  expect((await app.inject({ url })).statusCode).toBe(404);
  expect(storageReads).toHaveLength(5);
});

it('grows only at full capacity, rejects stale choices, and keeps prior cells after withdrawal', async () => {
  const [owner, other] = await Promise.all([person(), person()]);
  const [ready, otherReady] = await Promise.all([
    autograph(owner.id),
    autograph(other.id),
  ]);
  await database.pool.query(`
    WITH members AS (
      INSERT INTO users (id) SELECT gen_random_uuid() FROM generate_series(1, 23)
      RETURNING id
    ), drawings AS (
      INSERT INTO autographs (user_id, source) SELECT id, 'canvas'::autograph_source FROM members
      RETURNING id, user_id
    )
    INSERT INTO community_cube_placements (user_id, autograph_id, request_id, generation, cell)
      SELECT user_id, id, gen_random_uuid(), 1, (row_number() OVER (ORDER BY id))::integer
      FROM drawings
  `);
  const requestBody = request(ready.id, 24);
  const result = await place(requestBody, owner);
  expect(result.statusCode).toBe(201);
  const { placement } = result.json();
  expect((await place(requestBody, owner)).json()).toEqual({ placement });
  expect((await repository.snapshot()).generation).toBe(2);
  expect((await place(request(otherReady.id, 25), other)).json()).toEqual({
    error: { code: 'CUBE_GENERATION_CHANGED' },
  });
  expect((await place(request(otherReady.id, 25, 2), other)).statusCode).toBe(
    201,
  );
  await repository.withdraw(owner.id, placement.id);
  const snapshot = await repository.snapshot();
  expect(snapshot.generation).toBe(2);
  expect(snapshot.capacity).toBe(144);
  expect(snapshot.occupiedCells).not.toContain(24);
  expect(snapshot.occupiedCells).toContain(25);
});
