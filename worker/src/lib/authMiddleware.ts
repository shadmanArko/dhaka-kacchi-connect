import type { MiddlewareHandler } from "hono";
import { hashToken } from "./auth";
import type { SessionsRepository } from "./sessionsRepository";

/** The Hono `Variables` shape every route behind requireAuth() can rely on. */
export type AuthVariables = { customerId: string };

/**
 * The first real "you must be signed in" check in this codebase - every
 * route until now has set `security: []` because there was no auth at all.
 * Reads a `Bearer <token>` header, looks up its hash against the sessions
 * table, and sets `customerId` on the context for the handler to use.
 */
export function requireAuth(
  sessionsRepository: SessionsRepository,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }

    const session = await sessionsRepository.findValidByTokenHash(hashToken(token));
    if (!session) {
      return c.json({ error: "unauthorized", message: "Sign in required." }, 401);
    }

    c.set("customerId", session.customerId);
    await next();
  };
}
