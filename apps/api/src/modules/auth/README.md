# auth module (TASK-012b)

In-memory-store auth seam: `POST /auth/register`, `POST /auth/login`,
`GET /auth/me`, `POST /auth/logout`.

## Storage

`user-store.ts` is a module-scoped `Map<email, StoredUser>` — no real
database is wired up yet. It resets on every process restart. A later task
(once Postgres is actually connected) swaps this for a real repository
without changing the shape `registerUser`/`findUserByEmail` callers use.

## Password hashing

`Bun.password.hash` / `Bun.password.verify` with `algorithm: "argon2id"`
(Bun's native implementation — no external native-binding dependency).
Plaintext passwords are never stored or logged; only the argon2id hash is
retained.

## Tokens: no refresh token in v1

`POST /auth/login` issues a single short-lived (<= 15 minute) access-token
JWT, set as an httpOnly cookie. There is **no refresh token in v1**.
Consequences, stated explicitly:

- Logout (`POST /auth/logout`) is **best-effort**: it deletes the cookie
  client-side. There is no server-side session/token store to revoke
  against, so a copied/leaked token stays valid until it naturally expires
  (at most 15 minutes).
- Re-authentication after expiry is a full login, not a silent refresh.
  This is why `auth/SESSION_EXPIRED` is a distinct error code from
  `auth/UNAUTHENTICATED` — the client can special-case "your session
  expired, log in again" vs "you were never logged in".

This is a **known limitation, not an oversight** — stateless-JWT
revocation (a deny-list, or a move to short-lived + refresh pairs backed
by a real session store) is real future work once a database exists.

## CSRF stance (v1)

The access-token cookie is `httpOnly` + `SameSite=Lax` + `Secure`, and is
**never** returned in the JSON response body (so a client cannot put it in
`localStorage`). `SameSite=Lax` already blocks the cookie from being
attached to a cross-site POST in modern browsers — the exact request shape
a CSRF attack against a POST-handling backend needs — and this API is
same-origin-by-default: the CORS allowlist (`src/middleware/security.ts`)
already restricts which origins can read a response. `SameSite=Lax` + the
CORS allowlist is the primary CSRF mitigation for v1. A dedicated
CSRF-token / double-submit-cookie scheme is not implemented, and would be
revisited if this API ever needs to support a genuinely cross-site client.

## Rate limiting

Auth routes get their own, stricter rate-limit bucket
(`createAuthApp()` in `auth.route.ts`: 10 requests/minute per client, vs.
the global 100 requests/minute applied to every route in
`src/index.ts`) — auth endpoints are the highest-value target for
credential stuffing / brute force.

## No user enumeration

`POST /auth/login` returns the exact same status, body, and (as close as
practically achievable) timing whether the email doesn't exist or the
password is wrong — see the `DUMMY_PASSWORD_HASH` comment in
`auth.route.ts`.
