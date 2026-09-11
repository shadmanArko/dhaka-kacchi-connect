import type { Pool } from "pg";

/** One row per logged-in device/browser. See schema.sql's sessions table
 * comment for why logout is a hard DELETE, not a soft revoke. */
export interface SessionsRepository {
  createSession(session: {
    id: string;
    createdAt: string;
    expiresAt: Date;
    customerId: string;
    tokenHash: string;
  }): Promise<void>;
  findValidByTokenHash(tokenHash: string): Promise<{ customerId: string } | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Invalidates every session for a customer - used after a password reset,
   * so a previously-leaked session token stops working the moment the
   * password changes. */
  deleteAllForCustomer(customerId: string): Promise<void>;
}

export function createPostgresSessionsRepository(pool: Pool): SessionsRepository {
  return {
    async createSession({ id, createdAt, expiresAt, customerId, tokenHash }) {
      await pool.query(
        "INSERT INTO sessions (id, created_at, expires_at, customer_id, token_hash) VALUES ($1,$2,$3,$4,$5)",
        [id, createdAt, expiresAt, customerId, tokenHash],
      );
    },

    async findValidByTokenHash(tokenHash) {
      const result = await pool.query<{ customer_id: string }>(
        "SELECT customer_id FROM sessions WHERE token_hash = $1 AND expires_at > now()",
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? { customerId: row.customer_id } : null;
    },

    async deleteByTokenHash(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteAllForCustomer(customerId) {
      await pool.query("DELETE FROM sessions WHERE customer_id = $1", [customerId]);
    },
  };
}
