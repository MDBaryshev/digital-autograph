import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  requestAudience,
  workflow,
  verifyProof,
  verifySource,
  verifyActiveRun,
  createGitHubApi,
  validateRequest,
} from '../../../deploy/github-staging-controller.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwks = {
  keys: [
    {
      ...publicKey.export({ format: 'jwk' }),
      kid: 'test-key',
      use: 'sig',
      alg: 'RS256',
    },
  ],
};
const now = 1800000000;
const sourceSha = 'a'.repeat(40);
const claim = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: requestAudience('release-test', 'd'.repeat(64)),
  repository: 'MDBaryshev/digital-autograph',
  repository_id: '1447358020',
  repository_owner_id: '118826513',
  workflow_ref: workflow,
  workflow_sha: sourceSha,
  event_name: 'workflow_dispatch',
  ref: 'refs/heads/main',
  sha: sourceSha,
  actor_id: '118826513',
  run_id: '123',
  run_attempt: '1',
  jti: 'one-request-unique-jti',
  iat: now - 5,
  nbf: now - 5,
  exp: now + 295,
};
function token(
  overrides: Record<string, unknown> = {},
  header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' },
) {
  const body = [header, { ...claim, ...overrides }]
    .map((x) => Buffer.from(JSON.stringify(x)).toString('base64url'))
    .join('.');
  return (
    body +
    '.' +
    sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')
  );
}
const expected = {
  sourceSha,
  runId: '123',
  allowedActors: ['118826513'],
  operation: 'release-test',
  manifestSha256: 'd'.repeat(64),
  approvedAt: (now - 10) * 1000,
};

it.each([
  { status: 'completed', conclusion: 'cancelled' },
  { triggering_actor: { id: 999 } },
  { run_attempt: 2 },
  { head_sha: 'b'.repeat(40) },
  { path: '.github/workflows/ci.yml' },
])('refuses cancelled/substituted live run %j', async (change) => {
  const run = {
    status: 'in_progress',
    conclusion: null,
    event: 'workflow_dispatch',
    head_branch: 'main',
    path: '.github/workflows/deploy-staging.yml',
    head_sha: sourceSha,
    head_repository: { id: 1447358020 },
    actor: { id: 118826513 },
    triggering_actor: { id: 118826513 },
    run_attempt: 1,
  };
  await expect(
    verifyActiveRun(
      async () => ({ ...run, ...change }),
      '123',
      { actorId: '118826513', runAttempt: '1' },
      { sourceSha, allowedActorIds: ['118826513'] },
    ),
  ).rejects.toThrow();
});
it('binds the signed proof to the exact operation and manifest', () => {
  for (const change of [
    { operation: 'other-release' },
    { manifestSha256: 'f'.repeat(64) },
    { approvedAt: (now + 20) * 1000 },
  ])
    expect(() =>
      verifyProof(token(), jwks, { ...expected, ...change }, now),
    ).toThrow();
});

