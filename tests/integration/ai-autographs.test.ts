import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  createDatabase,
  migrate,
  createPgAiAutographRepository,
  aiFingerprint,
} from '../../packages/db/src/index';
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/autograph_test' ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname)
)
  throw Error('Isolated test database required');
const control = createDatabase(url),
  target = new URL(url);
const name = 'ai_' + randomUUID().replaceAll('-', '');
target.pathname = '/' + name;
const db = createDatabase(target.href),
  repo = createPgAiAutographRepository(db.pool);
const owner = randomUUID(),
  other = randomUUID();
let created = false;
beforeAll(async () => {
  await control.pool.query(`CREATE DATABASE ${name}`);
  created = true;
  await migrate(db.db, { migrationsFolder: 'packages/db/drizzle' });
  await db.pool.query('INSERT INTO users(id) VALUES($1),($2)', [owner, other]);
});
afterAll(async () => {
  await db.close();
  if (created) await control.pool.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await control.close();
});
it('serializes duplicate admissions across pools, charges failures, and enforces the daily quota', async () => {
  const second = createDatabase(target.href);
  const repo2 = createPgAiAutographRepository(second.pool);
  const id = randomUUID();
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? repo : repo2).claim(
          owner,
          id,
          'generation',
          aiFingerprint('nick'),
          'test/image',
        ),
      ),
    );
    expect(
      results.filter((r) => r.status === 'fulfilled' && r.value.fresh),
    ).toHaveLength(1);
    await repo.finish(owner, id, { error: 'unknown-provider-outcome' }, true);
    await expect(
      repo.claim(owner, id, 'generation', aiFingerprint('nick'), 'test/image'),
    ).rejects.toThrow('AI_REQUEST_UNAVAILABLE');
    for (let i = 0; i < 2; i++)
      await repo.claim(
        owner,
        randomUUID(),
        'generation',
        aiFingerprint('nick'),
        'test/image',
      );
    await expect(
      repo.claim(
        owner,
        randomUUID(),
        'generation',
        aiFingerprint('nick'),
        'test/image',
      ),
    ).rejects.toThrow('AI_QUOTA_EXCEEDED');
    expect(await repo.read(other, id)).toBeNull();
    await expect(
      repo.claim(
        owner,
        id,
        'generation',
        aiFingerprint('changed'),
        'test/image',
      ),
    ).rejects.toThrow('AI_REQUEST_CONFLICT');
  } finally {
    await second.close();
  }
});
it('replays only the owner result and keeps moderation evidence immutable', async () => {
  const id = randomUUID();
  await repo.claim(
    other,
    id,
    'generation',
    aiFingerprint('nick'),
    'test/image',
  );
  await repo.finish(other, id, { images: ['synthetic'] });
  expect(
    await repo.claim(
      other,
      id,
      'generation',
      aiFingerprint('nick'),
      'test/image',
    ),
  ).toEqual({ fresh: false, result: { images: ['synthetic'] } });
  const op = 'moderation:' + randomUUID();
  await repo.claim(other, op, 'moderation', aiFingerprint(op), 'test/vision');
  await repo.finish(other, op, { decision: 'manual', confidence: 0.3 });
  await expect(
    db.pool.query(
      'UPDATE ai_autograph_requests SET result=$1 WHERE user_id=$2 AND operation=$3',
      [{}, other, op],
    ),
  ).rejects.toThrow('immutable');
  await expect(
    repo.claim(owner, op, 'moderation', aiFingerprint(op), 'test/vision'),
  ).rejects.toThrow();
});

it('retains moderation admission and evidence against deletion in every state', async () => {
  for (const userId of [owner, other]) {
    for (const state of ['pending', 'completed', 'failed'] as const) {
      const op = 'moderation:' + randomUUID();
      await repo.claim(
        userId,
        op,
        'moderation',
        aiFingerprint(op),
        'test/vision',
      );
      if (state !== 'pending')
        await repo.finish(
          userId,
          op,
          { decision: 'manual' },
          state === 'failed',
        );
      await expect(
        db.pool.query(
          'DELETE FROM ai_autograph_requests WHERE user_id=$1 AND operation=$2',
          [userId, op],
        ),
      ).rejects.toThrow('immutable');
      expect(await repo.read(userId, op)).toMatchObject({ state });
      await expect(
        repo.claim(
          userId === owner ? other : owner,
          op,
          'moderation',
          aiFingerprint(op),
          'test/vision',
        ),
      ).rejects.toThrow();
    }
  }
});
