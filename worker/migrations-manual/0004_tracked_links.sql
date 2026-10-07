-- PRODUCTION-ONLY, hand-run migration. Apply with, e.g.:
--   docker compose exec -T postgres psql -U postgres ordering \
--     < worker/migrations-manual/0004_tracked_links.sql
--
-- NEVER apply this via `npm run db:migrate` - see 0001's header and this
-- directory's README. Like 0002, the two GRANTs at the bottom reference
-- ordering_app/ordering_reader and fail on a local dev database that has
-- neither role; comment them out to test the CREATE TABLE locally.
--
-- Adds `tracked_links`: every tagged link staff create in the admin Link
-- builder (instagram story, whatsapp broadcast, creator link, ...). It is the
-- write side of per-post attribution: a visit arrives with
-- utm_source/utm_content (src/lib/utmCapture.ts), and the sibling warehouse's
-- warehouse/ingest/links.py reads this table over ordering_reader to turn each
-- row into a channel/campaign/variant that those visits resolve against.
--
-- (source, content) is UNIQUE, not the four-tuple, because that pair is exactly
-- what the warehouse resolves a visit by - one content value under one source
-- must mean one link, or a visit could belong to two.
--
-- Rows are append-only apart from post_url, which is filled in AFTER the post is
-- published (the link has to exist before the post that carries it). No DELETE:
-- a link that has been shared is historical evidence, and a wrong one is simply
-- not used again. ordering_app is therefore granted SELECT/INSERT/UPDATE only.
--
-- created_by is the admin_users.id, kept as plain text with no FK so this file
-- never depends on admin_users' ownership/grants.

CREATE TABLE IF NOT EXISTS tracked_links (
  id                TEXT PRIMARY KEY,           -- e.g. "lnk_<uuid>"
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT,
  label             TEXT NOT NULL,              -- what a person calls it: "Reel - kacchi pot"
  source            TEXT NOT NULL,
  medium            TEXT NOT NULL,
  campaign          TEXT NOT NULL,
  content           TEXT NOT NULL,
  destination_path  TEXT NOT NULL DEFAULT '/',
  url               TEXT NOT NULL,              -- the finished link, as handed out
  post_url          TEXT,                       -- normalised post URL, set once published
  CONSTRAINT uq_tracked_links_source_content UNIQUE (source, content)
);
CREATE INDEX IF NOT EXISTS idx_tracked_links_created_at ON tracked_links(created_at DESC);

-- Explicit and idempotent - see 0002's header for why this is not left to the
-- default-privilege mechanism (the file is applied as the superuser, so the table
-- is not owned by ordering_app).
GRANT SELECT, INSERT, UPDATE ON tracked_links TO ordering_app;
GRANT SELECT ON tracked_links TO ordering_reader;
