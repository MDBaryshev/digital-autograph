import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  productAnalyticsClientEventSchema,
  productAnalyticsServerEventSchema,
  type ProductAnalyticsEventName,
  type ProductAnalyticsSource,
} from '@digital-autograph/contracts';
import { analyticsLimits, analyzeProductAnalytics } from './index';

const window = { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' };
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const wallKey = uuid(1);
const journeyKey = uuid(2);
function event(name: ProductAnalyticsEventName, id = 10, second = 1) {
  return {
    schemaVersion: 1,
    eventId: uuid(id),
    occurredAt: `2026-11-01T00:00:${second.toString().padStart(2, '0')}Z`,
    wallKey,
    journeyKey,
    name,
  };
}
function input(source: ProductAnalyticsSource, rows: unknown[]) {
  return {
    source,
    contents: rows.map((row) => JSON.stringify(row)).join('\n'),
  };
}
const analyze = (inputs: Parameters<typeof analyzeProductAnalytics>[0]) =>
  analyzeProductAnalytics(inputs, window);

describe('product analytics export boundary', () => {
  it('rejects server facts in client exports, including a claimed server source', () => {
    for (const name of [
      'payment_success',
      'free_claimed',
      'takeover_completed',
    ] as const) {
      expect(
        productAnalyticsClientEventSchema.safeParse(event(name)).success,
      ).toBe(false);
      expect(
        productAnalyticsClientEventSchema.safeParse({
          ...event(name),
          source: 'server',
        }).success,
      ).toBe(false);
    }
    expect(
      productAnalyticsServerEventSchema.safeParse(event('wall_view')).success,
    ).toBe(false);
  });

  it.each([
    { userId: uuid(3) },
    { email: 'synthetic@example.invalid' },
    { ip: '192.0.2.1' },
    { properties: { signature: 'private synthetic bytes' } },
    { amountMinor: 8900 },
    { storageKey: 'private/synthetic-original' },
    { providerPaymentId: 'synthetic-payment' },
    { url: 'https://example.invalid/?token=synthetic' },
  ])('rejects data outside the export allowlist: %j', (extra) => {
    expect(
      productAnalyticsClientEventSchema.safeParse({
        ...event('wall_view'),
        ...extra,
      }).success,
    ).toBe(false);
    expect(
      productAnalyticsServerEventSchema.safeParse({
        ...event('payment_success'),
        ...extra,
      }).success,
    ).toBe(false);
  });

  it.each([
    { schemaVersion: 2 },
    { eventId: 'not-an-id' },
    { journeyKey: '' },
    { wallKey: 'a-wall' },
    { occurredAt: '2026-11-01' },
    { occurredAt: '2026-11-01T00:00:00+03:00' },
    { occurredAt: '2026-02-30T00:00:00Z' },
    { name: 'unknown_event' },
  ])('rejects malformed envelopes: %j', (change) => {
    expect(
      productAnalyticsClientEventSchema.safeParse({
        ...event('wall_view'),
        ...change,
      }).success,
    ).toBe(false);
  });
});

describe('offline funnel report', () => {
  it('joins an unordered export, deduplicates replay, and separates payment from fulfillment', () => {
    const clients = [
      event('wall_view', 10, 1),
      event('takeover_clicked', 11, 3),
      event('payment_started', 12, 6),
    ];
    const servers = [
      event('signature_confirmed', 20, 2),
      event('quote_created', 21, 4),
      event('reservation_created', 22, 5),
      event('payment_success', 23, 7),
      event('takeover_completed', 24, 8),
    ];
    const report = analyze([
      input('client', [...clients].reverse()),
      input('server', [...servers].reverse()),
      input('server', [servers[4]]),
    ]);
    expect(report.acceptedEvents).toBe(8);
    expect(report.quality.duplicateRows).toBe(1);
    expect(
      report.funnels.participation?.map((stage) => stage.journeys),
    ).toEqual([1, 1, 1]);
    expect(report.funnels.checkout?.map((stage) => stage.journeys)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
    expect(report.financialVerification).toBe('not_performed');
    expect(JSON.stringify(report)).not.toContain(wallKey);
    expect(JSON.stringify(report)).not.toContain(journeyKey);
    const unfulfilled = analyze([
      input('client', clients),
      input('server', servers.slice(0, -1)),
    ]);
    expect(unfulfilled.funnels.checkout?.at(-2)?.journeys).toBe(1);
    expect(unfulfilled.funnels.checkout?.at(-1)?.journeys).toBe(0);
    expect(unfulfilled.funnels.participation?.at(-1)?.journeys).toBe(0);
  });

  it('keeps raw milestone counts separate from chronological prefix conversion', () => {
    const report = analyze([
      input('client', [
        event('wall_view', 10, 2),
        event('wall_view', 11, 4),
        event('wall_view', 12, 4),
      ]),
      input('server', [
        event('signature_confirmed', 20, 1),
        event('free_claimed', 21, 3),
      ]),
    ]);
    expect(
      report.funnels.participation?.map((stage) => stage.journeys),
    ).toEqual([1, 0, 0]);
    expect(report.events.find((row) => row.name === 'wall_view')).toMatchObject(
      { events: 3, observedWallJourneys: 1 },
    );
    expect(
      report.events.find((row) => row.name === 'free_claimed')?.events,
    ).toBe(1);
    expect(report.funnels.participation?.[1]).toMatchObject({
      observedJourneys: 1,
      journeysWithoutObservedPrefix: 1,
    });
  });

  it('handles retries after an earlier out-of-order confirmation and equal timestamps', () => {
    const report = analyze([
      input('client', [event('wall_view', 10, 2)]),
      input('server', [
        event('signature_confirmed', 20, 1),
        event('signature_confirmed', 21, 3),
        event('free_claimed', 22, 3),
      ]),
    ]);
    expect(
      report.funnels.participation?.map((stage) => stage.journeys),
    ).toEqual([1, 1, 1]);
  });

  it('never joins stages across Walls or journeys', () => {
    const report = analyze([
      input('client', [event('wall_view')]),
      input('server', [
        { ...event('signature_confirmed', 20, 2), wallKey: uuid(5) },
        { ...event('signature_confirmed', 21, 2), journeyKey: uuid(6) },
        event('free_claimed', 22, 3),
      ]),
    ]);
    expect(report.observedWallJourneys).toBe(3);
    expect(
      report.funnels.participation?.map((stage) => stage.journeys),
    ).toEqual([1, 0, 0]);
  });

  it('quarantines all conflicting replays regardless of input order', () => {
    const first = event('wall_view');
    const changed = { ...first, wallKey: uuid(5) };
    for (const rows of [
      [first, changed, first],
      [changed, first, first],
    ]) {
      const report = analyze([input('client', rows)]);
      expect(report.acceptedEvents).toBe(0);
      expect(report.quality).toMatchObject({
        conflictingRows: 3,
        conflictingIdentities: 1,
        duplicateRows: 0,
      });
      expect(report.diagnostics[0]?.code).toBe('conflicting_event_id');
    }
  });

  it('compares normalized timestamps and property order for exact replay', () => {
    const first = event('wall_view');
    const reordered = {
      name: first.name,
      journeyKey: first.journeyKey,
      wallKey: first.wallKey,
      occurredAt: '2026-11-01T00:00:01.000Z',
      eventId: first.eventId,
      schemaVersion: first.schemaVersion,
    };
    const report = analyze([input('client', [first, reordered])]);
    expect(report.acceptedEvents).toBe(1);
    expect(report.quality.duplicateRows).toBe(1);
  });

  it('canonicalizes UUID case before replay and journey grouping', () => {
    const first = {
      ...event('wall_view'),
      eventId: 'abcdef00-0000-4000-8000-000000000001',
      journeyKey: 'abcdef00-0000-4000-8000-000000000002',
    };
    const replay = {
      ...first,
      eventId: first.eventId.toUpperCase(),
      journeyKey: first.journeyKey.toUpperCase(),
    };
    const report = analyze([input('client', [first, replay])]);
    expect(report.acceptedEvents).toBe(1);
    expect(report.quality.duplicateRows).toBe(1);
    expect(report.observedWallJourneys).toBe(1);
  });

  it('isolates client event IDs from server IDs and counts schema-spoofing rows as invalid', () => {
    const report = analyze([
      input('client', [event('wall_view'), event('payment_success', 11)]),
      input('server', [event('signature_confirmed', 10, 2)]),
    ]);
    expect(report.acceptedEvents).toBe(2);
    expect(report.quality.invalidRows).toBe(1);
    expect(report.quality.conflictingIdentities).toBe(0);
    expect(
      report.funnels.participation?.map((stage) => stage.journeys),
    ).toEqual([1, 1, 0]);
  });

  it('uses a half-open UTC window and preserves null fractions without entrants', () => {
    const report = analyze([
      input('server', [
        { ...event('free_claimed'), occurredAt: window.from },
        { ...event('free_claimed', 11), occurredAt: window.to },
        { ...event('free_claimed', 12), occurredAt: '2026-10-31T23:59:59Z' },
      ]),
    ]);
    expect(report.acceptedEvents).toBe(1);
    expect(report.quality.outsideWindowRows).toBe(2);
    expect(
      report.funnels.participation?.every(
        (stage) => stage.fractionOfEntrants === null,
      ),
    ).toBe(true);
  });

  it('reports only bounded generic diagnostics, never payloads or schema paths', () => {
    const contents =
      '\n' +
      Array.from(
        { length: 30 },
        () => '{"private":"synthetic-not-for-output"',
      ).join('\n');
    const report = analyze([{ source: 'client', contents }]);
    expect(report.quality.invalidRows).toBe(30);
    expect(report.diagnostics).toHaveLength(analyticsLimits.diagnostics);
    expect(report.diagnostics[0]).toEqual({
      input: 1,
      line: 2,
      code: 'invalid_json',
    });
    expect(JSON.stringify(report)).not.toContain('synthetic-not-for-output');
  });

  it('rejects invalid windows and bounded-input violations', () => {
    const valid = input('client', [event('wall_view')]);
    expect(() =>
      analyze([
        { source: 'client', contents: '\n'.repeat(analyticsLimits.lines + 1) },
      ]),
    ).toThrow();
    expect(() =>
      analyzeProductAnalytics([valid], { from: window.to, to: window.from }),
    ).toThrow();
    expect(() =>
      analyzeProductAnalytics([valid], { from: 'not-a-date', to: window.to }),
    ).toThrow();
    expect(() => analyze([])).toThrow();
    expect(() => analyze(Array.from({ length: 5 }, () => valid))).toThrow();
    expect(() =>
      analyze([
        {
          source: 'client',
          contents: 'я'.repeat(analyticsLimits.lineBytes / 2 + 1),
        },
      ]),
    ).toThrow();
    expect(() =>
      analyze([
        {
          source: 'client',
          contents: 'x\n'.repeat(analyticsLimits.records + 1),
        },
      ]),
    ).toThrow();
    expect(() =>
      analyze([
        {
          source: 'client',
          contents: ' '.repeat(analyticsLimits.inputBytes + 1),
        },
      ]),
    ).toThrow();
  });
});

describe('analytics CLI', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  function run(args: string[]) {
    return spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/product-analytics-report.mts', ...args],
      { cwd: root, encoding: 'utf8', timeout: 15_000 },
    );
  }
  const flags = ['--from', window.from, '--to', window.to];
  it('runs the actual command and returns nonzero for invalid records without leaking them', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'analytics-cli-'));
    try {
      const file = path.join(dir, 'synthetic-private-export.jsonl');
      writeFileSync(
        file,
        JSON.stringify(event('wall_view')) +
          '\n{"private":"synthetic-not-for-output"}\n',
      );
      const result = run(['--client', file, ...flags]);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      const report = JSON.parse(result.stdout);
      expect(report.acceptedEvents).toBe(1);
      expect(report.quality.invalidRows).toBe(1);
      expect(result.stdout).not.toContain(file);
      expect(result.stdout).not.toContain('synthetic-not-for-output');
      writeFileSync(file, JSON.stringify(event('wall_view')));
      expect(run(['--client', file, ...flags]).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid UTF-8, oversized files, missing files and unknown options safely', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'analytics-cli-'));
    try {
      const file = path.join(dir, 'synthetic-private-export.jsonl');
      for (const contents of [
        Buffer.from([0xc3, 0x28]),
        Buffer.alloc(analyticsLimits.inputBytes + 1),
      ]) {
        writeFileSync(file, contents);
        const result = run(['--client', file, ...flags]);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain(file);
      }
      for (const args of [
        [],
        ['--client', path.join(dir, 'missing-file'), ...flags],
        ['--unsafe', 'synthetic-private-value', ...flags],
        ['--client', file, ...flags, ...flags],
      ]) {
        const result = run(args);
        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain('synthetic-private-value');
        expect(result.stderr).not.toContain(dir);
      }
      expect(run(['--help']).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
