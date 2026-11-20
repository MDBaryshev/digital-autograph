import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApi } from '../../apps/api/src/app';
import { registerWallDesignRoutes } from '../../apps/api/src/walls/design-http';
import { SessionService } from '../../packages/auth/src/index';
import {
  createDatabase,
  createPgSessionRepository,
  createPgWallDesignRepository,
  createPgWallRepository,
} from '../../packages/db/src/index';
import {
  creators,
  creatorProfiles,
  userRoles,
  users,
  walls,
} from '../../packages/db/src/schema';
import { emptyWallDesign } from '../../packages/domain/src/index';
import { creatorFixture, userFixture, wallFixture } from './fixtures';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('isolated test database required');
const db = createDatabase(url);
const origin = 'http://127.0.0.1:3000';
const sessions = new SessionService(
  createPgSessionRepository(db.pool),
  1209600,
);
const app = buildApi(db, sessions, {
  appEnvironment: 'test',
  sessionTtlSeconds: 1209600,
  trustedWebOrigins: [origin],
});
registerWallDesignRoutes(app, createPgWallDesignRepository(db.pool), true);
const admin = userFixture(81);
const author = userFixture(82);
const other = userFixture(83);
const creator = creatorFixture(82, author.id!);
const otherCreator = creatorFixture(83, other.id!);
const wall = wallFixture(creator.id!, 82);
const otherWall = wallFixture(otherCreator.id!, 83);
const designUrl = `/me/walls/${wall.id}/design`;
const templateUrl = '/admin/wall-design-templates';
const headers = new Map<string, { cookie: string; origin: string }>();

beforeAll(async () => {
  await db.pool.query('TRUNCATE users CASCADE');
  await db.db.insert(users).values([admin, author, other]);
  await db.db.insert(userRoles).values([
    { userId: admin.id!, role: 'admin' },
    { userId: other.id!, role: 'moderator' },
  ]);
  await db.db.insert(creators).values([creator, otherCreator]);
  await db.db.insert(creatorProfiles).values([
    {
      creatorId: creator.id!,
      slug: 'studio-author',
      displayName: 'Studio Author',
    },
    {
      creatorId: otherCreator.id!,
      slug: 'other-author',
      displayName: 'Other Author',
    },
  ]);
  await db.db.insert(walls).values([
    { ...wall, status: 'live' },
    { ...otherWall, status: 'live' },
  ]);
  for (const user of [admin, author, other]) {
    const { token } = await sessions.createSession(user.id!);
    headers.set(user.id!, { cookie: `da_session=${token}`, origin });
  }
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.close();
});

it('imports only for the named author and publishes only the author’s explicit save', async () => {
  const design = {
    ...emptyWallDesign,
    title: 'Tour Wall',
    style: {
      ...emptyWallDesign.style,
      theme: 'poster',
      event: 'Encore',
      colors: {
        surface: '#442288',
        cube: '#ee6699',
        frame: '#2b92a2',
        ink: '#042412',
      },
      finish: 'glass',
      placeFinishes: { '1': 'satin-glass', '10': 'smoked-glass' },
      pattern: 'spotlight',
    },
  };
  const payload = { author: 'studio-author', design };
  const moderator = await app.inject({
    method: 'POST',
    url: templateUrl,
    headers: headers.get(other.id!),
    payload,
  });
  expect(moderator.statusCode).toBe(403);
  const created = await app.inject({
    method: 'POST',
    url: templateUrl,
    headers: headers.get(admin.id!),
    payload,
  });
  expect(created.statusCode).toBe(201);
  const invalidPalette = await app.inject({
    method: 'POST',
    url: templateUrl,
    headers: headers.get(admin.id!),
    payload: {
      ...payload,
      design: {
        ...design,
        style: { ...design.style, colors: { ink: 'url(https://example.com)' } },
      },
    },
  });
  expect(invalidPalette.statusCode).toBe(400);
  const invalidPlace = await app.inject({
    method: 'POST',
    url: templateUrl,
    headers: headers.get(admin.id!),
    payload: {
      ...payload,
      design: {
        ...design,
        style: { ...design.style, placeFinishes: { '11': 'enamel' } },
      },
    },
  });
  expect(invalidPlace.statusCode).toBe(400);
  const { token } = created.json<{ token: string }>();
  const preview = (userId: string, targetId: string) =>
    app.inject({
      method: 'POST',
      url: `/me/walls/${targetId}/design/import-preview`,
      headers: headers.get(userId),
      payload: { token },
    });
  expect((await preview(other.id!, otherWall.id!)).statusCode).toBe(404);
  expect((await preview(admin.id!, wall.id!)).statusCode).toBe(404);
  expect((await preview(author.id!, otherWall.id!)).statusCode).toBe(404);
  const imported = await preview(author.id!, wall.id!);
  expect(imported.statusCode).toBe(200);
  expect(imported.headers['cache-control']).toBe('no-store');
  expect(imported.json()).toEqual({ design });
  const publicWalls = createPgWallRepository(db.pool);
  expect(
    (await publicWalls.findPublicWall(wall.id!))?.appearance?.title,
  ).not.toBe(design.title);
  const save = (userId: string, title: string) =>
    app.inject({
      method: 'PUT',
      url: designUrl,
      headers: headers.get(userId),
      payload: { design: { ...design, title }, revision: null },
    });
  expect((await save(admin.id!, 'Unauthorized')).statusCode).toBe(404);
  const competing = await Promise.all([
    save(author.id!, 'Tour A'),
    save(author.id!, 'Tour B'),
  ]);
  expect(competing.map((result) => result.statusCode).sort()).toEqual([
    200, 409,
  ]);
  const saved = competing.find((result) => result.statusCode === 200)!.json();
  expect(saved.revision).toEqual(expect.any(String));
  const publicWall = await publicWalls.findPublicWall(wall.id!);
  expect(publicWall?.appearance).toEqual(saved.design);
  expect(publicWall?.slotCount).toBe(10);
  const stored = await db.pool.query(
    'SELECT token_hash FROM wall_design_templates',
  );
  expect(stored.rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(stored.rows[0]?.token_hash).not.toBe(token);
  await db.pool.query('UPDATE wall_design_templates SET expires_at = now()');
  expect((await preview(author.id!, wall.id!)).statusCode).toBe(404);
});
