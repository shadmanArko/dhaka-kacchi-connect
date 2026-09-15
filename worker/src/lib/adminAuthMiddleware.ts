import type { MiddlewareHandler } from "hono";
import { hashToken } from "./auth";
import type { AdminSessionsRepository } from "./adminSessionsRepository";

/** The Hono `Variables` shape every route behind requireAdminAuth() can
 * rely on - deliberately a distinct shape from authMiddleware.ts's
 * AuthVariables (customerId), so a route can never accidentally accept
 * a customer token where an admin one is required or vice versa. */
export type AdminAuthVariables = { adminUserId: string };

/** Mirrors authMiddleware.ts's requireAuth exactly, against the separate
 * admin_sessions table - see that file for the full rationale. */
export function requireAdminAuth(
  adminSessionsRepository: AdminSessionsRepository,
): MiddlewareHandler<{ Variables: AdminAuthVariables }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }

    const session = await adminSessionsRepository.findValidByTokenHash(hashToken(token));
    if (!session) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }

    c.set("adminUserId", session.adminUserId);
    await next();
  };
}
