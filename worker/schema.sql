-- Dhaka Kacchi order backend schema (Cloudflare D1 / SQLite)
--
-- BREAKING CHANGE: the old station-based free-delivery model (`station TEXT
-- NOT NULL`, a fixed list of ~27 named transit stops) is retired in favor of
-- two fulfillment modes: free pickup at the kitchen, or paid doorstep
-- delivery within Berlin priced by distance looked up from the customer's own
-- postal code (see worker/src/lib/plzLookup.ts) - no geocoding API, no
-- external account, no cost. Only test data ever existed in `orders`, so this
-- is a clean drop + recreate rather than a backward-compatible migration.
--
-- MIGRATION MECHANISM NOTE: db:migrate:local/remote just run
-- `wrangler d1 execute --file=./schema.sql` - there is no migrations
-- directory. `CREATE TABLE IF NOT EXISTS` with a changed column list would
-- silently no-op against a database that already has the old table, since D1
-- has no auto-ALTER. The explicit DROPs below are what make a schema change
-- actually apply when this file is re-run.

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS geocode_cache;   -- retired: no more external geocoding to cache

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,               -- e.g. "ord_<uuid>"
  created_at TEXT NOT NULL,          -- ISO 8601 UTC
  delivery_date TEXT NOT NULL,       -- ISO date (YYYY-MM-DD), always a Saturday

  fulfillment_type TEXT NOT NULL,    -- 'pickup' | 'delivery'

  -- Delivery-only fields; NULL when fulfillment_type = 'pickup'.
  address_street TEXT,
  address_house_number TEXT,
  address_postal_code TEXT,
  address_city TEXT,                 -- free text; UI defaults to 'Berlin' but user can edit
  address_lat REAL,                  -- geocoded, snapshot at order time (audit/debug)
  address_lng REAL,
  distance_km REAL,                  -- straight-line km from the kitchen, snapshot at order time
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0, -- server-computed; always 0 for pickup

  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  notes TEXT,
  subtotal_cents INTEGER NOT NULL,   -- items only, excludes delivery_fee_cents
  payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
  status TEXT NOT NULL DEFAULT 'received', -- received | confirmed | delivered | cancelled
  email_sent INTEGER NOT NULL DEFAULT 0,
  whatsapp_sent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,                 -- e.g. "kacchi_taster", "kacchi_regular", "borhani"
  name TEXT NOT NULL,                -- snapshot of the item name at order time
  unit_price_cents INTEGER NOT NULL, -- snapshot of the price at order time
  quantity INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
