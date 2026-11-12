# Product analytics export foundation — EGO-187 / EGO-112

This first EGO-112 slice supplies versioned export contracts and a bounded offline
report, not runtime instrumentation. `packages/contracts` owns the strict Zod
schemas; `packages/analytics` owns the pure report calculation; the root
`analytics:report` command reads operator-selected local UTF-8 JSONL files.
No API, DB migration, cookies, external analytics provider or automatic collection
is introduced. EGO-67's launch thresholds and EGO-112's live instrumentation,
retention/consent decisions and dashboards remain separate work.

## Input and provenance

Each nonblank JSONL line has exactly these fields:

- `schemaVersion`: `1`.
- `eventId`: UUID, stable for one event across retries and overlapping exports.
- `occurredAt`: UTC ISO timestamp with `Z`, normalized to millisecond precision.
- `wallKey`: export-local UUID pseudonym for a Wall.
- `journeyKey`: export-local UUID pseudonym for a journey scoped to a Wall.
- `name`: a name from the source-specific catalog below.

UUIDs are normalized to lowercase before comparison.

Exporters must use a consistent Wall/journey mapping across files in one report.
Journey counts are not unique people, authenticated accounts or buyers. Keys must
not be raw User, Autograph, Reservation, Order or provider identities. UUID shape
validation cannot verify correct pseudonymization; pseudonymous data still needs
an approved purpose, access, consent/legal basis and retention process. This PR
does not approve a real-data export. Use synthetic fixtures until those processes
and the exporters are reviewed.

Do not export originals, storage keys, signed URLs, free text, IPs, email, OAuth
identities, provider IDs, user-agent, referrer/query strings, monetary amounts or
arbitrary properties. Unknown fields are rejected rather than stripped.

The operator labels each file using `--client` or `--server`. A row has no `source`
field and cannot opt into server event names from a client file. **A server label
does not authenticate the exporter or verify a payment.** File provenance must
be established outside this tool. Reports declare `operator_supplied_exports`
and `financialVerification: not_performed`; they cannot authorize money,
ownership, fulfillment, eligibility, ledger entries or refunds.

## Version 1 catalog

Client observations/intent:

- `wall_view`: a displayed Wall; repeated renders must not become new events.
- `auth_started`: explicit sign-in attempt.
- `signature_started`: explicit autograph creation entry.
- `takeover_clicked`: explicit paid-entry intent.
- `payment_started`: opening the hosted checkout, not verified payment success.
- `share_clicked`: explicit share action, not a confirmed social post.
- `notification_opened`: an observed open, not delivery or payment evidence.

Server-exported observations, after the relevant committed state is confirmed:

- `auth_completed`: completed authentication.
- `signature_uploaded`: verified upload completion, not an upload URL grant.
- `signature_processed`: successful processing, not approval/publication.
- `signature_confirmed`: persisted owner confirmation, not moderation approval.
- `free_claimed`: committed free placement.
- `quote_created`: persisted quote, not eligibility at a later time.
- `reservation_created`: committed reservation, not payment or fulfillment.
- `payment_success`: provider-verified payment recorded by the backend; it can
  still be paid-but-not-fulfilled.
- `payment_failed`: backend-recorded terminal payment failure; not a network
  timeout, `UNKNOWN`, or frontend return-page result.
- `takeover_completed`: committed takeover and associated backend state.
- `displaced`: committed replacement of a prior Placement.
- `report_submitted`: committed moderation report.
- `creator_wall_created`, `creator_wall_launched`, `creator_wall_ended`: committed
  lifecycle transitions, not UI clicks.

This catalog is an integration contract, not evidence that these emitters exist.
Existing EGO-94 share interaction events and durable receipts remain unchanged;
they need an explicit adapter and provenance/pseudonymization review before export.
Financial writers remain higher priority than telemetry. Future instrumentation
must derive financial observations from committed backend evidence and must not
make successful payment/ownership transitions depend on an analytics sink.

