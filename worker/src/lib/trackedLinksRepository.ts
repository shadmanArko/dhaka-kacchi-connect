import type { Pool } from "pg";

export interface TrackedLink {
  id: string;
  createdAt: string;
  label: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  destinationPath: string;
  url: string;
  /** Normalised post URL, set after the post is published. */
  postUrl: string | null;
}

export interface NewTrackedLink extends Omit<TrackedLink, "createdAt" | "postUrl"> {
  createdBy: string;
}

export interface TrackedLinksRepository {
  list(limit: number): Promise<TrackedLink[]>;
  findBySourceContent(source: string, content: string): Promise<TrackedLink | null>;
  /** "exists" when (source, content) is already taken; nothing is changed then. */
  insert(link: NewTrackedLink): Promise<"created" | "exists">;
  /** Null when no such link. */
  setPostUrl(id: string, postUrl: string | null): Promise<TrackedLink | null>;
}

interface Row {
  id: string;
  created_at: string;
  label: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  destination_path: string;
  url: string;
  post_url: string | null;
}

// ISO text from SQL, not a Date: pg would hand back a JS Date that the response
// schema (a string) would not describe.
const COLUMNS = `id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
  label, source, medium, campaign, content, destination_path, url, post_url`;

function toLink(r: Row): TrackedLink {
  return {
    id: r.id,
    createdAt: r.created_at,
    label: r.label,
    source: r.source,
    medium: r.medium,
    campaign: r.campaign,
    content: r.content,
    destinationPath: r.destination_path,
    url: r.url,
    postUrl: r.post_url,
  };
}

export function createPostgresTrackedLinksRepository(pool: Pool): TrackedLinksRepository {
  return {
    async list(limit) {
      const res = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM tracked_links ORDER BY created_at DESC, id LIMIT $1`,
        [limit],
      );
      return res.rows.map(toLink);
    },

    async findBySourceContent(source, content) {
      const res = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM tracked_links WHERE source = $1 AND content = $2`,
        [source, content],
      );
      return res.rows[0] ? toLink(res.rows[0]) : null;
    },

    async insert(l) {
      // One atomic statement: two taps on "Create" cannot make two rows.
      const res = await pool.query(
        `INSERT INTO tracked_links
           (id, created_by, label, source, medium, campaign, content, destination_path, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source, content) DO NOTHING
         RETURNING id`,
        [
          l.id,
          l.createdBy,
          l.label,
          l.source,
          l.medium,
          l.campaign,
          l.content,
          l.destinationPath,
          l.url,
        ],
      );
      return (res.rowCount ?? 0) > 0 ? "created" : "exists";
    },

    async setPostUrl(id, postUrl) {
      const res = await pool.query<Row>(
        `UPDATE tracked_links SET post_url = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, postUrl],
      );
      return res.rows[0] ? toLink(res.rows[0]) : null;
    },
  };
}
