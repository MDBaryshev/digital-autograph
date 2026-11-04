# One Wall / ten places rollout

This change is stacked on the OpenRouter branch, after migration 0024; the fixed-capacity policy is migration 0025, for 26 migrations in total. Manual manifest validation recognizes 24-, 25- and 26-migration releases and still compares exact migration hashes/receipts. Prepare a new manifest from the accepted source and retain the ordinary backup/restore and release procedure. No server or existing data was changed by preparing the PR.

Before rollout, stop old API writers and run these read-only checks in the dedicated database:

```sql
SELECT w.id, w.slot_count, count(s.id) AS actual_places,
       min(s.position) AS first_position, max(s.position) AS last_position
FROM walls w LEFT JOIN slots s ON s.wall_id=w.id
GROUP BY w.id
HAVING w.slot_count<>10 OR count(s.id)<>10
    OR min(s.position)<>0 OR max(s.position)<>9;

SELECT c.owner_user_id, count(*) AS wall_count
FROM walls w JOIN creators c ON c.id=w.creator_id
WHERE c.owner_user_id IS NOT NULL
GROUP BY c.owner_user_id HAVING count(*)>1;
```

Both must return no rows. Archived and ended Walls count toward the account allowance. Keep output private because it contains internal identifiers. If either query finds incompatible data, migration 0025 raises `WALL_POLICY_MIGRATION_REQUIRES_REVIEW` and the transaction rolls back. Do not bypass it or delete excess Slots/Walls: first inspect placements, claims, pricing pins, quotes, reservations, orders and payment history, then obtain a concrete product/operator decision for those records. Never silently move paid or historical placements.

New Walls are inserted with exactly ten positions by the database trigger. The API requires no new grants: existing explicit Wall/Slot insert and row-lock permissions are sufficient. Four invoker trigger functions are added to the reviewed deployment preflight allowlist. They do not use SECURITY DEFINER or grant roles. Migration metadata/snapshot matches the new owner column, uniqueness and checks.

After applying the accepted release, verify one authenticated owner can create one draft with ten positions; concurrent/second creation, including through another Creator for the same user, returns 409. Verify arbitrary capacity is rejected and no quantity input appears. Confirm the same ten Slot IDs survive date/lifecycle edits, the first three positions have accessible podium markings, and ordinary private autograph selection, free claims and paid-placement consistency remain intact. Confirm the old writer processes are stopped before reopening traffic.
