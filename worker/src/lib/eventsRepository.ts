import type { Pool } from "pg";

/** A single marketing/behavioral event, captured via POST /v1/events. Read
 * cross-repo by the sibling dhaka_kacchi_ai_harness warehouse - see
 * migrations-manual/0002_events.sql for the full design rationale. */
export interface EventsRepository {
  insertEvent(params: {
    id: string;
    eventName: string;
    occurredAt: Date;
    source: string;
    anonymousId: string | null;
    sessionId: string | null;
    customerId: string | null;
    orderId: string | null;
    ipAddress: string | null;
    properties: Record<string, unknown>;
  }): Promise<void>;
  /** Same throttle shape as otpRepository's countRecentSendsByIp - counts
   * rows from this IP in the last `sinceMinutes` minutes. */
  countRecentByIp(ipAddress: string, sinceMinutes: number): Promise<number>;
}

export function createPostgresEventsRepository(pool: Pool): EventsRepository {
  return {
    async insertEvent({
      id,
      eventName,
      occurredAt,
      source,
      anonymousId,
      sessionId,
      customerId,
      orderId,
      ipAddress,
      properties,
    }) {
      await pool.query(
        `INSERT INTO events
          (id, event_name, occurred_at, source, anonymous_id, session_id, customer_id, order_id, ip_address, properties)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          eventName,
          occurredAt,
          source,
          anonymousId,
          sessionId,
          customerId,
          orderId,
          ipAddress,
          JSON.stringify(properties),
        ],
      );
    },

    async countRecentByIp(ipAddress, sinceMinutes) {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM events
         WHERE ip_address = $1 AND occurred_at > now() - ($2::text || ' minutes')::interval`,
        [ipAddress, sinceMinutes],
      );
      return Number(result.rows[0]!.count);
    },
  };
}
