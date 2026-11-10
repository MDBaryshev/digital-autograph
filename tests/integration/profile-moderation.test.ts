import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  createDatabase,
  createPgAccountWorkspaceRepository,
  createPgAppearanceRepository,
  createPgProfileModerationRepository,
  createPgSessionRepository,
  createPgTelegramProfileRepository,
  createPgWallRepository,
} from '../../packages/db/src/index';
import { WallService } from '../../packages/walls/src/index';
import { SessionService } from '../../packages/auth/src/index';
import { buildApi } from '../../apps/api/src/app';
import { registerAccountWorkspace } from '../../apps/api/src/account-workspace';
import { registerAppearance } from '../../apps/api/src/appearance';
import { registerProfileModeration } from '../../apps/api/src/profile-moderation';
import { screenNextTelegramProfile } from '../../apps/api/src/telegram-profile-screening';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/autograph_test')
  throw Error('Isolated test database required');
const db = createDatabase(url);
const repository = createPgProfileModerationRepository(db.pool);
const telegram = createPgTelegramProfileRepository(db.pool);
const appearance = createPgAppearanceRepository(db.pool);
const sessions = new SessionService(createPgSessionRepository(db.pool), 3600);
const config = {
  appEnvironment: 'test' as const,
  sessionTtlSeconds: 3600,
  trustedWebOrigins: ['http://127.0.0.1:3000'],
};
const app = buildApi(
  db,
  sessions,
  config,
  undefined,
  undefined,
  new WallService(createPgWallRepository(db.pool)),
);
registerAccountWorkspace(
  app,
  createPgAccountWorkspaceRepository(db.pool),
  true,
);
registerAppearance(app, appearance, true);
registerProfileModeration(app, repository, true);
const owner = randomUUID(),
  mod = randomUUID(),
  another = randomUUID();
const tokens: Record<string, string> = {};
const headers = (actor: string) => ({
  cookie: 'da_session=' + tokens[actor],
  origin: 'http://127.0.0.1:3000',
});
const submit = (name: string, metadata = {}) =>
  app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(owner),
    payload: { displayName: name, slug: 'review-owner', ...metadata },
  });
const decide = (
  id: string,
  decision: 'approved' | 'rejected' = 'approved',
  actor = mod,
) =>
  app.inject({
    method: 'POST',
    url: `/moderation/profiles/${id}/decision`,
    headers: headers(actor),
    payload:
      decision === 'approved'
        ? { decision }
        : { decision, reasonCode: 'SEXUAL_CONTENT' },
  });
let image: string;
beforeAll(async () => {
  await app.ready();
  image =
    'data:image/jpeg;base64,' +
    (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#def' },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64');
});
beforeEach(async () => {
  await db.pool.query('TRUNCATE users CASCADE');
  await db.pool.query('INSERT INTO users(id) VALUES($1),($2),($3)', [
    owner,
    mod,
    another,
  ]);
  await db.pool.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'moderator'),($2,'admin')",
    [mod, another],
  );
  for (const id of [owner, mod, another])
    tokens[id] = (await sessions.createSession(id)).token;
});
afterAll(async () => {
  await app.close();
  await db.close();
});

it('keeps the Telegram avatar private until it clears and routes failed checks to a moderator', async () => {
  await telegram.enqueue(
    owner,
    { name: 'Example', username: 'example_42', avatarDataUrl: image },
    new Date(),
  );
  expect((await appearance.read(owner)).providerAvatarDataUrl).toBeNull();
  await screenNextTelegramProfile(telegram, 'synthetic/vision', async () => {
    throw Error('synthetic failure');
  });
  expect((await telegram.status(owner))?.status).toBe('pending');
  const queue = await app.inject({
    url: '/moderation/profiles',
    headers: headers(mod),
  });
  const id = queue.json().items[0].id;
  expect(
    (
      await app.inject({
        url: `/moderation/profiles/${id}/preview`,
        headers: headers(owner),
      })
    ).statusCode,
  ).toBe(403);
  const preview = await app.inject({
    url: `/moderation/profiles/${id}/preview`,
    headers: headers(mod),
  });
  expect(preview.json()).toMatchObject({
    kind: 'telegram',
    displayName: 'Example',
    slug: 'example_42',
    avatarDataUrl: image,
    assessment: 'unavailable',
  });
  expect((await appearance.read(owner)).providerAvatarDataUrl).toBeNull();
  expect(
    await repository.decide(mod, id, { decision: 'approved' }, false),
  ).toEqual({ id, status: 'approved' });
  expect((await appearance.read(owner)).providerAvatarDataUrl).toBe(image);
  expect((await appearance.read(owner)).avatarDataUrl).toBeNull();
  expect((await telegram.status(owner))?.status).toBe('approved');
});

