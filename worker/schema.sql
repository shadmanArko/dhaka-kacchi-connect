-- Dhaka Kacchi order backend schema (PostgreSQL)
--
-- Ported 1:1 from the retired Cloudflare D1/SQLite schema. Same lightweight
-- migration philosophy carries over unchanged: one idempotent file, explicit
-- DROP TABLE IF EXISTS before each CREATE, run manually via `npm run
-- db:migrate` (scripts/migrate.ts) - NEVER automatically on container start,
-- since a DROP TABLE in a startup hook is a live-data landmine the day this
-- table stops being empty. There is still no real migrations chain and still
-- no production data worth preserving across a schema change; the day that
-- stops being true is the day to introduce a real migration tool (e.g.
-- node-pg-migrate), not before.
--
-- Type mapping from SQLite, decided deliberately, not defaulted:
--   TEXT                    -> TEXT             (unchanged, INCLUDING
--     created_at/delivery_date - deliberately NOT TIMESTAMPTZ/DATE, so a
--     future SELECT never silently hands back a JS Date where the app
--     expects an ISO string)
--   REAL                    -> DOUBLE PRECISION  (NOT Postgres's own REAL,
--     which is 4-byte single precision and would silently lose coordinate
--     precision - SQLite's REAL is an 8-byte double, matching DOUBLE PRECISION)
--   INTEGER (money, cents)  -> INTEGER            (unchanged - this codebase's
--     house convention is integer minor units, never NUMERIC/float)
--   INTEGER 0/1-as-boolean  -> BOOLEAN            (email_sent, whatsapp_sent -
--     safe because no SELECT anywhere reads these back today)
--   INTEGER PK AUTOINCREMENT -> BIGINT GENERATED ALWAYS AS IDENTITY
--     (order_items.id only - pay the trivial extra-bytes cost now, while the
--     table is empty, rather than ever widen a live primary key later)
--
-- One deliberate ADDITION beyond a faithful port: orders.updated_at. Every
-- design pass this project went through flagged the same gap - no way to do
-- incremental sync, ever, without it. Closing it now costs one column while
-- the table is still empty.
--
-- Customer accounts (added later, same file/philosophy): `created_at` stays
-- TEXT everywhere for the same "never hand back a JS Date where an ISO
-- string is expected" reason above. But `expires_at`/`consumed_at`/
-- `used_at`/`locked_until` on the new tables below are TIMESTAMPTZ, not
-- TEXT - unlike `created_at`, these are always compared against `now()`
-- directly in SQL (`WHERE expires_at > now()`), so they need real
-- timestamp semantics, not string equality. This mirrors why
-- `orders.updated_at` above is already TIMESTAMPTZ, not TEXT: the rule is
-- "TEXT for values only ever passed through," TIMESTAMPTZ for values SQL
-- itself needs to reason about.

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS customers;

CREATE TABLE IF NOT EXISTS customers (
  id                    TEXT PRIMARY KEY,               -- e.g. "cust_<uuid>"
  created_at            TEXT NOT NULL,                  -- ISO 8601 UTC
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Both are login identifiers (phone-or-email + password) and are locked
  -- immutable once the account is verified - see auth.ts / CLAUDE.md.
  phone                 TEXT NOT NULL,
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,                  -- bcrypt hash; the real password is never stored

  name                  TEXT NOT NULL,                  -- editable at checkout
  date_of_birth         TEXT NOT NULL,                  -- ISO date (YYYY-MM-DD)

  -- The customer's saved/default address; editable at checkout, which
  -- writes the edit back here (see ordersRepository.ts's updateProfile).
  address_street        TEXT NOT NULL,
  address_house_number  TEXT NOT NULL,
  address_postal_code   TEXT NOT NULL,
  address_city          TEXT NOT NULL,

  -- Login brute-force guard (see auth.ts). Reset to 0/NULL on a successful login.
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Registration-only: a 6-digit code texted to a phone to prove it's real
-- before an account is created. The pending_* columns hold the whole
-- would-be account until the code is confirmed, so an abandoned signup
-- never leaves a half-created `customers` row behind - see auth.ts /
-- customersRepository.ts.
--
-- This app generates the code itself and texts it via BerlinSMS's plain
-- SMS API (see berlinSms.ts) - chosen over BerlinSMS's managed 2FA product
-- specifically so the message text is fully customizable (the managed 2FA
-- product's wording isn't).
CREATE TABLE IF NOT EXISTS otp_codes (
  id                             TEXT PRIMARY KEY,       -- e.g. "otp_<uuid>"
  created_at                     TEXT NOT NULL,
  expires_at                     TIMESTAMPTZ NOT NULL,
  consumed_at                    TIMESTAMPTZ,             -- set once verified; NULL while pending
  attempts                       INTEGER NOT NULL DEFAULT 0,

  phone                          TEXT NOT NULL,           -- the phone the code was texted to
  ip_address                     TEXT,                    -- for the per-IP send-rate limit; NULL if unknown
  code_hash                      TEXT NOT NULL,           -- sha256 of the 6-digit code; the raw code is never stored

  pending_name                   TEXT NOT NULL,
  pending_email                  TEXT NOT NULL,
  pending_password_hash          TEXT NOT NULL,
  pending_date_of_birth          TEXT NOT NULL,
  pending_address_street         TEXT NOT NULL,
  pending_address_house_number   TEXT NOT NULL,
  pending_address_postal_code    TEXT NOT NULL,
  pending_address_city           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_ip_address ON otp_codes(ip_address);

-- "Forgot password," email-only (never phone/SMS - a deliberate choice, see
-- CLAUDE.md). One row per emailed reset link.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            TEXT PRIMARY KEY,                        -- e.g. "prt_<uuid>"
  created_at    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,                              -- set once the link is used; NULL while pending
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  token_hash    TEXT NOT NULL                             -- sha256 of the token in the emailed link; raw token never stored
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_customer_id ON password_reset_tokens(customer_id);

-- One row per logged-in device. Logging out deletes the row outright
-- (simplest correct revocation - no soft-delete/`revoked_at` bookkeeping to
-- filter around on every lookup).
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,                        -- e.g. "sess_<uuid>"
  created_at    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  token_hash    TEXT NOT NULL                             -- sha256 of the bearer token; raw token never stored
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_customer_id ON sessions(customer_id);

CREATE TABLE IF NOT EXISTS orders (
  id                    TEXT PRIMARY KEY,               -- e.g. "ord_<uuid>"
  created_at            TEXT NOT NULL,                  -- ISO 8601 UTC
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_date         TEXT NOT NULL,                  -- ISO date (YYYY-MM-DD), always a Saturday

  fulfillment_type      TEXT NOT NULL,                  -- 'pickup' | 'delivery'

  -- Delivery-only fields; NULL when fulfillment_type = 'pickup'.
  address_street        TEXT,
  address_house_number  TEXT,
  address_postal_code   TEXT,
  address_city          TEXT,                           -- free text; UI defaults to 'Berlin' but user can edit
  address_lat           DOUBLE PRECISION,                -- snapshot at order time (audit/debug)
  address_lng           DOUBLE PRECISION,
  distance_km           DOUBLE PRECISION,                -- straight-line km from the kitchen, snapshot at order time
  delivery_fee_cents    INTEGER NOT NULL DEFAULT 0,      -- server-computed; always 0 for pickup

  -- Every order belongs to a real account now (no more guest checkout).
  -- customer_name/email/phone stay exactly as they were - a snapshot of
  -- the order at the time it was placed, same convention order_items.name
  -- already uses for menu items - NOT a join to `customers`, so an account
  -- edit made later never silently rewrites a past order's record.
  customer_id           TEXT NOT NULL REFERENCES customers(id),
  customer_name         TEXT NOT NULL,
  customer_email        TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  notes                 TEXT,
  subtotal_cents        INTEGER NOT NULL,                -- items only, excludes delivery_fee_cents
  payment_method        TEXT NOT NULL DEFAULT 'cash_on_delivery',
  status                TEXT NOT NULL DEFAULT 'received', -- received | confirmed | delivered | cancelled
  email_sent            BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_sent         BOOLEAN NOT NULL DEFAULT FALSE   -- replaces whatsapp_sent - see telegram.ts
);

CREATE TABLE IF NOT EXISTS order_items (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id),
  sku                TEXT NOT NULL,                 -- e.g. "kacchi_taster", "kacchi_regular", "borhani"
  name               TEXT NOT NULL,                 -- snapshot of the item name at order time
  unit_price_cents   INTEGER NOT NULL,               -- snapshot of the price at order time
  quantity           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
