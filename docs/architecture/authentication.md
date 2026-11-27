# Authentication Core

Authentication is provider-independent and backed by PostgreSQL. Yandex verifies the provider assertion before creating a local session; email/password requires mailbox confirmation before credential creation. There is no public session-creation endpoint.

## Credential and persistence

- A credential is `da_s1_` followed by 43 URL-safe Base64 characters encoding 32 bytes from Node's cryptographic random generator. It carries no User ID or claims.
- The service stores only SHA-256 of the complete credential in `sessions.secret_hash`. The 256-bit random input makes direct SHA-256 appropriate for indexed lookup; this is not a human password. The raw credential is returned only by creation/rotation to trusted caller code and is never queried from PostgreSQL.
- The unique `sessions.secret_hash` index supports lookup. Validation joins the current User and accepts only `users.status = 'active'`, `revoked_at IS NULL`, and `expires_at` later than database time. Missing, malformed, revoked, expired, disabled, and anonymized sessions all authenticate as anonymous.
- The fixed lifetime is `SESSION_TTL_SECONDS` (local sample: 14 days; allowed range 5 minutes to 30 days). PostgreSQL generates issue and expiry times. Expiry never reactivates a session. Cleanup can be added later.

## Lifecycle and concurrency

Creation checks the User's active status in a transaction. Rotation locks the User row, revokes the old session, inserts a new independent hash, then commits. Only one concurrent rotation of the same old credential can succeed. Revoking one session is idempotent. Logout-all locks the User row and revokes all of that User's sessions, including the executing one; creation/rotation use the same lock so a concurrent rotation cannot leave an unrevoked successor. An unrelated User's sessions remain valid. This lock is for session lifecycle ordering, not a product authorization mechanism.

## Request flow and API

`@fastify/cookie` parses the cookie. One Fastify hook validates the credential through `SessionService` and stores an `anonymous` or `authenticated` typed context on the request. `/health/*` bypasses session lookup to preserve liveness. Protected routes use `requireAuthenticatedUser`; handlers do not parse or trust client-supplied User IDs. A failed guard returns `401 {"error":{"code":"UNAUTHENTICATED"}}` without disclosing why the token failed. `GET /auth/me` returns only User ID and status. `POST /auth/logout` clears the cookie and is idempotent. `POST /auth/logout-all` requires authentication and clears the cookie. Session creation and rotation are service operations for verified provider integrations, not public HTTP endpoints.

Authentication answers who the caller is. Future authorization must decide whether that User may act. Creator ownership derives from `creators.owner_user_id`; Creator is not a client-supplied role. `user_roles` stores only future moderator, finance, and admin assignments, with one row per `(user_id, role)`. No permission matrix or admin route exists yet.

## Cookie and browser controls

Production uses the host-only `__Host-da_session` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, and Max-Age equal to the configured lifetime. Staging also uses Secure. Local/test/development use `da_session` without Secure so plain HTTP works. Frontend JavaScript cannot read the HttpOnly cookie. Rotation's future provider-facing caller must replace the cookie with the new credential; logout endpoints clear it.

`TRUSTED_WEB_ORIGINS` is a required comma-separated list of exact HTTP(S) origins; staging and production require HTTPS entries. Credentialed CORS echoes only a configured origin, never `*`. For unsafe methods carrying a session cookie, the API requires an `Origin` in that list and returns 403 for missing or different origins before state changes. This assumes web and API are deployed on the same site (possibly different origins/ports), where `SameSite=Lax` also reduces cross-site cookie delivery. A deployment on different sites must revisit the cookie and CSRF model, likely adding a CSRF token. OAuth callback GET navigations use provider-bound state, browser binding, nonce, and one-time attempt consumption instead of the unsafe-method Origin check.

Normal request logging contains method and path, with query parameters stripped before serialization so callback `code` and `state` do not enter API logs. Fastify redacts Cookie and Authorization header paths; service and repository code never log raw credentials or hashes. API responses never include raw credentials or stored hashes.

## Current sign-in providers

Yandex ID and verified email/password are the selected public methods. See
[Yandex authentication](yandex-id-authentication.md),
[email authentication](email-authentication.md) and the
[operator setup](../operations/auth-provider-setup.md). Google OAuth and Telegram
login routes/adapters are removed. Historic social identities and user-owned data
are preserved; there is no automatic account merge or recovery by provider email.

## Optional Telegram connection

Only an authenticated user can POST `/me/connections/telegram/start`. The Origin
check applies before mutation. A ten-minute PKCE attempt uses a separate provider
namespace `telegram_link` and is bound in PostgreSQL to the exact user and session.
State, nonce, verifier and browser-binding are checked and consumed once before
server-side Telegram verification. No session or primary credential is issued.

The callback rechecks the active user and exact session after provider I/O under
the lifecycle locks. A Telegram subject already connected elsewhere cannot be
transferred. PostgreSQL enforces one Telegram subject per user and uniqueness of
the subject. No name, avatar or phone is requested or published.

DELETE `/me/connections/telegram` removes the private connection and all that user's
pending/claimed link attempts under the same user lock. `connect` checks the
durable claimed attempt inside that lock, so an in-flight provider callback cannot
reconnect after a successful disconnect. This cancellation record is ephemeral,
not an authentication or financial ledger.
