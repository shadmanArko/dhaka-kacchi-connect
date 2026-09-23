import type { Pool } from "pg";

/**
 * The CEO cockpit (ARCHITECTURE.md section 4) - reads/writes the sibling
 * dhaka_kacchi_ai_harness warehouse's `cockpit_alert` table.
 *
 * Split into a read side and a write side on purpose, each over its OWN
 * Postgres connection (see db.ts's warehousePool/warehouseCockpitPool):
 * reads go through warehouse_reader (SELECT-only, everywhere), writes go
 * through warehouse_cockpit_writer (UPDATE-only, cockpit_alert only) - a
 * bug in either function still can't reach past what that function's own
 * role structurally allows.
 *
 * `agent_action` ("NEEDS YOUR DECISION") is deliberately NOT read here yet -
 * see ARCHITECTURE.md section 4.3's status note: it's real schema with
 * nothing in it, since the Layer 2 agents that would propose an action
 * don't exist yet. Add it once something actually writes there.
 */

export type AlertSeverity = "info" | "warn" | "critical";

export interface CockpitAlert {
  id: string;
  agent: string;
  alertKey: string;
  severity: AlertSeverity;
  title: string;
  detail: string | null;
  detectedAt: string;
  acknowledgedAt: string | null;
}

export interface YesterdayHealth {
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
  /** null when yesterday had zero delivered revenue - a ratio would divide
   * by zero, and "0%" would misleadingly read as "margin collapsed" rather
   * than "nothing to compute a margin from." */
  marginRatio: number | null;
}

export interface CockpitReadRepository {
  getOpenAlerts(): Promise<CockpitAlert[]>;
  getYesterdayHealth(): Promise<YesterdayHealth>;
}

export interface CockpitWriteRepository {
  /** Returns false if the alert was already acknowledged/resolved, or
   * doesn't exist - the caller turns that into a 404, not a 500. */
  acknowledgeAlert(id: string): Promise<boolean>;
  resolveAlert(id: string, resolution: string): Promise<boolean>;
}

export function createPostgresCockpitReadRepository(pool: Pool): CockpitReadRepository {
  return {
    async getOpenAlerts() {
      const result = await pool.query<{
        id: string;
        agent: string;
        alert_key: string;
        severity: AlertSeverity;
        title: string;
        detail: string | null;
        detected_at: string;
        acknowledged_at: string | null;
      }>(
        `SELECT id, agent, alert_key, severity, title, detail, detected_at, acknowledged_at
         FROM cockpit_alert
         WHERE resolved_at IS NULL
         ORDER BY
           CASE severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
           detected_at DESC`,
      );
      return result.rows.map((r) => ({
        id: r.id,
        agent: r.agent,
        alertKey: r.alert_key,
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        detectedAt: r.detected_at,
        acknowledgedAt: r.acknowledged_at,
      }));
    },

    async getYesterdayHealth() {
      // Only ever touches `orders` (net_margin is already precomputed at
      // ingest time) - never joins ingredient.current_price, same
      // point-in-time-safe shape warehouse/gate.py already trusts for
      // margin. Bucketed by Berlin calendar day, not UTC, since that's the
      // business's actual "yesterday."
      const result = await pool.query<{
        order_count: string;
        revenue: string;
        avg_order_value: string;
        margin_ratio: string | null;
      }>(
        `SELECT
           count(*)::text AS order_count,
           coalesce(sum(gross - discounts), 0)::text AS revenue,
           coalesce(avg(gross - discounts), 0)::text AS avg_order_value,
           CASE WHEN sum(gross - discounts) > 0
                THEN (sum(net_margin) / sum(gross - discounts))::text
                ELSE NULL END AS margin_ratio
         FROM orders
         WHERE status = 'delivered'
           AND (delivered_at AT TIME ZONE 'Europe/Berlin')::date =
               ((now() AT TIME ZONE 'Europe/Berlin')::date - interval '1 day')`,
      );
      const row = result.rows[0]!;
      return {
        orderCount: Number(row.order_count),
        revenue: Number(row.revenue),
        avgOrderValue: Number(row.avg_order_value),
        marginRatio: row.margin_ratio == null ? null : Number(row.margin_ratio),
      };
    },
  };
}

export function createPostgresCockpitWriteRepository(pool: Pool): CockpitWriteRepository {
  return {
    async acknowledgeAlert(id) {
      const result = await pool.query(
        `UPDATE cockpit_alert SET acknowledged_at = now()
         WHERE id = $1 AND acknowledged_at IS NULL AND resolved_at IS NULL`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async resolveAlert(id, resolution) {
      const result = await pool.query(
        `UPDATE cockpit_alert SET resolved_at = now(), resolution = $2
         WHERE id = $1 AND resolved_at IS NULL`,
        [id, resolution],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
