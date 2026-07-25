#!/usr/bin/env bash
# Apply every migrations/*.sql in lexical order. Migrations must be idempotent.
#
#   ./scripts/migrate.sh                              local docker-compose database
#   DATABASE_URL=... ./scripts/migrate.sh --remote     the database that URL points at
#
# Neither mode needs psql installed on the host: local mode runs inside the db container,
# and remote mode borrows a psql from a throwaway postgres container when the host has none.
set -euo pipefail

cd "$(dirname "$0")/.."

mode=local
if [ "${1:-}" = '--remote' ]; then
  mode=remote
fi

if [ "$mode" = local ]; then
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
    echo "db container is not running — start it with: pnpm db:up" >&2
    exit 1
  fi
  run_psql() { docker compose exec -T db psql -U coach -d coach "$@"; }
else
  : "${DATABASE_URL:?remote mode needs DATABASE_URL (Render → database → External Connection String)}"
  if command -v psql >/dev/null 2>&1; then
    run_psql() { psql "$DATABASE_URL" "$@"; }
  else
    echo "no local psql — borrowing one from a throwaway postgres:16 container"
    run_psql() { docker run --rm -i postgres:16 psql "$DATABASE_URL" "$@"; }
  fi
fi

# Probe the real database, not just the server. During first-boot initialization Postgres
# runs a temporary server on the unix socket before `coach` exists, and pg_isready passes
# against it — so pg_isready alone races the entrypoint. A remote database answers at once
# or not at all, but the same probe surfaces a TLS or allow-list rejection before any
# migration is attempted.
echo "waiting for postgres ($mode)..."
attempts=60
if [ "$mode" = remote ]; then
  attempts=10
fi

ready=false
for _ in $(seq 1 "$attempts"); do
  if run_psql -c 'select 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  echo "could not reach postgres" >&2
  if [ "$mode" = remote ]; then
    echo "  · the external connection string needs TLS — append ?sslmode=require" >&2
    echo "  · if that fails on certificate validation, use ?sslmode=no-verify" >&2
    echo "  · check the database ip allow list covers your current IP" >&2
  fi
  exit 1
fi

for file in migrations/*.sql; do
  echo "applying $file"
  run_psql -v ON_ERROR_STOP=1 -q < "$file"
done

echo "migrations applied ($mode)"
