# One ten-place Wall per account

Status: accepted product direction, 2026-11-04. Deployment requires reviewed migration and release.

Each account may own at most one Wall, including draft, ended and archived Walls. Every Wall has exactly ten fixed positions, internally 0–9 and publicly 1–10. Owners do not choose or resize the capacity. Separate Creator records for the same account do not create extra allowance. No Wall is created before the owner explicitly requests one through their Creator profile.

Positions 1–3 receive gold, silver and bronze borders and crown badges. Positions 4–10 receive a plain black border and numbered badge. This presentation follows the stable Slot position, not takeover price, placement age or an analytics ranking; it grants no additional permission.

PostgreSQL derives `walls.owner_user_id` from the Creator and enforces its uniqueness. Creator ownership changes synchronize the derived value and cannot exceed the recipient's allowance. Null-owned legacy Creators cannot use the ordinary owner API. A database trigger creates all ten positions when a Wall is inserted. Count/range checks and guards prevent deleting, relocating or renumbering those positions. Slot identities, placement history, reservation/payment idempotency and existing pricing pins are preserved.

Migration 0025 stops atomically if existing Walls have a different capacity or an account has multiple Walls. It does not select a surviving Wall, remove Slots or rewrite history. Such data requires an explicit operator migration plan after reviewing placements, quotes, reservations and orders. The runtime remains unchanged until that plan and the reviewed release are applied.
