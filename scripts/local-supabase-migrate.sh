#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
DB_SERVICE="${DB_SERVICE:-supabase-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
MIGRATION_SCOPE="${MIGRATION_SCOPE:-affiliate}"

echo "Waiting for local Supabase Postgres..."
for _ in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null

if [ "$MIGRATION_SCOPE" = "all" ]; then
  mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort)
else
  migrations=(
    "supabase/migrations/001_initial_schema.sql"
    "supabase/migrations/002_official_api_readiness.sql"
    "supabase/migrations/003_helpers.sql"
    "supabase/migrations/20260514000000_affiliate_analytics.sql"
  )
fi

for migration in "${migrations[@]}"; do
  if [ ! -f "$migration" ]; then
    echo "Missing migration: $migration" >&2
    exit 1
  fi
  echo "Applying $migration"
  docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$migration"
done

echo "Local migrations applied."
