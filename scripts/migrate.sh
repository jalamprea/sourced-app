#!/usr/bin/env bash
# Apply every migrations/*.sql in lexical order, inside the db container.
# No local psql required. Migrations must be idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "db container is not running — start it with: pnpm db:up" >&2
  exit 1
fi

# Probe the real database, not just the server. During first-boot initialization
# Postgres runs a temporary server on the unix socket before `coach` exists, and
# pg_isready passes against it — so pg_isready alone races the entrypoint.
echo "waiting for postgres..."
ready=false
for _ in $(seq 1 60); do
  if docker compose exec -T db psql -U coach -d coach -c 'select 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "postgres did not become ready in 60s" >&2
  exit 1
fi

for file in migrations/*.sql; do
  echo "applying $file"
  docker compose exec -T db psql -U coach -d coach -v ON_ERROR_STOP=1 -q < "$file"
done

echo "migrations applied"
