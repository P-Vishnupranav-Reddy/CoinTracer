# Database setup (unified)

This folder consolidates the schema and seeds for all services:
- Core portfolio/exchange schema (users, portfolios, holdings, transactions, exchange_connections, sync_logs, views, functions)
- Personalization and Alerts tables (favorites, alerts) used by personalization-service and notification-service

## Files
- schema.sql — Full schema including pgcrypto extension, core tables, favorites, alerts
- seed.sql — Optional seed data for quick local testing

## Usage
1) Ensure PostgreSQL is running and your environment variables are set (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD).
2) Apply schema:
   - psql -f schema.sql
3) Seed (optional):
   - psql -f seed.sql

If you use a GUI, run `schema.sql` first, followed by `seed.sql`.

Notes:
- Uses `gen_random_uuid()` from pgcrypto; schema enables the extension.
- `user-service` issues JWT tokens and manages `public.users`.
- `exchange_connections` consumes the same database and will auto-create holdings from transactions using provided function.
