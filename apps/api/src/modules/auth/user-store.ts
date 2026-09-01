/**
 * In-memory user store (TASK-012b).
 *
 * No real database is wired up yet (see the project constraints for this
 * task) — this is a module-scoped `Map` keyed by lowercased email, good
 * enough to prove the auth seam (register -> login -> protected route)
 * works end to end. It is reset whenever the process restarts and is NOT
 * a substitute for a real persistence layer; a later task swaps this out
 * for Postgres without changing the shape callers use here.
 *
 * Passwords are hashed with `Bun.password.hash` (argon2id, Bun's native
 * default) before ever touching the map — the plaintext password is never
 * stored, logged, or retained past the hashing call.
 */

export interface StoredUser {
  /** Lowercased email, also the map key. */
  email: string;
  /** argon2id hash — NEVER the plaintext password. */
  passwordHash: string;
}

const users = new Map<string, StoredUser>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Register (or overwrite) a user. Hashes the password before storing it;
 * the plaintext `password` argument is never written to `users`, logged,
 * or returned.
 */
export async function registerUser(email: string, password: string): Promise<StoredUser> {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });

  const user: StoredUser = { email: normalizedEmail, passwordHash };
  users.set(normalizedEmail, user);
  return user;
}

/** Look up a user by email (case-insensitive). Returns `undefined` if none exists. */
export function findUserByEmail(email: string): StoredUser | undefined {
  return users.get(normalizeEmail(email));
}

/**
 * Test-only escape hatch: clears the store so tests don't leak users into
 * each other. Not used by any production route.
 */
export function __resetUserStoreForTests(): void {
  users.clear();
}
