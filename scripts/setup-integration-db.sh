#!/usr/bin/env bash
# Stand up a throwaway local Postgres with the full production schema, for
# `npm run test:integration`. The Prisma CLI schema engine hangs in some
# sandboxes, so we replicate the schema by dumping it from the live DB
# (schema-only, no data — read-only) and loading it locally.
#
# Requires: local `postgres`/`initdb`/`psql` (brew postgresql@16) and a
# PG17+ `pg_dump` (brew libpq) since the Supabase server is PG17.
#
# Usage:
#   ./scripts/setup-integration-db.sh
#   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/zimplifyed_test \
#     npm run test:integration
set -euo pipefail

PORT="${ITEST_PG_PORT:-5433}"
DB="${ITEST_PG_DB:-zimplifyed_test}"
ROOT="${ITEST_PG_ROOT:-/tmp/zimplifyed-itest-pg}"
SOCK="/tmp/zpg"
PGDUMP="${PGDUMP:-/opt/homebrew/opt/libpq/bin/pg_dump}"

DIRECT=$(grep -o 'DIRECT_URL="[^"]*"' .env.local | sed 's/DIRECT_URL=//;s/"//g')
[ -n "$DIRECT" ] || { echo "DIRECT_URL not found in .env.local"; exit 1; }

# 1. Fresh cluster
rm -rf "$ROOT"; mkdir -p "$ROOT/data"; mkdir -p "$SOCK"
initdb -D "$ROOT/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$ROOT/data" -o "-p $PORT -k $SOCK -c listen_addresses='127.0.0.1'" -l "$ROOT/pg.log" start
sleep 2
createdb -h 127.0.0.1 -p "$PORT" -U postgres "$DB"

# 2. Dump the live schema (structure only) and sanitize for local PG16
DUMP="$ROOT/schema.sql"
"$PGDUMP" --schema-only --no-owner --no-privileges --schema=public "$DIRECT" \
  | grep -v 'transaction_timeout' \
  | sed 's/^CREATE SCHEMA public;/-- CREATE SCHEMA public;/' \
  | sed 's/public\.vector([0-9]*)/text/g' \
  > "$DUMP"

# 3. Load
psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" -q -c "drop schema public cascade; create schema public;" >/dev/null
psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DUMP"

TABLES=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" -tAc "select count(*) from information_schema.tables where table_schema='public';")
echo "✓ integration DB ready on 127.0.0.1:$PORT/$DB ($TABLES tables)"
echo "  export DATABASE_URL=postgresql://postgres@127.0.0.1:$PORT/$DB && npm run test:integration"
echo "  stop with: pg_ctl -D $ROOT/data stop"
