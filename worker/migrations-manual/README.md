# Manual (production-safe) migrations

`schema.sql` (one directory up) is the *fresh-install* source of truth —
applied via `npm run db:migrate`, which `DROP TABLE`s everything first.
That's fine for local dev or a genuinely empty database; it is **not**
safe to run against production anymore, now that real orders exist
(`scripts/migrate.ts` actively refuses to unless you pass
`ALLOW_DESTRUCTIVE_MIGRATE=1`).

Files in this directory are the opposite: additive-only SQL, meant to be
applied by hand, directly against the live database, e.g.:

```bash
docker compose exec -T postgres psql -U postgres ordering \
  < worker/migrations-manual/0001_admin_and_order_extensions.sql
```

Each file should:
- Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or a
  `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` wrapper for
  constraints (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`) — safe to
  re-run without knowing whether it already landed.
- Never `DROP`/`TRUNCATE` anything.
- Also be reflected in `schema.sql`'s own `CREATE TABLE` statements, kept
  in sync **by hand** — there is no real migration framework here yet
  (the sibling `warehouse/` Python project already has one, Alembic;
  introducing the equivalent for this Node backend is a reasonable
  follow-up now that production data exists, just out of scope for
  whatever feature first needed this directory).

Numbered sequentially (`0001_`, `0002_`, ...), same convention as the
warehouse's own `migrations/versions/`, but with no tooling enforcing
order or tracking what's applied — that bookkeeping is manual too, for now.