describe('signed GitHub identity boundary', () => {
  it('accepts the exact dispatch identity without trusting a mutable sub', () => {
    expect(
      verifyProof(
        token({ sub: 'arbitrary-sub-is-not-authorization' }),
        jwks,
        expected,
        now,
      ),
    ).toMatchObject({
      actorId: '118826513',
      jtiHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it.each([
    ['iss', 'https://attacker.test'],
    ['aud', 'other'],
    ['repository', 'other/digital-autograph'],
    ['repository_id', '1'],
    ['repository_owner_id', '1'],
    ['workflow_ref', workflow.replace('deploy-staging.yml', 'ci.yml')],
    ['workflow_sha', 'b'.repeat(40)],
    ['event_name', 'pull_request'],
    ['ref', 'refs/heads/feature'],
    ['sha', 'b'.repeat(40)],
    ['actor_id', '999'],
    ['run_id', '999'],
    ['exp', now],
    ['iat', now + 100],
    ['nbf', now + 100],
    ['jti', ''],
    ['exp', now + 900],
  ])('rejects substituted %s', (key, value) => {
    expect(() =>
      verifyProof(token({ [key]: value }), jwks, expected, now),
    ).toThrow();
  });
  it('rejects unsigned, wrong algorithm, wrong key and oversized tokens', () => {
    for (const t of [
      token({}, { alg: 'none', typ: 'JWT', kid: 'test-key' }),
      token({}, { alg: 'HS256', typ: 'JWT', kid: 'test-key' }),
      token({}, { alg: 'RS256', typ: 'JWT', kid: 'other' }),
      token().slice(0, -4) + 'bad',
      'a'.repeat(17000),
    ])
      expect(() => verifyProof(t, jwks, expected, now)).toThrow();
  });
});

export function sourceApi(
  options: {
    cancelled?: boolean;
    stale?: boolean;
    selfApproval?: boolean;
    unresolved?: boolean;
    changes?: boolean;
    paginateChanges?: boolean;
    noPr?: boolean;
  } = {},
) {
  return async (method: string, route: string) => {
    if (route === '/commits/main')
      return { sha: options.stale ? 'b'.repeat(40) : sourceSha };
    if (route.includes('/check-runs'))
      return {
        check_runs: [
          'checks',
          'windows-unit',
          'windows-integration-runner',
          'macos-integration-runner',
          'e2e',
          'secrets',
          'policy',
        ].map((name, i) => ({
          id: i + 1,
          name,
          head_sha: route.includes('c'.repeat(40)) ? 'c'.repeat(40) : sourceSha,
          app: { slug: 'github-actions' },
          status: 'completed',
          conclusion:
            options.cancelled && name === 'macos-integration-runner'
              ? 'cancelled'
              : 'success',
        })),
      };
    if (route.includes('/pulls?'))
      return options.noPr
        ? []
        : [
            {
              number: 3,
              merged_at: '2027-01-01',
              merge_commit_sha: sourceSha,
              base: { ref: 'main', repo: { id: 1447358020 } },
              head: { sha: 'c'.repeat(40) },
              user: { id: options.selfApproval ? 118826513 : 210857445 },
            },
          ];
    if (route.includes('/reviews')) {
      if (options.paginateChanges && route.endsWith('page=1'))
        return Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          user: { id: i === 0 ? 118826513 : 1000 + i },
          state: i === 0 ? 'APPROVED' : 'COMMENTED',
          commit_id: 'c'.repeat(40),
        }));
      return [
        {
          id: options.paginateChanges ? 101 : 1,
          user: { id: 118826513 },
          state:
            options.changes || options.paginateChanges
              ? 'CHANGES_REQUESTED'
              : 'APPROVED',
          commit_id: 'c'.repeat(40),
        },
      ];
    }
    if (method === 'GRAPHQL')
      return {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [{ isResolved: !options.unresolved }],
                pageInfo: { hasPreviousPage: false },
              },
            },
          },
        },
      };
    throw Error('Unexpected synthetic API request');
  };
}
describe('accepted main and review evidence', () => {
  it('requires a current main CI and exact peer-approved merged PR', async () => {
    await expect(verifySource(sourceApi(), sourceSha)).resolves.toBeUndefined();
  });
  it.each([
    { cancelled: true },
    { stale: true },
    { selfApproval: true },
    { unresolved: true },
    { changes: true },
    { paginateChanges: true },
    { noPr: true },
  ])('fails closed on %j', async (options) => {
    await expect(verifySource(sourceApi(options), sourceSha)).rejects.toThrow();
  });
});

it('rejects invalid deployment time and expired/wrong approval before launch', () => {
  const approval = {
    schemaVersion: 1,
    operation: 'release-test',
    sourceSha,
    manifestSha256: 'd'.repeat(64),
    manualToolSha256: 'e'.repeat(64),
    approvedAt: now * 1000 - 10000,
    expiresAt: now * 1000 + 60000,
    allowedActorIds: ['118826513'],
  };
  const deployment = {
    id: 12,
    task: 'deploy:prepared-staging',
    environment: 'staging',
    production_environment: false,
    sha: sourceSha,
    created_at: new Date(now * 1000).toISOString(),
    payload: {
      schemaVersion: 1,
      operation: 'release-test',
      manifestSha256: 'd'.repeat(64),
      runId: '123',
    },
  };
  expect(validateRequest(deployment, approval, now * 1000)).toMatchObject({
    operation: 'release-test',
  });
  for (const d of [
    { ...deployment, created_at: 'invalid' },
    { ...deployment, environment: 'production' },
    {
      ...deployment,
      payload: { ...deployment.payload, operation: '../escape' },
    },
  ])
    expect(() => validateRequest(d, approval, now * 1000)).toThrow();
  expect(() =>
    validateRequest(
      deployment,
      { ...approval, expiresAt: now * 1000 },
      now * 1000,
    ),
  ).toThrow();
});

it('pins API destinations and refuses redirects or unbounded responses', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response('{}'));
  const api = createGitHubApi('synthetic-token-for-test-only', fetcher);
  await api('IDENTITY', '');
  expect(fetcher).toHaveBeenLastCalledWith(
    'https://api.github.com/user',
    expect.objectContaining({ method: 'GET', redirect: 'error' }),
  );
  await api('GRAPHQL', '', { query: 'synthetic' });
  expect(fetcher).toHaveBeenLastCalledWith(
    'https://api.github.com/graphql',
    expect.objectContaining({ method: 'POST', redirect: 'error' }),
  );
  const calls = fetcher.mock.calls.length;
  await expect(api('GET', 'https://attacker.test')).rejects.toThrow();
  await expect(api('GET', '/../escape')).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(calls);
  fetcher.mockResolvedValueOnce(
    new Response('', {
      status: 302,
      headers: { Location: 'https://attacker.test' },
    }),
  );
  await expect(api('GET', '/commits/main')).rejects.toThrow();
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) })),
  );
  await expect(api('GET', '/commits/main')).rejects.toThrow();
});
