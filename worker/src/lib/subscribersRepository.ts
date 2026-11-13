import type { Pool } from "pg";

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export type SubscriberRow = {
  id: string;
  email: string;
  locale: string;
  status: SubscriberStatus;
  source: string | null;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
};

/** How long an unconfirmed address must wait before we email it again. Stops
 * the public form being used to flood one inbox with confirmation mails. */
export const RESEND_THROTTLE_SECONDS = 120;

export type UpsertOutcome =
  | { kind: "created" | "refreshed"; unsubscribeToken: string }
  | { kind: "already_confirmed" }
  | { kind: "throttled" };

export interface SubscribersRepository {
  /** Creates the table (and any columns added later) if missing. Idempotent. */
  ensureSchema(): Promise<void>;
  /**
   * Starts (or restarts) a double opt-in for `email`. A brand-new address is
   * inserted as pending; a pending one is re-armed with a fresh token (unless
   * asked again within RESEND_THROTTLE_SECONDS); someone who unsubscribed may
   * sign up again; an already-confirmed address is left untouched so a
   * stranger typing it can't change anything.
   */
  upsertPending(input: {
    id: string;
    createdAt: string;
    email: string;
    locale: string;
    source: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<UpsertOutcome>;
  /** Confirms the subscriber holding this (unexpired) token, or returns null. */
  confirmByTokenHash(
    tokenHash: string,
  ): Promise<{ email: string; locale: string; unsubscribeToken: string } | null>;
  /** Marks the subscriber with this unsubscribe token as unsubscribed. Returns
   * false only if no such token exists; repeating it is harmless. */
  unsubscribeByToken(token: string): Promise<boolean>;
  list(limit: number): Promise<{
    counts: Record<SubscriberStatus, number>;
    subscribers: SubscriberRow[];
  }>;
}

export function createPostgresSubscribersRepository(pool: Pool): SubscribersRepository {
  return {
    async ensureSchema() {
      // Safe to run on every start: every statement is IF NOT EXISTS, so it can
      // never touch existing data. Also upgrades a table created by the first
      // version of this feature (which lacked the newer columns).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subscribers (
          id                      TEXT PRIMARY KEY,
          created_at              TEXT NOT NULL,
          email                   TEXT NOT NULL,
          locale                  TEXT NOT NULL DEFAULT 'en',
          status                  TEXT NOT NULL DEFAULT 'pending',
          confirm_token_hash      TEXT,
          confirm_expires_at      TIMESTAMPTZ,
          confirmed_at            TIMESTAMPTZ
        );
        ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS source TEXT;
        ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT
          NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
        ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
        ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_confirmation_sent_at TIMESTAMPTZ;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token
          ON subscribers(unsubscribe_token);
        CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token_hash
          ON subscribers(confirm_token_hash);
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ordering_reader') THEN
            GRANT SELECT ON subscribers TO ordering_reader;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'could not grant subscribers to ordering_reader: %', SQLERRM;
        END $$;
      `);
    },

    async upsertPending({ id, createdAt, email, locale, source, tokenHash, expiresAt }) {
      // One atomic statement - no select-then-insert race between two taps.
      // The WHERE on the conflict branch is what makes this safe: confirmed
      // rows are never updated, and a pending row is only re-armed once the
      // throttle window has passed.
      const result = await pool.query<{ outcome: string; unsubscribe_token: string }>(
        `INSERT INTO subscribers
           (id, created_at, email, locale, status, source, confirm_token_hash,
            confirm_expires_at, last_confirmation_sent_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, now())
         ON CONFLICT (email) DO UPDATE
           SET status = 'pending',
               confirm_token_hash = EXCLUDED.confirm_token_hash,
               confirm_expires_at = EXCLUDED.confirm_expires_at,
               locale = EXCLUDED.locale,
               last_confirmation_sent_at = now(),
               confirmed_at = NULL,
               unsubscribed_at = NULL
           WHERE subscribers.status = 'unsubscribed'
              OR (subscribers.status = 'pending'
                  AND (subscribers.last_confirmation_sent_at IS NULL
                       OR subscribers.last_confirmation_sent_at
                          < now() - make_interval(secs => $8)))
         RETURNING CASE WHEN xmax = 0 THEN 'created' ELSE 'refreshed' END AS outcome,
                   unsubscribe_token`,
        [id, createdAt, email, locale, source, tokenHash, expiresAt, RESEND_THROTTLE_SECONDS],
      );
      const row = result.rows[0];
      if (row) {
        return {
          kind: row.outcome as "created" | "refreshed",
          unsubscribeToken: row.unsubscribe_token,
        };
      }
      // No row returned: the address exists and the WHERE refused the update.
      const existing = await pool.query<{ status: string }>(
        "SELECT status FROM subscribers WHERE email = $1",
        [email],
      );
      return existing.rows[0]?.status === "confirmed"
        ? { kind: "already_confirmed" }
        : { kind: "throttled" };
    },

    async confirmByTokenHash(tokenHash) {
      const result = await pool.query<{
        email: string;
        locale: string;
        unsubscribe_token: string;
      }>(
        `UPDATE subscribers
            SET status = 'confirmed', confirmed_at = now(),
                confirm_token_hash = NULL, confirm_expires_at = NULL
          WHERE confirm_token_hash = $1 AND confirm_expires_at > now() AND status = 'pending'
          RETURNING email, locale, unsubscribe_token`,
        [tokenHash],
      );
      const row = result.rows[0];
      return row
        ? { email: row.email, locale: row.locale, unsubscribeToken: row.unsubscribe_token }
        : null;
    },

    async unsubscribeByToken(token) {
      const result = await pool.query(
        `UPDATE subscribers
            SET status = 'unsubscribed',
                unsubscribed_at = COALESCE(unsubscribed_at, now()),
                confirm_token_hash = NULL, confirm_expires_at = NULL
          WHERE unsubscribe_token = $1`,
        [token],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async list(limit) {
      const [counts, rows] = await Promise.all([
        pool.query<{ status: SubscriberStatus; n: string }>(
          "SELECT status, count(*) AS n FROM subscribers GROUP BY status",
        ),
        pool.query<{
          id: string;
          email: string;
          locale: string;
          status: SubscriberStatus;
          source: string | null;
          created_at: string;
          confirmed_at: Date | null;
          unsubscribed_at: Date | null;
        }>(
          `SELECT id, email, locale, status, source, created_at, confirmed_at, unsubscribed_at
             FROM subscribers ORDER BY created_at DESC LIMIT $1`,
          [limit],
        ),
      ]);
      const byStatus: Record<SubscriberStatus, number> = {
        pending: 0,
        confirmed: 0,
        unsubscribed: 0,
      };
      for (const r of counts.rows) byStatus[r.status] = Number(r.n);
      return {
        counts: byStatus,
        subscribers: rows.rows.map((r) => ({
          id: r.id,
          email: r.email,
          locale: r.locale,
          status: r.status,
          source: r.source,
          createdAt: r.created_at,
          confirmedAt: r.confirmed_at ? r.confirmed_at.toISOString() : null,
          unsubscribedAt: r.unsubscribed_at ? r.unsubscribed_at.toISOString() : null,
        })),
      };
    },
  };
}
