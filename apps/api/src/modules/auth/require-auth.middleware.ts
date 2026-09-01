import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { UserRole } from "@prisma/client";
import { AppError } from "../../error/app-error";
import { SessionExpiredError, UnauthenticatedError } from "./auth.errors";
import { TokenExpiredError, verifyAccessToken } from "./jwt";
import { findUserByEmail, type StoredUser } from "./user-store";

export const ACCESS_TOKEN_COOKIE = "access_token";
export type AuthUser = Pick<StoredUser, "id" | "email" | "username" | "role">;
export type RequireAuthVariables = { authEmail: string; authUser: AuthUser };
export const requireAuth: MiddlewareHandler<{ Variables: RequireAuthVariables }> = async (c, next) => { const token = getCookie(c, ACCESS_TOKEN_COOKIE); if (!token) throw new UnauthenticatedError(); try { const payload = await verifyAccessToken(token); const user = await findUserByEmail(payload.sub); if (!user) throw new UnauthenticatedError(); c.set("authEmail", user.email); c.set("authUser", { id: user.id, email: user.email, username: user.username, role: user.role }); } catch (err) { if (err instanceof TokenExpiredError) throw new SessionExpiredError(); if (err instanceof UnauthenticatedError) throw err; throw new UnauthenticatedError(); } await next(); };
export function requireRole(roles: UserRole[]): MiddlewareHandler<{ Variables: RequireAuthVariables }> { return async (c, next) => { const user = c.get("authUser"); if (!user || !roles.includes(user.role)) throw new AppError("common/FORBIDDEN", "Forbidden", { status: 403 }); await next(); }; }