## Report semantics

The requested window is `[from, to)` in UTC. Rows are validated before grouping.
Blank lines do not count as input rows. Valid timestamps are normalized before
replay comparison. An exact replay of `(file source, eventId)` counts once.
Conflicting payloads for that identity quarantine **all** its rows, irrespective
of input order or whether one variant falls outside the requested window. Source
namespaces are separate so a client ID cannot suppress a server observation.

`events` reports deduplicated in-window event counts and distinct observed
`(wallKey, journeyKey)` counts per name. These are milestone observations,
not funnel conversion. Different Walls or journeys never complete each other's
funnel, and exported keys never appear in the output.

Two ordered funnels are calculated per Wall journey:

1. Participation: `wall_view` → `signature_confirmed` → either `free_claimed` or
   `takeover_completed`.
2. Checkout: `takeover_clicked` → `quote_created` → `reservation_created` →
   `payment_started` → `payment_success` → `takeover_completed`.

For each stage, `journeys` counts journeys with the complete observed prefix in
nondecreasing timestamp order. Equal timestamps are allowed; input order is
irrelevant. Later retry events can complete a prefix when an earlier event cannot.
`fractionOfEntrants` divides that count by the first-stage count in the same
funnel, or is `null` when there are no entrants. It is a fraction, not a percentage.
`observedJourneys` counts that milestone even without the prefix, and
`journeysWithoutObservedPrefix` exposes the difference.

An absent/out-of-order prefix can mean a partial export, a window boundary,
missing instrumentation, clock skew, an earlier autograph or an invalid journey
mapping. It is not proof that a business transition was impossible. Existing
autograph users can place without a new `signature_confirmed` inside this window.
The participation funnel therefore measures the **observed autograph-preparation
path**, not all eligible users. Neither funnel includes external device/session
joins, unique-person retention or authenticated payer conversion. Compare reports
only with consistent collection/window/identity coverage. Financial success and
completed fulfillment remain separate stages; analytics is not accounting.

Quality counters partition nonblank rows into invalid, conflicting, exact
duplicate, unique outside-window and accepted rows. Only the first 20 diagnostics
are returned, containing input ordinal, line number and a fixed error code.
Counts are complete even when diagnostics are capped. No row values, paths,
keys, Zod error payloads or filesystem errors are printed.

## Running the synthetic example

```bash
pnpm analytics:report --client docs/product/examples/analytics-client.jsonl --server docs/product/examples/analytics-server.jsonl --from 2026-11-01T00:00:00Z --to 2026-11-02T00:00:00Z
```

The fixture is one synthetic Wall journey, eight events and one completed journey
in both funnels. It demonstrates the command; it measures no actual demand,
revenue, creator earnings, launch readiness or business threshold.

Limits: 1–4 regular UTF-8 files; 16 MiB total input bytes; 4096 UTF-8 bytes per
line; 50,000 nonblank records and 100,000 physical lines across files. Blank-line
inputs cannot bypass the work bound. Reads remain bounded if a file grows after its
initial size check. The process reads only the supplied files, makes no network
calls, writes JSON to stdout and persists no report. Redirected reports and source
files still require an operator-managed lifecycle; the command does not delete
or rotate them. Exit `0`: valid report; `1`: report contains invalid/conflicting
records; `2`: arguments, encoding, access or size-limit failure with generic stderr.

## Next integration slices

- EGO-67: agree metric denominators, cohort windows, minimum sample and decision
  thresholds with the owner; do not manufacture acceptance from this fixture.
- EGO-112: approve collection purpose, consent, pseudonymization, retention and
  exporter provenance; implement emitters with failure isolation and meaningful
  integration tests. Server labels alone are insufficient for a public endpoint.
- Add financial/reporting reconciliation only when the EGO-103 ledger exists.
  Amounts and provider identity do not belong in this version of the export.
