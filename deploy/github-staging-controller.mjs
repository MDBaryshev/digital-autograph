// A transport for the LAST manual release phase, never a general CI runner.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  readFileSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import console from 'node:console';

const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const operation = /^[a-z0-9][a-z0-9-]{7,63}$/;
const numeric = /^[1-9][0-9]{0,19}$/;
const issuer = 'https://token.actions.githubusercontent.com';
export const audience = 'https://staging.destka.online/prepared-deployment';
export function requestAudience(op, manifestSha256) {
  if (!operation.test(op) || !hash.test(manifestSha256)) refuse();
  return `${audience}/${op}/${manifestSha256}`;
}
export const repository = 'MDBaryshev/digital-autograph';
export const workflow = `${repository}/.github/workflows/deploy-staging.yml@refs/heads/main`;
const repositoryId = '1447358020';
const ownerId = '118826513';
const ciChecks = [
  'checks',
  'windows-unit',
  'windows-integration-runner',
  'macos-integration-runner',
  'e2e',
];
async function actionPages(api, route, field) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const response = await api('GET', `${route}&per_page=100&page=${page}`);
    const batch = response[field];
    if (!Array.isArray(batch)) refuse();
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  refuse();
}

async function verifyActions(api, sourceSha, event) {
  const runs = await actionPages(
    api,
    `/actions/runs?head_sha=${sourceSha}`,
    'workflow_runs',
  );
  const workflows = [
    ['ci.yml', event, ciChecks],
    ['secret-scan.yml', event, ['secrets']],
  ];
  if (event === 'pull_request')
    workflows.push(['pr-policy.yml', 'pull_request_target', ['policy']]);
  for (const [file, expectedEvent, names] of workflows) {
    const run = runs
      .filter(
        (item) =>
          item.path === `.github/workflows/${file}` &&
          item.event === expectedEvent,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (
      !run ||
      !numeric.test(String(run.id)) ||
      !numeric.test(String(run.run_attempt)) ||
      run.head_sha !== sourceSha ||
      String(run.head_repository?.id) !== repositoryId ||
      run.event !== expectedEvent ||
      (event === 'push' && run.head_branch !== 'main') ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    )
      refuse();
    const jobs = await actionPages(
      api,
      `/actions/runs/${run.id}/jobs?filter=latest`,
      'jobs',
    );
    for (const name of names) {
      const job = jobs
        .filter((item) => item.name === name)
        .sort((a, b) => b.id - a.id)[0];
      if (
        !job ||
        job.run_id !== run.id ||
        job.run_attempt !== run.run_attempt ||
        job.head_sha !== sourceSha ||
        job.status !== 'completed' ||
        job.conclusion !== 'success'
      )
        refuse();
    }
  }
}
export const digest = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const refuse = () => {
  throw Error('DEPLOYMENT_REQUEST_REFUSED');
};

// Do not trust writable parent paths or symlinks, including a root-owned leaf
// inside an attacker-controlled directory. Tests use their own current UID.
export function privatePath(
  file,
  directory = false,
  uid = process.getuid(),
  privateLeaf = true,
) {
  const absolute = path.resolve(file);
  if (absolute !== file || realpathSync(file) !== file) refuse();
  for (let current = file; ; current = path.dirname(current)) {
    const s = lstatSync(current);
    if (s.isSymbolicLink() || (s.uid !== uid && s.uid !== 0) || s.mode & 0o022)
      refuse();
    if (
      current === file &&
      ((privateLeaf && s.mode & 0o077) ||
        (directory ? !s.isDirectory() : !s.isFile()))
    )
      refuse();
    if (current === path.dirname(current)) break;
  }
  return file;
}
function privateJson(file, uid) {
  privatePath(file, false, uid);
  const bytes = readFileSync(file);
  if (bytes.length > 65536) refuse();
  return { value: JSON.parse(bytes), bytes };
}

export function verifyProof(token, jwks, expected, now = Date.now() / 1000) {
  if (typeof token !== 'string' || token.length > 16384) refuse();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((x) => !/^[A-Za-z0-9_-]+$/.test(x)))
    refuse();
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claim = JSON.parse(Buffer.from(parts[1], 'base64url'));
  if (
    header.alg !== 'RS256' ||
    header.typ !== 'JWT' ||
    typeof header.kid !== 'string'
  )
    refuse();
  const key = jwks.keys?.find(
    (x) =>
      x.kid === header.kid &&
      x.kty === 'RSA' &&
      x.use === 'sig' &&
      (!x.alg || x.alg === 'RS256'),
  );
  if (
    !key ||
    !verify(
      'RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    )
  )
    refuse();
  if (
    claim.iss !== issuer ||
    claim.aud !==
      requestAudience(expected.operation, expected.manifestSha256) ||
    claim.repository !== repository ||
    String(claim.repository_id) !== repositoryId ||
    String(claim.repository_owner_id) !== ownerId ||
    claim.workflow_ref !== workflow ||
    claim.event_name !== 'workflow_dispatch' ||
    claim.ref !== 'refs/heads/main' ||
    claim.sha !== expected.sourceSha ||
    claim.workflow_sha !== expected.sourceSha ||
    String(claim.run_id) !== expected.runId ||
    !expected.allowedActors.includes(String(claim.actor_id))
  )
    refuse();
  if (!numeric.test(String(claim.run_attempt))) refuse();
  if (
    ![claim.iat, claim.nbf, claim.exp].every(Number.isSafeInteger) ||
    claim.nbf > now + 15 ||
    claim.iat > now + 15 ||
    claim.iat < now - 300 ||
    claim.iat < expected.approvedAt / 1000 - 15 ||
    claim.exp <= now ||
    claim.exp > claim.iat + 600 ||
    typeof claim.jti !== 'string' ||
    claim.jti.length < 8 ||
    claim.jti.length > 256
  )
    refuse();
  return {
    jtiHash: digest(claim.jti),
    actorId: String(claim.actor_id),
    runAttempt: String(claim.run_attempt),
  };
}

export async function verifyActiveRun(api, runId, proof, approval) {
  const run = await api('GET', `/actions/runs/${runId}`);
  if (
    run.status !== 'in_progress' ||
    run.conclusion !== null ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.path !== '.github/workflows/deploy-staging.yml' ||
    run.head_sha !== approval.sourceSha ||
    String(run.head_repository?.id) !== repositoryId ||
    String(run.actor?.id) !== proof.actorId ||
    !approval.allowedActorIds.includes(String(run.triggering_actor?.id)) ||
    String(run.run_attempt) !== proof.runAttempt
  )
    refuse();
}

export function validateRequest(deployment, approval, now = Date.now()) {
  const p = deployment.payload;
  if (deployment.production_environment !== false) refuse();
  if (
    !Number.isFinite(Date.parse(deployment.created_at)) ||
    !hash.test(approval.manualToolSha256)
  )
    refuse();
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    p.schemaVersion !== 1 ||
    !operation.test(p.operation) ||
    !hash.test(p.manifestSha256) ||
    !numeric.test(String(p.runId)) ||
    !numeric.test(String(deployment.id)) ||
    deployment.environment !== 'staging' ||
    deployment.task !== 'deploy:prepared-staging' ||
    deployment.sha !== approval.sourceSha ||
    !sha.test(approval.sourceSha) ||
    approval.operation !== p.operation ||
    approval.manifestSha256 !== p.manifestSha256 ||
    approval.schemaVersion !== 1 ||
    !Array.isArray(approval.allowedActorIds) ||
    !approval.allowedActorIds.length ||
    approval.allowedActorIds.some((x) => !numeric.test(x)) ||
    !Number.isSafeInteger(approval.expiresAt) ||
    !Number.isSafeInteger(approval.approvedAt) ||
    approval.approvedAt > now ||
    approval.expiresAt <= now ||
    approval.expiresAt - approval.approvedAt > 15 * 60 * 1000 ||
    Date.parse(deployment.created_at) < approval.approvedAt ||
    Date.parse(deployment.created_at) > now + 15000 ||
    now - Date.parse(deployment.created_at) > 300000
  )
    refuse();
  return p;
}

