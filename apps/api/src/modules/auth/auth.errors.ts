import { AppError } from "../../error/app-error";

/**
 * Thrown by `POST /auth/login` on ANY credential failure — unknown email,
 * wrong password, whatever. There is deliberately only ONE error class
 * (and one code, one message, one status) for both cases: distinguishing
 * them in the response would let an attacker enumerate valid emails. See
 * `auth.route.ts` for how the login handler guarantees the two cases are
 * byte-identical, not just "using the same class".
 */
export class AuthenticationError extends AppError {
  constructor() {
    super("auth/INVALID_CREDENTIALS", "Invalid email or password", { status: 401 });
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Thrown by `requireAuth` when the access-token cookie is missing or
 * fails signature/shape verification. Distinct from `SessionExpiredError`
 * on purpose — see `auth.errors.ts` in `packages/shared` for why.
 */
export class UnauthenticatedError extends AppError {
  constructor() {
    super("auth/UNAUTHENTICATED", "Authentication required", { status: 401 });
    this.name = "UnauthenticatedError";
    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }
}

/**
 * Thrown by `requireAuth` when the access-token cookie is present and
 * well-formed but its `exp` claim is in the past.
 */
export class SessionExpiredError extends AppError {
  constructor() {
    super("auth/SESSION_EXPIRED", "Session expired, please log in again", { status: 401 });
    this.name = "SessionExpiredError";
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}
