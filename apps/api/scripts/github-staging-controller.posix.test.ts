import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  requestAudience,
  workflow,
  digest,
  handleDeployment,
  loadPrepared,
  processQueue,
} from '../../../deploy/github-staging-controller.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'local', use: 'sig' }],
};
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(path.join(process.cwd(), '.controller-fixture-'));
  roots.push(dir);
  const root = path.join(dir, 'tools'),
    stateRoot = path.join(dir, 'state'),
    receiptDir = path.join(dir, 'receipts');
  const op = 'release-test',
    sourceSha = 'a'.repeat(40),
    now = Date.now();
  const manifestFile = path.join(root, 'incoming', op, 'manifest.json'),
    stateFile = path.join(stateRoot, op, 'state.json');
  for (const d of [
    path.dirname(manifestFile),
    path.dirname(stateFile),
    receiptDir,
  ])
    mkdirSync(d, { recursive: true, mode: 0o700 });
  const manifest = JSON.stringify({
    operation: op,
    sourceSha,
    environment: 'staging',
    project: 'digital-autograph',
    instanceId: 'fhmh48sf6m5l2tu8u4a1',
    caddyConfig: 'Caddyfile',
    domains: { web: 'staging.destka.online', api: 'api.staging.destka.online' },
    production_environment: false,
    publicDomainApproved: false,
  });
  writeFileSync(manifestFile, manifest, { mode: 0o600 });
  writeFileSync(stateFile, JSON.stringify({ stage: 'MIGRATED', sourceSha }), {
    mode: 0o600,
  });
  const approval = {
    schemaVersion: 1,
    operation: op,
    sourceSha,
    manifestSha256: digest(manifest),
    manualToolSha256: 'e'.repeat(64),
    approvedAt: now - 10000,
    expiresAt: now + 60000,
    allowedActorIds: ['118826513'],
  };
  const proofBody = [
    { alg: 'RS256', typ: 'JWT', kid: 'local' },
    {
      iss: 'https://token.actions.githubusercontent.com',
      aud: requestAudience(op, approval.manifestSha256),
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
      jti: 'synthetic-one-shot-request',
      iat: Math.floor(now / 1000) - 5,
      nbf: Math.floor(now / 1000) - 5,
      exp: Math.floor(now / 1000) + 295,
    },
  ]
    .map((x) => Buffer.from(JSON.stringify(x)).toString('base64url'))
    .join('.');
  const proof =
    proofBody +
    '.' +
    sign('RSA-SHA256', Buffer.from(proofBody), privateKey).toString(
      'base64url',
    );
  const deployment = {
    id: 17,
    task: 'deploy:prepared-staging',
    environment: 'staging',
    production_environment: false,
    sha: sourceSha,
    created_at: new Date(now).toISOString(),
    payload: {
      schemaVersion: 1,
      operation: op,
      manifestSha256: approval.manifestSha256,
      runId: '123',
      oidcProof: proof,
    },
  };
  let lastStatus = '';
  const report = vi.fn();
  const api = vi.fn(async (method: string, route: string, body?: unknown) => {
    if (route.includes('/statuses')) {
      if (method === 'POST') {
        report(body);
        lastStatus = (body as { state: string }).state;
        return {};
      }
      return lastStatus
        ? [{ state: lastStatus, creator: { id: 118826513 } }]
        : [];
    }
    if (route === '/actions/runs/123')
      return {
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
    if (route === '/commits/main') return { sha: sourceSha };
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
          conclusion: 'success',
        })),
      };
    if (route.includes('/pulls?'))
      return [
        {
          number: 3,
          merged_at: '2027-01-01',
          merge_commit_sha: sourceSha,
          base: { ref: 'main', repo: { id: 1447358020 } },
          head: { sha: 'c'.repeat(40) },
          user: { id: 210857445 },
        },
      ];
    if (route.includes('/reviews'))
      return [
        {
          id: 1,
          user: { id: 118826513 },
          state: 'APPROVED',
          commit_id: 'c'.repeat(40),
        },
      ];
    if (method === 'GRAPHQL')
      return {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [],
                pageInfo: { hasPreviousPage: false },
              },
            },
          },
        },
      };
    throw Error('Unexpected synthetic request');
  });
  const launch = vi.fn(async () => {
    writeFileSync(stateFile, JSON.stringify({ stage: 'HEALTHY', sourceSha }));
    return 0;
  });
  return {
    dir,
    root,
    stateRoot,
    receiptDir,
    manifestFile,
    stateFile,
    sourceSha,
    approval,
    deployment,
    api,
    report,
    launch,
    options: {
      api,
      jwks,
      root,
      stateRoot,
      receiptDir,
      uid: process.getuid(),
      now,
      launch,
    },
  };
}