it('drops stale model results, keeps one lease per check and recovers expired leases without redispatch', async () => {
  await telegram.enqueue(
    owner,
    { name: 'First', username: null, avatarDataUrl: image },
    new Date(1000),
  );
  const jobs = await Promise.all([telegram.claim(), telegram.claim()]);
  expect(jobs.filter(Boolean)).toHaveLength(1);
  const old = jobs.find(Boolean)!;
  await telegram.enqueue(
    owner,
    { name: 'New', username: null, avatarDataUrl: image },
    new Date(2000),
  );
  await telegram.enqueue(
    owner,
    { name: 'Out of order', username: null, avatarDataUrl: image },
    new Date(1500),
  );
  await telegram.finish(old, {
    kind: 'flagged',
    reason: 'SEXUAL_CONTENT',
    model: 'synthetic/vision',
  });
  expect(
    (await db.pool.query('SELECT id FROM profile_submissions')).rowCount,
  ).toBe(0);
  const next = (await telegram.claim())!;
  expect(next.profile.name).toBe('New');
  await db.pool.query(
    "UPDATE telegram_profile_checks SET lease_until=now()-interval '1 minute' WHERE id=$1",
    [next.id],
  );
  await screenNextTelegramProfile(telegram, 'synthetic/vision', async () => {
    throw Error('The expired lease must not call the model');
  });
  const rows = (
    await db.pool.query('SELECT display_name,kind FROM profile_submissions')
  ).rows;
  expect(rows).toEqual([{ display_name: 'New', kind: 'telegram' }]);
  expect(
    (
      await db.pool.query(
        'SELECT model,assessment,display_name,avatar_data_url FROM telegram_profile_checks WHERE id=$1',
        [next.id],
      )
    ).rows[0],
  ).toEqual({
    model: null,
    assessment: 'unavailable',
    display_name: null,
    avatar_data_url: null,
  });
});

it('imports a confidently cleared Telegram image as a private candidate and supersedes older pending reviews', async () => {
  await telegram.enqueue(
    owner,
    { name: 'Older', username: null, avatarDataUrl: image },
    new Date(1000),
  );
  await screenNextTelegramProfile(telegram, 'synthetic/vision', async () => ({
    decision: 'manual',
    reasonCode: null,
    confidence: 0.5,
  }));
  const previous = (await repository.list(mod, 1)).items[0]!;
  await telegram.enqueue(
    owner,
    { name: 'Newer', username: null, avatarDataUrl: image },
    new Date(2000),
  );
  expect((await decide(previous.id)).json().error.code).toBe(
    'SUBMISSION_CHANGED',
  );
  await screenNextTelegramProfile(telegram, 'synthetic/vision', async () => ({
    decision: 'approved',
    reasonCode: null,
    confidence: 0.97,
  }));
  expect((await telegram.status(owner))?.status).toBe('cleared');
  expect((await appearance.read(owner)).providerAvatarDataUrl).toBe(image);
  expect((await appearance.read(owner)).avatarDataUrl).toBeNull();
  expect((await repository.list(mod, 1)).items).toEqual([]);
});

it('discards a disabled account’s unprocessed snapshot and accepts it again after reactivation', async () => {
  const snapshot = {
    name: 'Example',
    username: 'example_42',
    avatarDataUrl: image,
  };
  await telegram.enqueue(owner, snapshot, new Date(1000));
  await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
    owner,
  ]);
  expect(await telegram.claim()).toBeNull();
  expect(await telegram.status(owner)).toBeNull();
  await db.pool.query("UPDATE users SET status='active' WHERE id=$1", [owner]);
  await telegram.enqueue(owner, snapshot, new Date(2000));
  expect((await telegram.claim())?.profile).toEqual(snapshot);
});

