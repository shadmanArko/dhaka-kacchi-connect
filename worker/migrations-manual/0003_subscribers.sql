-- PRODUCTION-ONLY, hand-run migration. Apply with, e.g.:
--   docker compose exec -T postgres psql -U postgres ordering \
--     < worker/migrations-manual/0003_subscribers.sql
--
-- NEVER apply this via `npm run db:migrate` - see 0001's header and this
-- directory's README for why. Additive and safe to re-run.
--
-- Adds `subscribers`: the website's "get notified about the next batch"
-- newsletter list, fed by POST /v1/subscribe. Double opt-in (the standard in
-- Germany, and what UWG §7 expects): a row starts 'pending' and only becomes
-- 'confirmed' when the person clicks the link emailed to them, which also
-- doubles as the proof-of-consent timestamp. The raw confirmation token is
-- never stored, only its sha256.
--
-- The two GRANTs at the bottom reference the ordering_app role that exists
-- only on the real deployed Postgres (see 0002's header for why explicit
-- GRANTs are used). They will fail on a local database without that role -
-- comment them out to test locally.

CREATE TABLE IF NOT EXISTS subscribers (
  id                  TEXT PRIMARY KEY,           -- e.g. "sub_<uuid>"
  created_at          TEXT NOT NULL,              -- ISO 8601 UTC
  email               TEXT NOT NULL,              -- lowercased
  locale              TEXT NOT NULL DEFAULT 'en',
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed
  confirm_token_hash  TEXT,
  confirm_expires_at  TIMESTAMPTZ,
  confirmed_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token_hash ON subscribers(confirm_token_hash);

GRANT SELECT, INSERT, UPDATE ON subscribers TO ordering_app;
GRANT SELECT ON subscribers TO ordering_reader;
