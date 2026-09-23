import type { Pool } from "pg";

/**
 * Read-only reporting queries against the sibling dhaka_kacchi_ai_harness
 * warehouse database - powers the admin reporting page only. Every query
 * here is a SELECT over a connection that is structurally read-only
 * (warehouse_reader role, granted SELECT only - see that repo's
 * postgres-init/01-init-databases.sh), the same "can't write even if the
 * code tried to" guarantee warehouse/ingest/direct.py already has in the
 * other direction against this repo's own `orders` table.
 *
 * REVENUE-BY-CHANNEL IS BEST-EFFORT, NOT FULL IDENTITY RESOLUTION: it joins
 * a purchase event to its real order via
 * `event.properties->>'source_order_id' = orders.external_id` - a simple
 * string match on an id this repo's own orders.ts already assigns (e.g.
 * "ord_<uuid>"), preserved verbatim in the warehouse's events.py ingest
 * job specifically so a join like this is possible. This is NOT the same
 * as resolving a customer's identity across visits (still out of scope,
 * per that job's own IDENTITY GAP note) - it only answers "which order,
 * if any, did this specific attributed purchase event correspond to,"
 * which needs no cross-visit identity at all.
 */
export interface SocialPlatformSummary {
  platform: string;
  postCount: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalImpressions: number;
  totalReach: number;
}

export interface RecentSocialPost {
  platform: string;
  externalId: string;
  postedAt: string;
  permalink: string | null;
  contentType: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

export interface ChannelFunnelRow {
  channel: string;
  campaign: string;
  eventName: string;
  eventCount: number;
}

export interface ChannelRevenueRow {
  channel: string;
  campaign: string;
  purchaseEvents: number;
  matchedOrders: number;
  grossRevenue: number;
}

export interface AttributionCoverage {
  attributed: number;
  unattributed: number;
}

export interface ReportingRepository {
  getSocialPlatformSummary(): Promise<SocialPlatformSummary[]>;
  getRecentSocialPosts(limit: number): Promise<RecentSocialPost[]>;
  getChannelFunnel(): Promise<ChannelFunnelRow[]>;
  getChannelRevenue(): Promise<ChannelRevenueRow[]>;
  getAttributionCoverage(): Promise<AttributionCoverage>;
}

export function createPostgresReportingRepository(pool: Pool): ReportingRepository {
  return {
    async getSocialPlatformSummary() {
      const result = await pool.query<{
        platform: string;
        post_count: string;
        total_likes: string;
        total_comments: string;
        total_shares: string;
        total_impressions: string;
        total_reach: string;
      }>(
        `WITH latest_snapshot AS (
           SELECT DISTINCT ON (social_post_id) *
           FROM social_metrics_snapshot
           ORDER BY social_post_id, captured_at DESC
         )
         SELECT sp.platform,
                count(*)::text AS post_count,
                coalesce(sum(ls.likes), 0)::text AS total_likes,
                coalesce(sum(ls.comments), 0)::text AS total_comments,
                coalesce(sum(ls.shares), 0)::text AS total_shares,
                coalesce(sum(ls.impressions), 0)::text AS total_impressions,
                coalesce(sum(ls.reach), 0)::text AS total_reach
         FROM social_post sp
         JOIN latest_snapshot ls ON ls.social_post_id = sp.id
         GROUP BY sp.platform
         ORDER BY sp.platform`,
      );
      return result.rows.map((r) => ({
        platform: r.platform,
        postCount: Number(r.post_count),
        totalLikes: Number(r.total_likes),
        totalComments: Number(r.total_comments),
        totalShares: Number(r.total_shares),
        totalImpressions: Number(r.total_impressions),
        totalReach: Number(r.total_reach),
      }));
    },

    async getRecentSocialPosts(limit) {
      const result = await pool.query<{
        platform: string;
        external_id: string;
        posted_at: string;
        permalink: string | null;
        content_type: string | null;
        caption: string | null;
        likes: string | null;
        comments: string | null;
        shares: string | null;
        impressions: string | null;
        reach: string | null;
      }>(
        `WITH latest_snapshot AS (
           SELECT DISTINCT ON (social_post_id) *
           FROM social_metrics_snapshot
           ORDER BY social_post_id, captured_at DESC
         )
         SELECT sp.platform, sp.external_id, sp.posted_at, sp.permalink, sp.content_type,
                sp.caption, ls.likes, ls.comments, ls.shares, ls.impressions, ls.reach
         FROM social_post sp
         LEFT JOIN latest_snapshot ls ON ls.social_post_id = sp.id
         ORDER BY sp.posted_at DESC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map((r) => ({
        platform: r.platform,
        externalId: r.external_id,
        postedAt: r.posted_at,
        permalink: r.permalink,
        contentType: r.content_type,
        caption: r.caption,
        likes: Number(r.likes ?? 0),
        comments: Number(r.comments ?? 0),
        shares: Number(r.shares ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach: Number(r.reach ?? 0),
      }));
    },

    async getChannelFunnel() {
      const result = await pool.query<{
        channel: string;
        campaign: string;
        event_name: string;
        event_count: string;
      }>(
        `SELECT c.slug AS channel, cam.slug AS campaign, e.event_name,
                count(*)::text AS event_count
         FROM event e
         JOIN channel c ON c.id = e.channel_id
         JOIN campaign cam ON cam.id = e.campaign_id
         GROUP BY c.slug, cam.slug, e.event_name
         ORDER BY c.slug, e.event_name`,
      );
      return result.rows.map((r) => ({
        channel: r.channel,
        campaign: r.campaign,
        eventName: r.event_name,
        eventCount: Number(r.event_count),
      }));
    },

    async getChannelRevenue() {
      // LEFT JOIN, not INNER: a purchase event with no matching order is a
      // real, visible gap (the order was placed before this attribution
      // wiring existed, or the source id format ever changes), not
      // something to silently hide from the report.
      const result = await pool.query<{
        channel: string;
        campaign: string;
        purchase_events: string;
        matched_orders: string;
        gross_revenue: string;
      }>(
        `SELECT c.slug AS channel, cam.slug AS campaign,
                count(*)::text AS purchase_events,
                count(o.id)::text AS matched_orders,
                coalesce(sum(o.gross), 0)::text AS gross_revenue
         FROM event e
         JOIN channel c ON c.id = e.channel_id
         JOIN campaign cam ON cam.id = e.campaign_id
         LEFT JOIN orders o ON o.external_id = e.properties->>'source_order_id'
         WHERE e.event_name = 'purchase'
         GROUP BY c.slug, cam.slug
         ORDER BY gross_revenue DESC`,
      );
      return result.rows.map((r) => ({
        channel: r.channel,
        campaign: r.campaign,
        purchaseEvents: Number(r.purchase_events),
        matchedOrders: Number(r.matched_orders),
        grossRevenue: Number(r.gross_revenue),
      }));
    },

    async getAttributionCoverage() {
      const result = await pool.query<{ attributed: string; unattributed: string }>(
        `SELECT
           count(*) FILTER (WHERE channel_id IS NOT NULL)::text AS attributed,
           count(*) FILTER (WHERE channel_id IS NULL)::text AS unattributed
         FROM event`,
      );
      const row = result.rows[0]!;
      return { attributed: Number(row.attributed), unattributed: Number(row.unattributed) };
    },
  };
}
