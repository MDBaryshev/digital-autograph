// Operator-only final authorization, never callable from a GitHub request.
import {
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import {
  digest,
  loadPrepared,
  privatePath,
} from './github-staging-controller.mjs';

try {
  const [mode, operation, sourceSha] = process.argv.slice(2);
  if (
    process.getuid() !== 0 ||
    process.argv.length !== 5 ||
    mode !== '--approve' ||
    !/^[a-z0-9][a-z0-9-]{7,63}$/.test(operation) ||
    !/^[a-f0-9]{40}$/.test(sourceSha)
  )
    throw Error();
  const root = '/opt/digital-autograph';
  const manifestFile = path.join(root, 'incoming', operation, 'manifest.json');
  privatePath(manifestFile, false, 0);
  const tool = root + '/manual-deploy.mjs';
  privatePath(tool, false, 0, false);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const approval = {
    schemaVersion: 1,
    operation,
    sourceSha,
    manifestSha256: digest(readFileSync(manifestFile)),
    manualToolSha256: digest(readFileSync(tool)),
    allowedActorIds: ['118826513', '210857445'],
    approvedAt: now,
    expiresAt: now + 15 * 60 * 1000,
  };
  loadPrepared(approval, root, '/var/lib/digital-autograph/manual', 0);
  privatePath('/etc/digital-autograph', true, 0);
  const fd = openSync(
    '/etc/digital-autograph/github-approved-operation.json',
    'wx',
    0o600,
  );
  try {
    writeFileSync(fd, JSON.stringify(approval));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  console.log(
    JSON.stringify({
      operation,
      sourceSha,
      manifestSha256: approval.manifestSha256,
      expiresAt: new Date(approval.expiresAt).toISOString(),
    }),
  );
} catch {
  console.error(
    'Approval refused. Requires a new MIGRATED operation, exact source and private operator files; existing approvals are never overwritten.',
  );
  process.exitCode = 1;
}