it('holds a profile privately until an authorized decision and preserves the published name during later review', async () => {
  const result = await submit('Draft name');
  expect(result.statusCode).toBe(200);
  expect(result.json().status).toBe('pending');
  expect(result.json().id).toBeNull();
  expect(
    (
      await db.pool.query('SELECT id FROM creators WHERE owner_user_id=$1', [
        owner,
      ])
    ).rowCount,
  ).toBe(0);
  expect((await app.inject('/creators/review-owner')).statusCode).toBe(404);
  const privateRead = await app.inject({
    url: '/me/workspace',
    headers: headers(owner),
  });
  expect(privateRead.json().profile).toBeNull();
  expect(privateRead.json().profileSubmission.displayName).toBe('Draft name');
  expect((await decide(result.json().submissionId)).statusCode).toBe(200);
  expect((await app.inject('/creators/review-owner')).json().displayName).toBe(
    'Draft name',
  );
  const next = await submit('Pending replacement');
  expect((await app.inject('/creators/review-owner')).body).not.toContain(
    'Pending replacement',
  );
  expect((await decide(next.json().submissionId, 'rejected')).statusCode).toBe(
    200,
  );
  expect((await app.inject('/creators/review-owner')).json().displayName).toBe(
    'Draft name',
  );
  expect(
    (await app.inject({ url: '/me/workspace', headers: headers(owner) })).json()
      .profileSubmission.reasonCode,
  ).toBe('SEXUAL_CONTENT');
});

it('checks permissions for queue, preview and decisions, including revoked roles and inactive users', async () => {
  const id = (await submit('Private')).json().submissionId;
  for (const path of [
    '/moderation/profiles',
    `/moderation/profiles/${id}/preview`,
  ]) {
    expect((await app.inject(path)).statusCode).toBe(401);
    expect(
      (await app.inject({ url: path, headers: headers(owner) })).statusCode,
    ).toBe(403);
    const allowed = await app.inject({ url: path, headers: headers(mod) });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['cache-control']).toBe('no-store');
    expect(allowed.body).not.toMatch(/user_id|provider_avatar|request_hash/);
  }
  expect((await decide(id, 'approved', owner)).statusCode).toBe(403);
  await db.pool.query('DELETE FROM user_roles WHERE user_id=$1', [mod]);
  expect((await decide(id)).statusCode).toBe(403);
  await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [
    owner,
  ]);
  expect((await decide(id, 'approved', another)).statusCode).toBe(409);
});

it('deduplicates concurrent operation retries and rejects reused keys and stale owner versions', async () => {
  const operationKey = randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      submit('One revision', { operationKey, expectedSubmissionId: null }),
    ),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([
    200, 200, 200, 200,
  ]);
  const id = responses[0]!.json().submissionId;
  expect(
    new Set(responses.map((response) => response.json().submissionId)).size,
  ).toBe(1);
  expect((await submit('Different', { operationKey })).statusCode).toBe(409);
  const changed = await submit('Second revision', {
    operationKey: randomUUID(),
    expectedSubmissionId: id,
  });
  expect(changed.statusCode).toBe(200);
  expect(
    (
      await submit('Stale', {
        operationKey: randomUUID(),
        expectedSubmissionId: id,
      })
    ).statusCode,
  ).toBe(409);
  expect((await decide(id)).json().error.code).toBe('SUBMISSION_CHANGED');
  expect(
    (
      await submit('One revision', { operationKey, expectedSubmissionId: null })
    ).json().submissionId,
  ).toBe(id);
  expect(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM profile_submissions WHERE status='pending'",
      )
    ).rows[0].n,
  ).toBe(1);
});

it('serializes conflicting moderators and keeps one immutable decision', async () => {
  const id = (await submit('One decision')).json().submissionId;
  const responses = await Promise.all([
    decide(id),
    decide(id, 'rejected', another),
  ]);
  expect(responses.map((response) => response.statusCode).sort()).toEqual([
    200, 409,
  ]);
  const evidence = (
    await db.pool.query(
      'SELECT decision FROM profile_moderation_decisions WHERE submission_id=$1',
      [id],
    )
  ).rows;
  expect(evidence).toHaveLength(1);
  expect((await decide(id, evidence[0].decision)).statusCode).toBe(200);
  await expect(
    db.pool.query(
      "UPDATE profile_submissions SET display_name='changed' WHERE id=$1",
      [id],
    ),
  ).rejects.toMatchObject({ code: 'P0001' });
  await expect(
    db.pool.query(
      'DELETE FROM profile_moderation_decisions WHERE submission_id=$1',
      [id],
    ),
  ).rejects.toMatchObject({ code: 'P0001' });
});

it('rechecks slug uniqueness on approval without partially recording the losing decision', async () => {
  const first = (await submit('First')).json().submissionId;
  const second = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: headers(another),
    payload: { displayName: 'Second', slug: 'review-owner' },
  });
  expect(second.statusCode).toBe(200);
  const results = await Promise.all([
    decide(first),
    decide(second.json().submissionId, 'approved', another),
  ]);
  expect(results.map((response) => response.statusCode).sort()).toEqual([
    200, 409,
  ]);
  expect(
    results.find((response) => response.statusCode === 409)!.json().error.code,
  ).toBe('SLUG_TAKEN');
  expect(
    (await db.pool.query('SELECT * FROM profile_moderation_decisions'))
      .rowCount,
  ).toBe(1);
});

