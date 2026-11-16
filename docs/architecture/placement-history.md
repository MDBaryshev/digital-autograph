# Placement history read models

Placement history is derived directly from immutable `placements` rows;
current placements have `ended_at IS NULL`. Read paths do not introduce or
update a separate history table and do not participate in takeover, claim, or
payment writes.

`GET /walls/:id/placements` is public only while the Wall is public
(`scheduled`, `live`, `paused`, or `ended`). It returns the Slot position,
Placement source, start/end timestamps, and a safe end-reason category. It
never returns claimant IDs, Autograph IDs, Placement IDs, moderation evidence,
or storage keys. Unknown internal end reasons are mapped to `other`; only
recognized categories such as `displaced`, `wall_ended`, and `administrative`
are exposed. Responses are `no-store`.

`GET /me/placements` requires the normal authenticated session and filters in
PostgreSQL by that session's User ID. It returns only the caller's recent 100
placements, including records from archived Walls, with Wall display
information and the same safe reason category. The private read model adds
`wallIsPublic`, a boolean derived from the public Wall statuses. The UI links
to public Walls only; archived/private Wall names remain text. This boolean
is not included in public Wall history. It does not accept an arbitrary User ID. Both views order history by
`started_at` descending and use the same persisted Placement records, including
Free Claims and future takeover placements.

The public Wall includes a read-only history list inside its single page
landmark. Manual Wall refresh and refresh after a successful claim increment
a history version token to reload the list without polling. `/me/placements` presents
the current and completed placements for the signed-in User; anonymous users
are offered the existing Google and Telegram return flow. No Placement writer
or ownership rule is changed by this feature.

The public history view is scoped to API origin, Wall ID and refresh version.
Changing any of these discards the previous list before another read completes;
a failed refresh never retains an old current-placement label. Private history
similarly resets before a changed API origin is queried. Abandoned reads are
canceled and late responses cannot populate a newer view.

Each history/session GET has a ten-second budget, including JSON reading where
needed, even if the transport ignores abort. A failed read uses the explicit
retry UI without automatic requests or writes; private retries recheck the
session and a 401 clears the private list. Response validation checks the bounded
100-row projection, required field types and dates, and the requested public
Wall ID before displaying any rows. All data still comes from the authoritative
backend read model; these UI checks do not grant ownership or placement rights.
