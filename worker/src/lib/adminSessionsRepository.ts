import type { Pool } from "pg";

/** One row per logged-in admin device/browser - a completely separate
 * token namespace from sessionsRepository.ts's customer sessions, so a
 * leaked customer token can never be mistaken for an admin one. Same
 * hard-DELETE-on-logout convention as sessions.ts. */
export interface AdminSessionsRepository {
  createSession(session: {
    id: string;
    createdAt: string;
    expiresAt: Date;
    adminUserId: string;
    tokenHash: string;
  }): Promise<void>;
  findValidByTokenHash(tokenHash: string): Promise<{ adminUserId: string } | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

export function createPostgresAdminSessionsRepository(pool: Pool): AdminSessionsRepository {
  return {
    async createSession({ id, createdAt, expiresAt, adminUserId, tokenHash }) {
      await pool.query(
        "INSERT INTO admin_sessions (id, created_at, expires_at, admin_user_id, token_hash) VALUES ($1,$2,$3,$4,$5)",
        [id, createdAt, expiresAt, adminUserId, tokenHash],
      );
    },

    async findValidByTokenHash(tokenHash) {
      const result = await pool.query<{ admin_user_id: string }>(
        "SELECT admin_user_id FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()",
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? { adminUserId: row.admin_user_id } : null;
    },

    async deleteByTokenHash(tokenHash) {
      await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
    },
  };
}
