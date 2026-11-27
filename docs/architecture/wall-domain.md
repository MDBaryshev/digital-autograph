# Creator and Wall domain

## Ownership and boundaries

The authenticated User may manage a Creator only when `creators.owner_user_id` equals the session User ID. A null owner cannot use the ordinary owner API. The submitted Creator ID identifies the target; it is never authorization evidence. There is no admin bypass. HTTP validates requests in `packages/contracts`, `packages/walls` applies rules independently of frameworks, and `packages/db` owns SQL and transactions. The existing session guard and origin policy apply to mutations.

An account may own at most one Wall across all its Creator records and all Wall statuses, including archived. `walls.owner_user_id` is derived by PostgreSQL from the Creator, never trusted from caller input; a unique index enforces the account limit under concurrent inserts. Creator ownership changes synchronize this value and reject collisions. A second creation returns `WALL_ALREADY_EXISTS` (409). See [ADR 0011](../adr/0011-one-ten-place-wall-per-account.md).

The public Creator read returns ID, slug, display name, and visible Wall summaries. A Creator with no profile has no public page. Owner ID, account details, roles, and internal state are omitted.

## Lifecycle

Transitions are explicit owner actions. No background scheduler changes Wall status in this MVP.

```text
draft     --schedule--> scheduled --publish--> live --pause--> paused
draft     --publish----------------------------------> live
scheduled --unschedule--> draft
live      --end--> ended --archive--> archived
paused    --resume--> live
paused    --end--> ended
```

Precisely: `draft → scheduled/live`, `scheduled → draft/live`, `live → paused/ended`, `paused → live/ended`, `ended → archived`; `archived` is terminal. Repeating an action is rejected with `INVALID_WALL_TRANSITION` (409).

`startAt` and `endAt` are optional UTC instants. If both exist, end must be later than start. Scheduling requires a future start. Publishing or resuming requires that start is not in the future and end has not passed. These checks occur when the explicit action runs. A Wall that reaches its end time remains in its current persisted state until its owner ends it; later claim eligibility must check time independently. Draft configuration can be changed; scheduled configuration can be changed while its start remains in the future. Live and later configuration cannot be edited through this API.

## Public visibility

### Owner controls (EGO-188)

`/me/walls` exposes existing publish, unschedule, pause, resume, end and archive
actions through the authenticated owner API. The status-based button list is a
presentation hint; ownership, current state and start/end boundaries remain
backend decisions. Scheduling/date editing and automatic scheduling are separate.

Every action has an inline confirmation. Opening it focuses Cancel; Escape and
Cancel close it and restore the trigger's focus without sending a request. End
and archive describe their irreversible effect; archive preserves the account's
one-Wall limit. Pause/end warn that checkouts in progress may need support.

Only one request runs at a time. After a successful POST, the workspace is read
again before controls unlock. The transition response is not used to predict the
current status. A lost response, conflict or failed read locks mutation controls;
the separate Refresh Wall status button performs only a GET and never retries
the POST. Successful reads replace the owner workspace, including changed access.
Expired sessions link back to sign-in and first-use rejection links to the
existing explicit confirmation flow with `/me/walls` as the return location.
All requests retain credentials, no-store behavior and unmount cancellation. A
15-second operation budget aborts stalled POST/refresh requests and leaves the
same GET-only recovery path available.
No backend transition, database, payment, reservation or Placement writer changes
are introduced by these controls.

Workspace HTTP calls have a ten-second budget covering headers and JSON body,
including transports that ignore abort. Account profile saves and draft creation
keep write controls locked until a valid fresh workspace is read. After an
unconfirmed save or failed read, Refresh account status performs only a GET;
it never replays the write. Reads begun before the write are canceled, and late
responses cannot unlock controls or replace the recovered state. Owner preview
reads use the same bounded transport without replaying an upload or approval.

| State     | Public Wall                | Public Creator summary |
| --------- | -------------------------- | ---------------------- |
| draft     | 404                        | Omitted                |
| scheduled | Readable                   | Included               |
| live      | Readable                   | Included               |
| paused    | Readable                   | Included               |
| ended     | Readable, historical state | Included               |
| archived  | 404                        | Omitted                |

Public Wall data includes ordered Slot IDs and positions, an occupied flag derived from an active Placement, and an active Placement ID/source/start time where present. A valid active Placement with a ready, approved Autograph also receives a relative `mediaPath` based on Placement ID; inconsistent evidence leaves it `null` without changing occupancy. It excludes User IDs, Autograph IDs, storage keys, and all Placement mutation. The public read uses one joined query without fetching object bytes. See [public-wall-media.md](public-wall-media.md).

## Slot structure and consistency

New Walls pin the explicitly activated platform pricing version when one exists; existing Walls retain their pin. An unpriced Wall still supports Free Claim. See [pricing.md](pricing.md).

Every Wall has exactly ten positions. The creation request can omit `slotCount`; an explicit value is accepted only if it is 10. PostgreSQL inserts positions `0..9` atomically with the Wall, even for a direct SQL insertion. `slots.id` is stable identity; `position` is fixed ordering. Owners cannot resize at any lifecycle stage, even without placement history. Count/range checks, unique `(wall_id, position)`, automatic creation and guards against Slot deletion/movement keep the ten positions intact. A read or mutation still detects any inconsistent structure and fails instead of silently returning a partial result.

The workspace has one explicit creation action and no capacity input. Once a Wall exists, including an archived Wall, the creation action is hidden. The public view marks positions 1, 2 and 3 with gold, silver and bronze crown badges and borders; all other positions have a black border and numbered badge. Position, crown label and number remain accessible independently of color. These are presentation cues, not a recalculation of payment rank or ownership.

Migration 0025 first checks existing capacity/positions and duplicate account ownership under write-blocking table locks. Incompatible data aborts the migration without deleting or selecting Walls/Slots or changing placement/payment history. Review [the rollout instructions](../operations/fixed-wall-policy.md) before deployment.

Wall mutations lock the Wall and Creator rows, then Slot rows, evaluate the rule against the locked snapshot, and update in the same transaction. Competing lifecycle actions therefore observe serial states. Free Claim locks the Wall `FOR SHARE` and the selected Slot `FOR UPDATE` in the same order. Independent Slot claims can run concurrently while Wall lifecycle updates wait. The partial unique active Placement index remains the final database guard against duplicate active placements. See [free-claim.md](free-claim.md).

The service receives actor User ID and action explicitly, leaving a clear boundary for future audit events. No audit table exists yet. Wall owner mutations do not create Placements; the separate Free Claim operation creates them under the shared lock protocol.
