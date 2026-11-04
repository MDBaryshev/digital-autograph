import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  createDatabase,
  createPgAppearanceRepository,
  createPgWallRepository,
} from '../../packages/db/src/index';
import { SessionService } from '../../packages/auth/src/index';
import { createPgSessionRepository } from '../../packages/db/src/index';
import { buildApi } from '../../apps/api/src/app';
import { registerAppearance } from '../../apps/api/src/appearance';
import { userFixture, creatorFixture, wallFixture } from './fixtures';
import {
  users,
  creators,
  walls,
  creatorProfiles,
} from '../../packages/db/src/schema';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('isolated test database required');
const db = createDatabase(url);
const repo = createPgAppearanceRepository(db.pool);
const sessions = new SessionService(
  createPgSessionRepository(db.pool),
  1209600,
);
const config = {
  appEnvironment: 'test' as const,
  sessionTtlSeconds: 1209600,
  trustedWebOrigins: ['http://127.0.0.1:3000'],
};
const app = buildApi(db, sessions, config);
registerAppearance(app, repo, true);
let token: string;
const owner = userFixture(1).id!,
  other = userFixture(2).id!;
let image: string;
beforeAll(async () => {
  await app.ready();
  image =
    'data:image/png;base64,' +
    (
      await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#def' },
      })
        .png()
        .toBuffer()
    ).toString('base64');
});
beforeEach(async () => {
  await db.pool.query('TRUNCATE users CASCADE');
  await db.db.insert(users).values([userFixture(1), userFixture(2)]);
  token = (await sessions.createSession(owner)).token;
});
afterAll(async () => {
  await app.close();
  await db.close();
});
const save = (body: Record<string, unknown>) =>
  app.inject({
    method: 'PUT',
    url: '/me/appearance',
    headers: { cookie: 'da_session=' + token, origin: 'http://127.0.0.1:3000' },
    payload: body,
  });
const input = () => ({
  title: 'Моя десятка',
  description: 'Только десять мест',
  avatarSource: 'upload',
  avatarDataUrl: image,
  coverDataUrl: image,
});
it('saves owner appearance and publishes only normalized fields without the private provider candidate', async () => {
  const creator = creatorFixture(1, owner);
  await db.db.insert(creators).values(creator);
  await db.db.insert(creatorProfiles).values({
    creatorId: creator.id!,
    slug: 'appearance-owner',
    displayName: 'Owner',
  });
  const wall = wallFixture(creator.id!, 1);
  await db.db.insert(walls).values({ ...wall, status: 'live' });
  await repo.saveProviderAvatar(owner, 'data:image/jpeg;base64,cHJpdmF0ZQ==');
  expect((await save(input())).statusCode).toBe(200);
  await expect(
    db.pool.query(
      'UPDATE account_appearance SET avatar_source=NULL WHERE user_id=$1',
      [owner],
    ),
  ).rejects.toMatchObject({ code: '23514' });
  const stored = await repo.read(owner);
  expect(stored.avatarDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect((await repo.read(other)).avatarDataUrl).toBeNull();
  const publicWall = await createPgWallRepository(db.pool).findPublicWall(
    wall.id!,
  );
  expect(publicWall?.appearance).toMatchObject({
    title: 'Моя десятка',
    description: 'Только десять мест',
    avatarDataUrl: stored.avatarDataUrl,
  });
  expect(JSON.stringify(publicWall)).not.toContain('providerAvatar');
  expect(JSON.stringify(publicWall)).not.toContain('cHJpdmF0ZQ==');
  expect((await save({ ...input(), userId: other })).statusCode).toBe(400);
  await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
    owner,
  ]);
  expect((await save(input())).statusCode).toBe(401);
});
it('keeps imported photos private and never overwrites a saved avatar on subsequent login', async () => {
  expect((await save(input())).statusCode).toBe(200);
  const previous = (await repo.read(owner)).avatarDataUrl;
  const next = 'data:image/jpeg;base64,bmV3';
  await repo.saveProviderAvatar(owner, next);
  expect((await repo.read(owner)).avatarDataUrl).toBe(previous);
  expect(
    (
      await save({
        ...input(),
        avatarSource: 'provider',
        avatarDataUrl: null,
        coverDataUrl: null,
      })
    ).statusCode,
  ).toBe(200);
  expect((await repo.read(owner)).avatarDataUrl).toBe(next);
  expect(
    (await save({ ...input(), avatarSource: 'none', avatarDataUrl: null }))
      .statusCode,
  ).toBe(200);
  expect((await repo.read(owner)).avatarDataUrl).toBeNull();
});
it('rejects invalid uploads, anonymous mutation and closed publication without changing saved values', async () => {
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/me/appearance',
        payload: input(),
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await save({ ...input(), avatarDataUrl: 'https://example.com/image.png' }))
      .statusCode,
  ).toBe(400);
  expect((await save({ ...input(), title: 'x'.repeat(101) })).statusCode).toBe(
    400,
  );
  const closed = buildApi(db, sessions, config);
  registerAppearance(closed, repo, false);
  try {
    const response = await closed.inject({
      method: 'PUT',
      url: '/me/appearance',
      headers: {
        cookie: 'da_session=' + token,
        origin: 'http://127.0.0.1:3000',
      },
      payload: input(),
    });
    expect(response.statusCode).toBe(409);
    expect((await repo.read(owner)).title).toBe('');
  } finally {
    await closed.close();
  }
});
