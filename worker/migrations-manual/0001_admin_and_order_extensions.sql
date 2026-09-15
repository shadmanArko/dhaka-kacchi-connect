-- PRODUCTION-ONLY, hand-run migration. Apply with, e.g.:
--   docker compose exec -T postgres psql -U postgres ordering \
--     < worker/migrations-manual/0001_admin_and_order_extensions.sql
--
-- NEVER apply this via `npm run db:migrate` - that command re-runs the
-- whole of schema.sql, which DROP TABLEs orders/customers/etc. on every
-- invocation. This file exists specifically because production now holds
-- real order data that a DROP-based migration would destroy. Every
-- statement below is additive (CREATE ... IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS) or wrapped to no-op if already applied, so it's safe to
-- re-run this file if you're ever unsure whether it already landed.
--
-- schema.sql has been updated to describe the same end state, so a fresh
-- local/dev database (via the normal DROP-based `npm run db:migrate`)
-- matches production after this file is applied there. The two files
-- must be kept in sync by hand - there is no real migration framework in
-- this repo yet (see worker/CLAUDE.md).
--
-- References ordering_reader, a role that only exists in the real
-- deployed Postgres instance (see deploy/postgres-init/01-init-databases.sh)
-- - this file will fail on a local dev database that has no such role,
-- which is expected; it is not meant to run there.

CREATE TABLE IF NOT EXISTS admin_users (
  id             TEXT PRIMARY KEY,           -- e.g. "adm_<uuid>"
  created_at     TEXT NOT NULL,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,              -- bcrypt hash; the real password is never stored
  name           TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id             TEXT PRIMARY KEY,           -- e.g. "asess_<uuid>"
  created_at     TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  admin_user_id  TEXT NOT NULL REFERENCES admin_users(id),
  token_hash     TEXT NOT NULL               -- sha256 of the bearer token; raw token never stored
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user_id ON admin_sessions(admin_user_id);

-- Closes a real gap: ordering_reader (the warehouse's read-only role,
-- used only by warehouse/ingest/direct.py) automatically inherits SELECT
-- on any new table via ALTER DEFAULT PRIVILEGES FOR ROLE ordering_app
-- (see postgres-init/01-init-databases.sh) - a rule that predates admin
-- auth existing and was never meant to expose admin credentials to a
-- completely different application's read-only role.
REVOKE ALL ON admin_users FROM ordering_reader;
REVOKE ALL ON admin_sessions FROM ordering_reader;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discounted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'customer';

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS - each DO block below
-- swallows "already exists" specifically (duplicate_object), so this file
-- stays safe to re-run without masking a genuinely different failure.
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_discount_cents
    CHECK (discount_cents >= 0 AND discount_cents <= subtotal_cents + delivery_fee_cents);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_created_by
    CHECK (created_by IN ('customer', 'staff'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT ck_orders_status
    CHECK (status IN ('received', 'confirmed', 'delivered', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