export async function verifySource(api, sourceSha) {
  if ((await api('GET', '/commits/main')).sha !== sourceSha) refuse();
  await verifyActions(api, sourceSha, 'push');
  const prs = await api('GET', `/commits/${sourceSha}/pulls?per_page=100`);
  const pr = prs.find(
    (x) =>
      x.merged_at &&
      x.merge_commit_sha === sourceSha &&
      x.base?.repo?.id === Number(repositoryId) &&
      x.base.ref === 'main' &&
      x.head?.sha &&
      x.user?.id,
  );
  if (!pr) refuse();
  await verifyActions(api, pr.head.sha, 'pull_request');
  // Head-specific peer review is checked again; a comment is never approval.
  const reviews = [];
  for (let page = 1; ; page++) {
    if (page > 20) refuse();
    const batch = await api(
      'GET',
      `/pulls/${pr.number}/reviews?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) refuse();
    reviews.push(...batch);
    if (batch.length < 100) break;
  }
  const latest = new Map();
  for (const r of reviews)
    if (
      r.user &&
      ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)
    ) {
      const previous = latest.get(r.user.id);
      if (!previous || r.id > previous.id) latest.set(r.user.id, r);
    }
  const acceptedActors = new Set([Number(ownerId), 210857445]);
  if (
    [...latest.values()].some(
      (x) => acceptedActors.has(x.user.id) && x.state === 'CHANGES_REQUESTED',
    )
  )
    refuse();
  if (
    ![...latest.values()].some(
      (x) =>
        acceptedActors.has(x.user.id) &&
        x.user.id !== pr.user.id &&
        x.state === 'APPROVED' &&
        x.commit_id === pr.head.sha,
    )
  )
    refuse();
  const threads = await api('GRAPHQL', '', {
    query:
      'query($number:Int!){repository(owner:"MDBaryshev",name:"digital-autograph"){pullRequest(number:$number){reviewThreads(last:100){nodes{isResolved}pageInfo{hasPreviousPage}}}}}',
    variables: { number: pr.number },
  });
  const threadPage = threads.data?.repository?.pullRequest?.reviewThreads;
  if (
    threads.errors ||
    !threadPage ||
    threadPage.pageInfo?.hasPreviousPage !== false ||
    !Array.isArray(threadPage.nodes) ||
    threadPage.nodes.some((x) => x.isResolved !== true)
  )
    refuse();
}

export function loadPrepared(approval, root, stateRoot, uid) {
  if (!operation.test(approval.operation)) refuse();
  const manifestFile = path.join(
    root,
    'incoming',
    approval.operation,
    'manifest.json',
  );
  const manifest = privateJson(manifestFile, uid);
  const receipt = privateJson(
    path.join(stateRoot, approval.operation, 'state.json'),
    uid,
  ).value;
  if (
    digest(manifest.bytes) !== approval.manifestSha256 ||
    manifest.value.sourceSha !== approval.sourceSha ||
    manifest.value.operation !== approval.operation ||
    manifest.value.environment !== 'staging' ||
    manifest.value.project !== 'digital-autograph' ||
    manifest.value.instanceId !== 'fhmh48sf6m5l2tu8u4a1' ||
    manifest.value.caddyConfig !== 'Caddyfile' ||
    manifest.value.domains?.web !== 'staging.destka.online' ||
    manifest.value.domains?.api !== 'api.staging.destka.online' ||
    manifest.value.publicDomainApproved !== false ||
    receipt.stage !== 'MIGRATED' ||
    receipt.sourceSha !== approval.sourceSha
  )
    refuse();
  // The pinned manual engine independently checks restore proof, manifest/tool
  // identity, schema/fence, images, roles and health. This bridge cannot apply DDL.
  return manifestFile;
}

export async function handleDeployment(deployment, approval, options) {
  const {
    api,
    jwks,
    root,
    stateRoot,
    receiptDir,
    uid = process.getuid(),
    now = Date.now(),
    launch,
  } = options;
  const request = validateRequest(deployment, approval, now);
  const proof = verifyProof(
    request.oidcProof,
    jwks,
    {
      sourceSha: approval.sourceSha,
      runId: String(request.runId),
      allowedActors: approval.allowedActorIds,
      operation: approval.operation,
      manifestSha256: approval.manifestSha256,
      approvedAt: approval.approvedAt,
    },
    now / 1000,
  );
  await verifySource(api, approval.sourceSha);
  const manifestFile = loadPrepared(approval, root, stateRoot, uid);
  privatePath(receiptDir, true, uid);
  const latch = path.join(receiptDir, approval.operation + '.json');
  const record = {
    schemaVersion: 1,
    operation: approval.operation,
    sourceSha: approval.sourceSha,
    deploymentId: String(deployment.id),
    runId: String(request.runId),
    ...proof,
    state: 'STARTING',
    startedAt: now,
  };
  // Exclusive, fsynced operation receipt BEFORE any side effect: crash/unknown
  // outcome never authorizes blind replay or a second deployment id.
  const fd = openSync(latch, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(record));
    (await import('node:fs')).fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  await api('POST', `/deployments/${deployment.id}/statuses`, {
    state: 'in_progress',
    description: 'Starting the separately approved prepared release',
    environment: 'staging',
  });
  try {
    if ((await api('GET', '/commits/main')).sha !== approval.sourceSha)
      refuse();
    await verifyActiveRun(api, String(request.runId), proof, approval);
    // GitHub evidence reads may be slow. Expiration is enforced at execution,
    // not merely when the request first entered the queue.
    validateRequest(deployment, approval, Date.now());
    verifyProof(
      request.oidcProof,
      jwks,
      {
        sourceSha: approval.sourceSha,
        runId: String(request.runId),
        allowedActors: approval.allowedActorIds,
        operation: approval.operation,
        manifestSha256: approval.manifestSha256,
        approvedAt: approval.approvedAt,
      },
      Date.now() / 1000,
    );
    const result = await launch(manifestFile);
    const receipt = privateJson(
      path.join(stateRoot, approval.operation, 'state.json'),
      uid,
    ).value;
    if (result !== 0 || receipt.stage !== 'HEALTHY') refuse();
    record.state = 'HEALTHY';
  } catch {
    record.state = 'INSPECTION_REQUIRED';
  }
  record.completedAt = Date.now();
  // Existing private file, not a rename through a user-controlled path.
  writeFileSync(latch, JSON.stringify(record), { mode: 0o600 });
  await api('POST', `/deployments/${deployment.id}/statuses`, {
    state: record.state === 'HEALTHY' ? 'success' : 'failure',
    description:
      record.state === 'HEALTHY'
        ? 'Prepared release passed server health checks'
        : 'Stopped or unknown result; operator inspection required',
    environment: 'staging',
  });
  return record.state;
}

export async function processQueue(deployments, approval, options) {
  const { api, receiptDir, uid = process.getuid(), now = Date.now() } = options;
  if (!operation.test(approval.operation)) refuse();
  const saved = path.join(receiptDir, approval.operation + '.json');
  if ((await import('node:fs')).existsSync(saved)) {
    const receipt = privateJson(saved, uid).value;
    if (
      receipt.operation !== approval.operation ||
      receipt.sourceSha !== approval.sourceSha ||
      !numeric.test(receipt.deploymentId)
    )
      refuse();
    const desired = receipt.state === 'HEALTHY' ? 'success' : 'failure';
    const statuses = await api(
      'GET',
      `/deployments/${receipt.deploymentId}/statuses?per_page=1`,
    );
    if (
      statuses.find((x) => x.creator?.id === Number(ownerId))?.state !== desired
    )
      await api('POST', `/deployments/${receipt.deploymentId}/statuses`, {
        state: desired,
        description:
          desired === 'success'
            ? 'Prepared release passed server health checks'
            : 'Stopped or unknown result; operator inspection required',
        environment: 'staging',
      });
    return 'RECONCILED';
  }
  if (approval.expiresAt <= now) return 'IDLE';
  if (!Array.isArray(deployments)) refuse();
  const matching = deployments
    .filter(
      (x) =>
        x.task === 'deploy:prepared-staging' &&
        x.payload?.operation === approval.operation &&
        x.sha === approval.sourceSha &&
        Date.parse(x.created_at) >= approval.approvedAt,
    )
    .sort((a, b) => a.id - b.id);
  for (const deployment of matching) {
    try {
      return await handleDeployment(deployment, approval, options);
    } catch {
      if ((await import('node:fs')).existsSync(saved))
        return 'INSPECTION_REQUIRED';
    }
  }
  return 'NO_VALID_REQUEST';
}

async function boundedJson(response, maximum) {
  if (!response.ok) refuse();
  let size = 0;
  const chunks = [];
  for await (const part of response.body) {
    size += part.length;
    if (size > maximum) refuse();
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createGitHubApi(token, fetcher = globalThis.fetch) {
  return async (method, route, body) => {
    if (
      !['GRAPHQL', 'IDENTITY'].includes(method) &&
      (!route.startsWith('/') || route.includes('..'))
    )
      refuse();
    const response = await fetcher(
      method === 'IDENTITY'
        ? 'https://api.github.com/user'
        : method === 'GRAPHQL'
          ? 'https://api.github.com/graphql'
          : `https://api.github.com/repos/${repository}${route}`,
      {
        method:
          method === 'GRAPHQL'
            ? 'POST'
            : method === 'IDENTITY'
              ? 'GET'
              : method,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return boundedJson(response, 2 * 1024 * 1024);
  };
}

export async function runOnce(configFile) {
  if (process.getuid() !== 0) refuse();
  const config = privateJson(configFile, 0).value;
  if (
    config.schemaVersion !== 1 ||
    config.repository !== repository ||
    config.root !== '/opt/digital-autograph' ||
    config.stateRoot !== '/var/lib/digital-autograph/manual' ||
    config.receiptDir !== '/var/lib/digital-autograph/github-controller' ||
    config.approvalFile !==
      '/etc/digital-autograph/github-approved-operation.json' ||
    config.tokenFile !== '/etc/digital-autograph/github-deployment-token'
  )
    refuse();
  // Missing approval is the normal idle state. It never freezes a running site.
  if (!(await import('node:fs')).existsSync(config.approvalFile)) return 'IDLE';
  const approvedFile = privateJson(config.approvalFile, 0);
  const approval = approvedFile.value;
  if (
    operation.test(approval.operation) &&
    approval.expiresAt <= Date.now() &&
    !(await import('node:fs')).existsSync(
      path.join(config.receiptDir, approval.operation + '.json'),
    )
  )
    return 'IDLE';
  privatePath(config.tokenFile, false, 0);
  const token = readFileSync(config.tokenFile, 'utf8').trim();
  if (!/^github_pat_[A-Za-z0-9_]{20,250}$/.test(token)) refuse();
  const api = createGitHubApi(token);
  const identity = await api('IDENTITY', '');
  if (String(identity.id) !== ownerId) refuse();
  const deployments = await api(
    'GET',
    '/deployments?environment=staging&per_page=20',
  );
  const jwks = await boundedJson(
    await globalThis.fetch(issuer + '/.well-known/jwks', {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10000),
    }),
    65536,
  );
  mkdirSync(config.receiptDir, { recursive: true, mode: 0o700 });
  const launch = (manifestFile) => {
    if (
      digest(privateJson(config.approvalFile, 0).bytes) !==
      digest(approvedFile.bytes)
    )
      refuse();
    const tool = '/opt/digital-autograph/manual-deploy.mjs';
    privatePath(tool, false, 0, false);
    if (digest(readFileSync(tool)) !== approval.manualToolSha256) refuse();
    const child = spawnSync('/usr/bin/node', [tool, 'start', manifestFile], {
      timeout: 540000,
      stdio: 'ignore',
      env: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
    });
    return child.status;
  };
  return processQueue(deployments, approval, {
    api,
    jwks,
    root: config.root,
    stateRoot: config.stateRoot,
    receiptDir: config.receiptDir,
    uid: 0,
    launch,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 3) refuse();
    console.log(
      JSON.stringify({
        event: 'PREPARED_DEPLOYMENT_CONTROLLER',
        state: await runOnce(process.argv[2]),
      }),
    );
  } catch {
    // No token, GitHub payload, command output, DB URL or exception text in logs.
    console.error(
      'Prepared deployment refused; inspect private receipt and operator approval.',
    );
    process.exitCode = 1;
  }
}
