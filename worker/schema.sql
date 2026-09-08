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

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;

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

  customer_name         TEXT NOT NULL,
  customer_email        TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  notes                 TEXT,
  subtotal_cents        INTEGER NOT NULL,                -- items only, excludes delivery_fee_cents
  payment_method        TEXT NOT NULL DEFAULT 'cash_on_delivery',
  status                TEXT NOT NULL DEFAULT 'received', -- received | confirmed | delivered | cancelled
  email_sent            BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_sent         BOOLEAN NOT NULL DEFAULT FALSE
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
