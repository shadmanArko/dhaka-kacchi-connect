import type { Pool } from "pg";

/** One row per "forgot password" email link sent. Email-only by design -
 * see CLAUDE.md - never issued from a phone/SMS flow. */
export interface PasswordResetTokensRepository {
  createToken(token: {
    id: string;
    createdAt: string;
    expiresAt: Date;
    customerId: string;
    tokenHash: string;
  }): Promise<void>;
  /** The token, if it exists, hasn't expired, and hasn't already been used. */
  findValidByTokenHash(tokenHash: string): Promise<{ id: string; customerId: string } | null>;
  markUsed(id: string): Promise<void>;
}

export function createPostgresPasswordResetTokensRepository(
  pool: Pool,
): PasswordResetTokensRepository {
  return {
    async createToken({ id, createdAt, expiresAt, customerId, tokenHash }) {
      await pool.query(
        "INSERT INTO password_reset_tokens (id, created_at, expires_at, customer_id, token_hash) VALUES ($1,$2,$3,$4,$5)",
        [id, createdAt, expiresAt, customerId, tokenHash],
      );
    },

    async findValidByTokenHash(tokenHash) {
      const result = await pool.query<{ id: string; customer_id: string }>(
        `SELECT id, customer_id FROM password_reset_tokens
         WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL`,
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? { id: row.id, customerId: row.customer_id } : null;
    },

    async markUsed(id) {
      await pool.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [id]);
    },
  };
}
