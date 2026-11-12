import {
  productAnalyticsClientEvents,
  productAnalyticsServerEvents,
  productAnalyticsClientEventSchema,
  productAnalyticsServerEventSchema,
  type ProductAnalyticsClientEvent,
  type ProductAnalyticsServerEvent,
  type ProductAnalyticsEventName,
  type ProductAnalyticsSource,
} from '@digital-autograph/contracts';

export const analyticsLimits = {
  inputFiles: 4,
  inputBytes: 16 * 1024 * 1024,
  lineBytes: 4096,
  records: 50_000,
  lines: 100_000,
  diagnostics: 20,
} as const;

export class AnalyticsInputError extends Error {
  constructor() {
    super(
      'Analytics input or window is invalid or exceeds the documented limits.',
    );
  }
}

type Event = (ProductAnalyticsClientEvent | ProductAnalyticsServerEvent) & {
  source: ProductAnalyticsSource;
};
type Diagnostic = {
  input: number;
  line: number;
  code: 'invalid_json' | 'invalid_event' | 'conflicting_event_id';
};
type Stage = {
  name: string;
  events: readonly ProductAnalyticsEventName[];
};

const productAnalyticsFunnels: Record<string, readonly Stage[]> = {
  participation: [
    { name: 'viewed', events: ['wall_view'] },
    { name: 'signature_confirmed', events: ['signature_confirmed'] },
    { name: 'placed', events: ['free_claimed', 'takeover_completed'] },
  ],
  checkout: [
    { name: 'clicked', events: ['takeover_clicked'] },
    { name: 'quoted', events: ['quote_created'] },
    { name: 'reserved', events: ['reservation_created'] },
    { name: 'payment_started', events: ['payment_started'] },
    { name: 'payment_reported_successful', events: ['payment_success'] },
    { name: 'takeover_completed', events: ['takeover_completed'] },
  ],
};

