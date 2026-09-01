# auth module

Prisma-backed auth seam: `POST /auth/register`, `POST /auth/login`,
`GET /auth/me`, `POST /auth/logout`, plus owner-only user management routes.

## Storage

`user-store.ts` stores users in Postgres through Prisma. Public user responses
must never include `passwordHash`.

## Password hashing

`Bun.password.hash` / `Bun.password.verify` with `algorithm: "argon2id"`.
Plaintext passwords are never stored or logged.

## Tokens: no refresh token in v1

`POST /auth/login` issues a single short-lived (<= 15 minute) access-token JWT,
set as an httpOnly cookie. There is **no refresh token in v1**.

- Logout deletes the cookie client-side; a copied token remains valid until it
  naturally expires.
- Re-authentication after expiry is a full login.

## CSRF stance

The access-token cookie is `httpOnly` + `SameSite=Lax` + `Secure`, and is never
returned in the JSON response body. `SameSite=Lax` plus the CORS allowlist is the
primary CSRF mitigation for this scaffold.

## Rate limiting

Auth routes use a stricter rate-limit bucket than the global middleware.

## No user enumeration

`POST /auth/login` returns the same public failure shape whether the identifier
does not exist or the password is wrong.
