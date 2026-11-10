# Account workspace

`GET /me/workspace` requires the ordinary session and returns at most 50 recent
owned autographs and 50 owned Walls, the first owned creator profile, and a
moderation navigation capability. It never returns original keys, provider IDs,
session hashes or signed media URLs. Private previews use the existing owner-
checked endpoint on explicit request. Mutation endpoints still authorize on the
server; hiding a navigation item grants no authority.

`PUT /me/profile` submits the display name and username of the first owned creator
profile for review. Approval updates the creator page and its public URL.
Public profile writes are disabled by default. The trusted server setting
`CREATOR_PROFILE_PUBLICATION_APPROVED=true` may be set only after a separate
owner/legal decision covering creator admission, public name/username use and
the applicable publication basis. Neither sign-in nor Terms acceptance creates
that decision. A normal deployment must retain the default `false`; client body
fields cannot override it. The summary exposes only `canEditProfile`; the UI
shows a read-only profile while disabled and PUT returns
`PROFILE_PUBLICATION_UNAVAILABLE` without any write. Existing profiles remain
readable. No consent/evidence is fabricated and no existing legal registry entry
is made ready. The existing opt-in first-use gate also applies to profile writes
when enforcement is enabled; it is separate from publication approval.
A user-row lock serializes initial creation and changes. PostgreSQL rechecks slug
uniqueness when a moderator approves the submitted version. A conflicting slug
leaves the submission pending and returns `SLUG_TAKEN` to the moderator.

Deploy the approved migration chain before starting the matching Web/API release.
The runtime allowlist grants the API access to the profile submission and decision
tables. The worker uses its existing privileges. [Profile moderation architecture](../architecture/account-content-moderation.md#ручная-проверка-профилей)

Walls start as drafts via the existing owner API; publication is a separate
explicit action. No pricing, payment, reservation or takeover rules change.
Theme and language remain available to guests in Settings. Autograph creation
continues to require the existing session/first-use gate. Logout reloads the
workspace so private cached content is cleared.

Settings opened from the autograph editor use a separate tab. An unsubmitted
canvas/photo also registers a before-unload warning; a completed private preview
can be left safely because it is already associated with the account. Changing
preferences never submits, moderates or places an autograph.

Profile validation preserves the existing 1–128 character slug and 1–200
character display-name ranges; NUL is rejected before PostgreSQL. Reads and
writes select the same first owned profiled creator, even when an older owned
creator has no profile. SQL/transactions live in the database repository rather
than HTTP handlers. Archived Walls have no public-link action because public
delivery intentionally rejects them. Navigation clears stale account state when
a session refresh fails, and ignores responses from aborted requests.
