import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  analyticsLimits,
  analyzeProductAnalytics,
  AnalyticsInputError,
} from '../packages/analytics/src/index';
import type { ProductAnalyticsSource } from '../packages/contracts/src/product-analytics';

const usage =
  'Usage: pnpm analytics:report --client client.jsonl --server server.jsonl --from <UTC ISO timestamp> --to <UTC ISO timestamp>\n' +
  'Supply 1–4 explicitly labelled input files. Window is [from, to). No collection or financial verification is performed.\n';

async function readBounded(path: string, remaining: number) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > remaining)
      throw new AnalyticsInputError();
    // Bound the read itself, including a file growing after stat().
    const bytes = Buffer.alloc(remaining + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > remaining) throw new AnalyticsInputError();
    return {
      contents: new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(0, length),
      ),
      bytes: length,
    };
  } finally {
    await handle.close();
  }
}

export async function runProductAnalyticsReport(args: string[]) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(usage);
    return 0;
  }
  try {
    let from: string | undefined;
    let to: string | undefined;
    const files: { source: ProductAnalyticsSource; path: string }[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new AnalyticsInputError();
      if (flag === '--from' && !from) from = value;
      else if (flag === '--to' && !to) to = value;
      else if (flag === '--client' || flag === '--server')
        files.push({
          source: flag === '--client' ? 'client' : 'server',
          path: value,
        });
      else throw new AnalyticsInputError();
    }
    if (
      !from ||
      !to ||
      !files.length ||
      files.length > analyticsLimits.inputFiles
    )
      throw new AnalyticsInputError();

    const inputs: { source: ProductAnalyticsSource; contents: string }[] = [];
    let remaining: number = analyticsLimits.inputBytes;
    for (const file of files) {
      const input = await readBounded(file.path, remaining);
      remaining -= input.bytes;
      inputs.push({ source: file.source, contents: input.contents });
    }
    const report = analyzeProductAnalytics(inputs, { from, to });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.quality.invalidRows || report.quality.conflictingRows ? 1 : 0;
  } catch {
    // Neither filesystem errors nor validation errors may echo paths or rows.
    process.stderr.write(
      'Analytics report failed: check arguments, input encoding, limits and file access.\n' +
        usage,
    );
    return 2;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await runProductAnalyticsReport(process.argv.slice(2));