it('activates exactly one approved prepared operation and reports actual HEALTHY', async () => {
  const f = fixture();
  await expect(
    handleDeployment(f.deployment, f.approval, f.options),
  ).resolves.toBe('HEALTHY');
  expect(f.launch).toHaveBeenCalledExactlyOnceWith(f.manifestFile);
  expect(f.report).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'success' }),
  );
  const receipt = readFileSync(
    path.join(f.receiptDir, 'release-test.json'),
    'utf8',
  );
  expect(receipt).not.toContain(f.deployment.payload.oidcProof);
  expect(JSON.parse(receipt)).toMatchObject({ state: 'HEALTHY', runId: '123' });
});
it('does not let an invalid first request poison the queue', async () => {
  const f = fixture();
  const bad = {
    ...f.deployment,
    id: 16,
    payload: { ...f.deployment.payload, oidcProof: 'invalid' },
  };
  await expect(
    processQueue([bad, f.deployment], f.approval, f.options),
  ).resolves.toBe('HEALTHY');
  expect(f.launch).toHaveBeenCalledTimes(1);
});
it('rejects forged requests before any server mutation', async () => {
  const f = fixture();
  await expect(
    handleDeployment(
      {
        ...f.deployment,
        payload: { ...f.deployment.payload, oidcProof: 'bad' },
      },
      f.approval,
      f.options,
    ),
  ).rejects.toThrow();
  expect(f.api).not.toHaveBeenCalled();
  expect(f.launch).not.toHaveBeenCalled();
});
it.each(['STOPPED', 'BACKUP_REQUIRED', 'STARTING', 'HEALTHY'])(
  'never replays a %s manual receipt',
  async (stage) => {
    const f = fixture();
    writeFileSync(
      f.stateFile,
      JSON.stringify({ stage, sourceSha: f.sourceSha }),
    );
    await expect(
      handleDeployment(f.deployment, f.approval, f.options),
    ).rejects.toThrow();
    expect(f.launch).not.toHaveBeenCalled();
  },
);
it('refuses a changed manifest even when its JSON meaning is unchanged', async () => {
  const f = fixture();
  writeFileSync(f.manifestFile, readFileSync(f.manifestFile, 'utf8') + '\n');
  await expect(
    handleDeployment(f.deployment, f.approval, f.options),
  ).rejects.toThrow();
  expect(f.launch).not.toHaveBeenCalled();
});

it.each(['instanceId', 'web', 'api', 'caddyConfig'])(
  'refuses an out-of-scope %s even when its manifest hash is approved',
  (field) => {
    const f = fixture();
    const manifest = JSON.parse(readFileSync(f.manifestFile, 'utf8'));
    if (field === 'web' || field === 'api')
      manifest.domains[field] = 'destka.ru';
    else manifest[field] = 'other-target';
    const bytes = JSON.stringify(manifest);
    writeFileSync(f.manifestFile, bytes);
    expect(() =>
      loadPrepared(
        { ...f.approval, manifestSha256: digest(bytes) },
        f.root,
        f.stateRoot,
        process.getuid(),
      ),
    ).toThrow();
  },
);
it('rejects symlinked files and writable parent directories', async () => {
  const f = fixture();
  const copy = path.join(f.dir, 'copy.json');
  writeFileSync(copy, readFileSync(f.manifestFile), { mode: 0o600 });
  unlinkSync(f.manifestFile);
  symlinkSync(copy, f.manifestFile);
  await expect(
    handleDeployment(f.deployment, f.approval, f.options),
  ).rejects.toThrow();
  unlinkSync(f.manifestFile);
  writeFileSync(f.manifestFile, readFileSync(copy), { mode: 0o600 });
  chmodSync(path.dirname(f.manifestFile), 0o777);
  await expect(
    handleDeployment(f.deployment, f.approval, f.options),
  ).rejects.toThrow();
  expect(f.launch).not.toHaveBeenCalled();
});
it('never launches twice after a repeated button request', async () => {
  const f = fixture();
  await processQueue([f.deployment], f.approval, f.options);
  await expect(
    processQueue([{ ...f.deployment, id: 18 }], f.approval, f.options),
  ).resolves.toBe('RECONCILED');
  expect(f.launch).toHaveBeenCalledTimes(1);
});

it('admits at most one of two concurrent activation requests', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled([
    handleDeployment(f.deployment, f.approval, f.options),
    handleDeployment({ ...f.deployment, id: 18 }, f.approval, f.options),
  ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
  expect(f.launch).toHaveBeenCalledTimes(1);
});
it('reconciles a lost GitHub success response without repeating start', async () => {
  const f = fixture();
  const original = f.api.getMockImplementation()!;
  let lose = true;
  f.api.mockImplementation(async (method, route, body) => {
    if (
      lose &&
      method === 'POST' &&
      (body as { state?: string })?.state === 'success'
    ) {
      lose = false;
      throw Error('lost response');
    }
    return original(method, route, body);
  });
  await expect(
    processQueue([f.deployment], f.approval, f.options),
  ).resolves.toBe('INSPECTION_REQUIRED');
  await expect(
    processQueue([f.deployment], f.approval, f.options),
  ).resolves.toBe('RECONCILED');
  expect(f.launch).toHaveBeenCalledTimes(1);
  expect(f.report).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'success' }),
  );
});

