import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('rejects an input pipe with no writer', () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytics-cli-'));
  try {
    const input = join(directory, 'input.jsonl');
    const pipe = spawnSync('mkfifo', [input], { timeout: 1_000 });
    expect(pipe.status).toBe(0);

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/product-analytics-report.mts',
        '--client',
        input,
        '--from',
        '2026-01-01T00:00:00.000Z',
        '--to',
        '2026-01-02T00:00:00.000Z',
      ],
      {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        timeout: 3_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Analytics report failed');
    expect(result.stderr).not.toContain(input);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 6_000);
