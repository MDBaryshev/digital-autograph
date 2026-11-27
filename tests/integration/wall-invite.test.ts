import { afterAll, beforeEach, expect, it } from 'vitest';
import {
  createDatabase,
  createPgSessionRepository,
  createPgWallRepository,
} from '../../packages/db/src/index';
import {
  users,
  creators,
  creatorProfiles,
  walls,
} from '../../packages/db/src/schema';
import { SessionService } from '../../packages/auth/src/index';
import { WallService } from '../../packages/walls/src/index';
import { buildApi } from '../../apps/api/src/app';
import { userFixture, creatorFixture, wallFixture } from './fixtures';
import sharp from 'sharp';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('Isolated test DB required');
const db = createDatabase(url);
const service = new WallService(createPgWallRepository(db.pool));
const app = buildApi(
  db,
  new SessionService(createPgSessionRepository(db.pool), 1209600),
  {
    appEnvironment: 'test',
    sessionTtlSeconds: 1209600,
    trustedWebOrigins: ['http://127.0.0.1:3000'],
  },
  service,
);
const owner = userFixture(1).id!,
  creator = creatorFixture(1, owner),
  wall = wallFixture(creator.id!, 1);
beforeEach(async () => {
  await db.pool.query('TRUNCATE users CASCADE');
  await db.db.insert(users).values(userFixture(1));
  await db.db.insert(creators).values(creator);
  await db.db.insert(creatorProfiles).values({
    creatorId: creator.id!,
    slug: 'invite-test',
    displayName: 'Invite Owner',
  });
  await db.db.insert(walls).values({ ...wall, status: 'live' });
});
afterAll(async () => {
  await app.close();
  await db.close();
});
it('serves a public ten-place card before claims exist and hides nonpublic Walls', async () => {
  const path = '/walls/' + wall.id + '/invite-card';
  const response = await app.inject(path + '?locale=ru');
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toBe('image/png');
  expect(response.headers['cache-control']).toBe('no-store');
  expect((await sharp(response.rawPayload).metadata()).width).toBe(1200);
  expect((await app.inject(path + '?locale=invalid')).statusCode).toBe(400);
  for (const state of ['draft', 'archived']) {
    await db.pool.query('UPDATE walls SET status=$1 WHERE id=$2', [
      state,
      wall.id,
    ]);
    expect((await app.inject(path)).statusCode).toBe(404);
  }
});