it('does not treat a collaborator-written status as the server result', async () => {
  const f = fixture();
  await processQueue([f.deployment], f.approval, f.options);
  const original = f.api.getMockImplementation()!;
  f.api.mockImplementation(async (method, route, body) =>
    method === 'GET' && route.includes('/statuses')
      ? [{ state: 'success', creator: { id: 999 } }]
      : original(method, route, body),
  );
  const before = f.report.mock.calls.length;
  await processQueue([f.deployment], f.approval, f.options);
  expect(f.report.mock.calls.length).toBe(before + 1);
  expect(f.launch).toHaveBeenCalledTimes(1);
});
it('latches an unknown start result and refuses automatic retries', async () => {
  const f = fixture();
  f.launch.mockImplementation(async () => {
    throw Error('connection lost after start');
  });
  await expect(
    processQueue([f.deployment], f.approval, f.options),
  ).resolves.toBe('INSPECTION_REQUIRED');
  await processQueue([f.deployment], f.approval, f.options);
  expect(f.launch).toHaveBeenCalledTimes(1);
  expect(f.report).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'failure' }),
  );
});

it('never starts after the dispatch was cancelled', async () => {
  const f = fixture();
  const original = f.api.getMockImplementation()!;
  f.api.mockImplementation(async (method, route, body) =>
    route.startsWith('/actions/runs/')
      ? { status: 'completed', conclusion: 'cancelled' }
      : original(method, route, body),
  );
  await expect(
    processQueue([f.deployment], f.approval, f.options),
  ).resolves.toBe('INSPECTION_REQUIRED');
  expect(f.launch).not.toHaveBeenCalled();
});

it.each([false, true])(
  'rechecks approval/proof expiry at launch after slow evidence reads (proof=%s)',
  async (proofExpires) => {
    const f = fixture();
    const original = f.api.getMockImplementation()!;
    if (proofExpires) f.approval.expiresAt = f.options.now + 14 * 60 * 1000;
    const clock = vi.spyOn(Date, 'now');
    f.api.mockImplementation(async (method, route, body) => {
      const result = await original(method, route, body);
      if (route.startsWith('/actions/runs/'))
        clock.mockReturnValue(f.options.now + (proofExpires ? 297000 : 120000));
      return result;
    });
    try {
      await expect(
        processQueue([f.deployment], f.approval, f.options),
      ).resolves.toBe('INSPECTION_REQUIRED');
      expect(f.launch).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  },
);
it('treats a crash before recording completion as inspection-required', async () => {
  const f = fixture();
  writeFileSync(
    path.join(f.receiptDir, 'release-test.json'),
    JSON.stringify({
      operation: f.approval.operation,
      sourceSha: f.sourceSha,
      deploymentId: '17',
      state: 'STARTING',
    }),
    { mode: 0o600 },
  );
  await expect(
    processQueue([f.deployment], f.approval, f.options),
  ).resolves.toBe('RECONCILED');
  expect(f.launch).not.toHaveBeenCalled();
  expect(f.report).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: 'failure' }),
  );
});

it('rejects malicious workflow inputs before any network request or shell expansion', () => {
  const yaml = readFileSync(
    new URL('../../../.github/workflows/deploy-staging.yml', import.meta.url),
    'utf8',
  );
  const block = yaml
    .match(/ {8}run: \|\n([\s\S]*?)(?=\n {6}- name:)/)![1]!
    .replace(/^ {10}/gm, '');
  expect(spawnSync('bash', ['-n'], { input: block }).status).toBe(0);
  const f = fixture();
  const bin = path.join(f.dir, 'bin');
  mkdirSync(bin, { mode: 0o700 });
  const sentinel = path.join(f.dir, 'unexpected-network');
  writeFileSync(
    path.join(bin, 'curl'),
    '#!/bin/sh\ntouch "' + sentinel + '"\nexit 1\n',
    { mode: 0o700 },
  );
  for (const operation of [
    '../escape',
    '$(touch ' + sentinel + ')',
    'release-test;curl evil',
    'short',
  ]) {
    const p = spawnSync('bash', ['-c', block], {
      env: {
        PATH: bin + ':' + process.env.PATH,
        OPERATION: operation,
        MANIFEST_SHA256: 'a'.repeat(64),
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '123',
      },
      timeout: 3000,
    });
    expect(p.status).not.toBe(0);
  }
  expect(() => readFileSync(sentinel)).toThrow();
});