it('freezes the selected provider photo, leaves subsequent imports private and publishes only the exact reviewed appearance', async () => {
  const creator = (
    await db.pool.query(
      'INSERT INTO creators(owner_user_id) VALUES($1) RETURNING id',
      [owner],
    )
  ).rows[0].id;
  await db.pool.query(
    "INSERT INTO creator_profiles(creator_id,slug,display_name) VALUES($1,'appearance-owner','Public owner')",
    [creator],
  );
  const wall = (
    await db.pool.query(
      "INSERT INTO walls(creator_id,slot_count,status) VALUES($1,10,'live') RETURNING id",
      [creator],
    )
  ).rows[0].id;
  await appearance.saveProviderAvatar(owner, image);
  const body = {
    title: 'Reviewed wall',
    description: 'Private until review',
    avatarSource: 'provider',
    avatarDataUrl: null,
    coverDataUrl: null,
  };
  const result = await app.inject({
    method: 'PUT',
    url: '/me/appearance',
    headers: headers(owner),
    payload: body,
  });
  expect(result.statusCode).toBe(200);
  const next =
    'data:image/jpeg;base64,' +
    (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#fed' },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64');
  await appearance.saveProviderAvatar(owner, next);
  const preview = await app.inject({
    url: `/moderation/profiles/${result.json().submissionId}/preview`,
    headers: headers(mod),
  });
  expect(preview.json().avatarDataUrl).toBe(image);
  expect(preview.body).not.toContain('providerAvatar');
  expect((await app.inject(`/walls/${wall}`)).body).not.toContain(
    'Private until review',
  );
  expect(
    (
      await db.pool.query(
        'SELECT title,avatar_data_url FROM account_appearance WHERE user_id=$1',
        [owner],
      )
    ).rows[0],
  ).toEqual({ title: '', avatar_data_url: null });
  expect((await decide(result.json().submissionId)).statusCode).toBe(200);
  expect(
    (
      await db.pool.query(
        'SELECT avatar_data_url FROM account_appearance WHERE user_id=$1',
        [owner],
      )
    ).rows[0].avatar_data_url,
  ).toBe(image);
  expect((await app.inject(`/walls/${wall}`)).json().appearance).toMatchObject({
    avatarDataUrl: image,
    title: 'Reviewed wall',
  });
  const removal = await app.inject({
    method: 'PUT',
    url: '/me/appearance',
    headers: headers(owner),
    payload: { ...body, title: 'Still pending', avatarSource: 'none' },
  });
  expect(removal.statusCode).toBe(200);
  expect((await app.inject(`/walls/${wall}`)).json().appearance).toMatchObject({
    avatarDataUrl: null,
    title: 'Reviewed wall',
  });
});

it('rolls back the public projection if audit insertion fails and keeps publication gated', async () => {
  const id = (await submit('Atomic')).json().submissionId;
  await db.pool
    .query(`CREATE FUNCTION fail_profile_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
    CREATE TRIGGER fail_profile_test BEFORE INSERT ON profile_moderation_decisions FOR EACH ROW EXECUTE FUNCTION fail_profile_test();`);
  try {
    expect((await decide(id)).statusCode).toBe(500);
    expect(
      (await db.pool.query('SELECT * FROM creator_profiles')).rowCount,
    ).toBe(0);
    expect((await repository.latest(owner, 'profile'))?.status).toBe('pending');
  } finally {
    await db.pool.query(
      'DROP TRIGGER fail_profile_test ON profile_moderation_decisions; DROP FUNCTION fail_profile_test();',
    );
  }
  const closed = buildApi(db, sessions, config);
  registerProfileModeration(closed, repository);
  try {
    expect(
      (
        await closed.inject({
          method: 'POST',
          url: `/moderation/profiles/${id}/decision`,
          headers: headers(owner),
          payload: { decision: 'approved' },
        })
      ).statusCode,
    ).toBe(403);
    const response = await closed.inject({
      method: 'POST',
      url: `/moderation/profiles/${id}/decision`,
      headers: headers(mod),
      payload: { decision: 'approved' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('PROFILE_PUBLICATION_UNAVAILABLE');
  } finally {
    await closed.close();
  }
});
