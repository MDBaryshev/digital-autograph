# Read-only administrator lookup

`/admin` provides exact internal-UUID lookup of a User, Creator, Wall, Autograph,
Order or Payment. It is an initial EGO-95 diagnostic screen, not a complete
administration or finance console. It has no account, content, payment or ledger
mutation, no migration and no new role or grant.

`GET /admin/lookup?id=<uuid>` requires a valid session and an active User with
the persistent `admin` role. Every read checks that role in the same PostgreSQL
statement snapshot as its matches. Ordinary Users, Creator ownership, moderator
and finance roles do not authorize lookup. `canAdmin` in workspace/navigation
only controls a link; it never authorizes the endpoint. Revoked roles or disabled
accounts fail the next read. An absent ID is an access-only probe returning an
empty array to an authorized admin; it cannot enumerate records.

The strict query accepts one UUID and no extra fields. Each table is queried by
its primary key with a UUID equality predicate; no text casts, partial matches,
name/email search, relation traversal or provider-ID search are performed. At
most one row per six entity types can match. The explicit response contains
only `kind`, `id`, `state` and `createdAt`. Creator state is null because the
current Creator schema does not contain a verification state. No names, user
relationships, provider identifiers, URLs, amounts, currency, stored credentials
or original/derivative bytes are returned. The response is `no-store`, and the
existing request logger records the server route, not the query's UUID.

The browser checks access without an ID before showing its form. Typing never
starts a lookup; submission is explicit. Input/origin changes and unmount cancel
prior work, and late responses cannot restore it. The ten-second deadline spans
headers and body reading even if the transport ignores abort. Errors offer an
explicit GET retry. Access loss and tab hiding clear private results; returning
to the tab probes current access without replaying the searched ID. Data is not
put in browser storage or the page URL. This is read-time authorization, not an
ability to retract information already delivered to an administrator.

Integration tests cover role/session revocation, all six entity types, strict
query boundaries, a read-only PostgreSQL transaction and unchanged financial
evidence/provider-call count. Rendered UI tests cover stalls, late completion,
malformed responses, explicit submission and removal of private state. A mobile
browser test checks Russian labels, layout and the next read after role revocation.
