import type { Pool } from "pg";

export type SubscriberStatus = "pending" | "confirmed";

export interface SubscribersRepository {
  /**
   * Inserts a new pending subscriber, or - for an email already on file that
   * hasn't confirmed yet - re-arms it with a fresh token (so "I never got the
   * email, let me sign up again" works). Returns "already_confirmed" without
   * touching the row if they're already on the list, so a stranger typing
   * someone else's address can't reset anything.
   */
  upsertPending(input: {
    id: string;
    createdAt: string;
    email: string;
    locale: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<"created" | "refreshed" | "already_confirmed">;
  /** Confirms the subscriber holding this (unexpired) token. False if none. */
  confirmByTokenHash(tokenHash: string): Promise<boolean>;
}

export function createPostgresSubscribersRepository(pool: Pool): SubscribersRepository {
  return {
    async upsertPending({ id, createdAt, email, locale, tokenHash, expiresAt }) {
      // One atomic statement: no select-then-insert race between two taps.
      const result = await pool.query<{ outcome: string }>(
        `INSERT INTO subscribers (id, created_at, email, locale, status, confirm_token_hash, confirm_expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         ON CONFLICT (email) DO UPDATE
           SET confirm_token_hash = EXCLUDED.confirm_token_hash,
               confirm_expires_at = EXCLUDED.confirm_expires_at,
               locale = EXCLUDED.locale
           WHERE subscribers.status = 'pending'
         RETURNING CASE WHEN xmax = 0 THEN 'created' ELSE 'refreshed' END AS outcome`,
        [id, createdAt, email, locale, tokenHash, expiresAt],
      );
      const row = result.rows[0];
      return row ? (row.outcome as "created" | "refreshed") : "already_confirmed";
    },

    async confirmByTokenHash(tokenHash) {
      const result = await pool.query(
        `UPDATE subscribers
            SET status = 'confirmed', confirmed_at = now(), confirm_token_hash = NULL, confirm_expires_at = NULL
          WHERE confirm_token_hash = $1 AND confirm_expires_at > now() AND status = 'pending'`,
        [tokenHash],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