// Validate the entire envelope before any identifiers can affect a report.
// Source is supplied separately, so a client row cannot opt into server events.
export function analyzeProductAnalytics(
  inputs: readonly { source: ProductAnalyticsSource; contents: string }[],
  window: { from: string; to: string },
) {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const timestamp = productAnalyticsClientEventSchema.shape.occurredAt;
  if (
    !timestamp.safeParse(window.from).success ||
    !timestamp.safeParse(window.to).success ||
    from >= to ||
    inputs.length === 0 ||
    inputs.length > analyticsLimits.inputFiles
  )
    throw new AnalyticsInputError();

  const quality = {
    inputRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    conflictingIdentities: 0,
    conflictingRows: 0,
    outsideWindowRows: 0,
  };
  const diagnostics: Diagnostic[] = [];
  function diagnose(input: number, line: number, code: Diagnostic['code']) {
    if (diagnostics.length < analyticsLimits.diagnostics)
      diagnostics.push({ input, line, code });
  }
  const groups = new Map<
    string,
    {
      event: Event;
      serialized: string;
      copies: number;
      conflict: boolean;
      input: number;
      line: number;
    }
  >();
  let inputBytes = 0;
  let physicalLines = 0;
  const encoder = new TextEncoder();
  for (const [inputIndex, input] of inputs.entries()) {
    if (input.source !== 'client' && input.source !== 'server')
      throw new AnalyticsInputError();
    inputBytes += encoder.encode(input.contents).byteLength;
    if (inputBytes > analyticsLimits.inputBytes)
      throw new AnalyticsInputError();
    const schema =
      input.source === 'client'
        ? productAnalyticsClientEventSchema
        : productAnalyticsServerEventSchema;
    // Avoid allocating millions of array entries for a file of blank lines.
    let offset = 0;
    let lineIndex = 0;
    while (offset < input.contents.length) {
      const end = input.contents.indexOf('\n', offset);
      const line = input.contents.slice(offset, end < 0 ? undefined : end);
      offset = end < 0 ? input.contents.length : end + 1;
      lineIndex++;
      if (++physicalLines > analyticsLimits.lines)
        throw new AnalyticsInputError();
      if (encoder.encode(line).byteLength > analyticsLimits.lineBytes)
        throw new AnalyticsInputError();
      if (!line.trim()) continue;
      if (++quality.inputRows > analyticsLimits.records)
        throw new AnalyticsInputError();
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        quality.invalidRows++;
        diagnose(inputIndex + 1, lineIndex, 'invalid_json');
        continue;
      }
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        quality.invalidRows++;
        diagnose(inputIndex + 1, lineIndex, 'invalid_event');
        continue;
      }
      const event = { ...parsed.data, source: input.source };
      const identity = `${input.source}:${event.eventId}`;
      const serialized = JSON.stringify(event);
      const existing = groups.get(identity);
      if (existing) {
        existing.copies++;
        existing.conflict ||= existing.serialized !== serialized;
      } else {
        groups.set(identity, {
          event,
          serialized,
          copies: 1,
          conflict: false,
          input: inputIndex + 1,
          line: lineIndex,
        });
      }
    }
  }

  const accepted: Event[] = [];
  for (const group of groups.values()) {
    if (group.conflict) {
      quality.conflictingIdentities++;
      quality.conflictingRows += group.copies;
      diagnose(group.input, group.line, 'conflicting_event_id');
      continue;
    }
    quality.duplicateRows += group.copies - 1;
    const at = Date.parse(group.event.occurredAt);
    if (at < from || at >= to) quality.outsideWindowRows++;
    else accepted.push(group.event);
  }

  const names = [
    ...productAnalyticsClientEvents,
    ...productAnalyticsServerEvents,
  ];
  const eventCounts = Object.fromEntries(
    names.map((name) => [name, 0]),
  ) as Record<ProductAnalyticsEventName, number>;
  const eventJourneys = new Map(names.map((name) => [name, new Set<string>()]));
  const journeys = new Map<string, Event[]>();
  for (const event of accepted) {
    // Wall-local journeys cannot complete another Wall's funnel.
    const key = `${event.wallKey}:${event.journeyKey}`;
    eventCounts[event.name]++;
    eventJourneys.get(event.name)!.add(key);
    const journey = journeys.get(key) ?? [];
    journey.push(event);
    journeys.set(key, journey);
  }
  for (const journey of journeys.values())
    journey.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const funnels = Object.fromEntries(
    Object.entries(productAnalyticsFunnels).map(([name, stages]) => {
      const counts = stages.map(() => 0);
      for (const journey of journeys.values()) {
        let cursor = '';
        for (const [index, stage] of stages.entries()) {
          const next = journey.find(
            (event) =>
              event.occurredAt >= cursor && stage.events.includes(event.name),
          );
          if (!next) break;
          counts[index] = counts[index]! + 1;
          cursor = next.occurredAt;
        }
      }
      return [
        name,
        stages.map((stage, index) => {
          const observed = new Set(
            stage.events.flatMap((event) => [...eventJourneys.get(event)!]),
          ).size;
          return {
            stage: stage.name,
            observedJourneys: observed,
            journeysWithoutObservedPrefix: observed - counts[index]!,
            journeys: counts[index]!,
            // First-stage journeys in this same ordered funnel are the denominator.
            fractionOfEntrants: counts[0] ? counts[index]! / counts[0] : null,
          };
        }),
      ];
    }),
  );

  return {
    schemaVersion: 1,
    provenance: 'operator_supplied_exports',
    financialVerification: 'not_performed',
    window: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
    acceptedEvents: accepted.length,
    observedWallJourneys: journeys.size,
    events: names.map((name) => ({
      name,
      source: productAnalyticsClientEvents.includes(
        name as ProductAnalyticsClientEvent['name'],
      )
        ? 'client'
        : 'server',
      events: eventCounts[name],
      observedWallJourneys: eventJourneys.get(name)!.size,
    })),
    funnels,
    quality,
    diagnostics,
  };
}
