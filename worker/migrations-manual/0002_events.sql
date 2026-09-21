-- PRODUCTION-ONLY, hand-run migration. Apply with, e.g.:
--   docker compose exec -T postgres psql -U postgres ordering \
--     < worker/migrations-manual/0002_events.sql
--
-- NEVER apply this via `npm run db:migrate` - see 0001's header and this
-- directory's README for why.
--
-- References ordering_reader, same as 0001 - this file will fail on a local
-- dev database that has no such role (the final GRANT statement below), which
-- is expected; it is not meant to run there. To test the CREATE TABLE/INDEX
-- statements locally, comment out that one GRANT line.
--
-- Adds `events`: a first-party marketing/behavioral event capture table fed
-- by POST /v1/events (page_view, add_to_cart, purchase, ...). This is the
-- website-side half of the sibling dhaka_kacchi_ai_harness repo's
-- ARCHITECTURE.md section 4.7 marketing-attribution layer - that repo's
-- warehouse.event/event_taxonomy tables are the read side; this table is the
-- write side. It's read the same way orders/order_items already are: a
-- future warehouse/ingest/events.py job, connecting as the read-only
-- ordering_reader role, never ordering_app. Unlike admin_users/
-- admin_sessions in 0001, this table is meant to be read cross-repo - see
-- the explicit GRANT at the bottom of this file.
--
-- NOT relying on the ALTER DEFAULT PRIVILEGES FOR ROLE ordering_app grant
-- from postgres-init/01-init-databases.sh (the mechanism 0001's comment
-- describes): that only auto-applies to tables CREATEd by ordering_app
-- itself, and this file's own documented apply command connects as
-- `-U postgres` (superuser), not ordering_app - so this table's owner is
-- whichever role actually runs this file, not ordering_app, and the
-- default-privilege inheritance cannot be assumed. An explicit GRANT below
-- sidesteps the question entirely instead of depending on it.
--
-- occurred_at is TIMESTAMPTZ, not TEXT like the older SQLite-ported columns
-- (see schema.sql's header on the TEXT-vs-TIMESTAMPTZ rule) - this warehouse
-- ingest job will filter/order on it directly in SQL. There's no separate
-- created_at: occurred_at is always server-assigned (see the route handler),
-- so a second timestamp would just duplicate it.
--
-- event_name is intentionally NOT constrained by a CHECK/FK here - the
-- taxonomy lives in the warehouse's event_taxonomy table in a different
-- repo/database, and this backend has no way to reference it. The zod enum
-- on POST /v1/events (schemas.ts's EventInputSchema) is the actual
-- gatekeeper; keeping that enum in sync with the warehouse's
-- event_taxonomy seed is a manual, cross-repo contract with nothing
-- enforcing it - a known, accepted limitation, not an oversight.

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,           -- e.g. "evt_<uuid>"
  event_name     TEXT NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT NOT NULL DEFAULT 'website',

  -- Three distinct, independently-nullable identity concepts: anonymous_id
  -- is a persistent per-browser id that exists before either of the other
  -- two does; session_id is one visit; customer_id is a resolved account
  -- identity, set only once someone is logged in.
  anonymous_id   TEXT,
  session_id     TEXT,
  customer_id    TEXT REFERENCES customers(id),
  order_id       TEXT REFERENCES orders(id),

  ip_address     TEXT,                       -- for the per-IP send-rate limit, same pattern as otp_codes
  properties     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_customer_id ON events(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_ip_address_occurred_at ON events(ip_address, occurred_at);

-- Explicit and idempotent (GRANT is always safe to re-run) - see the header
-- note above on why this isn't left to the default-privilege mechanism.
-- ordering_reader is the sibling warehouse's read-only role; this is the
-- only cross-repo read path this table needs.
GRANT SELECT ON events TO ordering_reader;
