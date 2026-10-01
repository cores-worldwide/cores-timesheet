#!/usr/bin/env bash
# Dev/test database: cores-timesheets-dev (free "BLD DEV" Supabase org).
# Never the live database. Holds the Cores schema (supabase/dev/cores-schema.sql)
# and fake data (supabase/dev/seed.sql).
#
#   scripts/dev-db.sh setup   # wipe the Cores schema, load schema + fake data
#   scripts/dev-db.sh psql    # open a SQL prompt on the dev database
#
# The DB password lives in ~/.config/cores-dev/db-password (outside the repo).
# The app points at this database via .env.development.local (gitignored):
#   VITE_SUPABASE_URL=https://giwexoouqxioxkjhoxoe.supabase.co
#   VITE_SUPABASE_ANON_KEY=<dev project's anon key>
#   VITE_DEV_DATABASE=1   (turns the local-dev banner green)
set -euo pipefail

REF=giwexoouqxioxkjhoxoe
HOST=aws-0-us-east-2.pooler.supabase.com
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PGPASSWORD="$(cat "$HOME/.config/cores-dev/db-password")"
CONN="host=$HOST port=5432 dbname=postgres user=postgres.$REF sslmode=require"

case "${1:-}" in
  setup)
    psql "$CONN" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS "Cores" CASCADE;
SQL
    psql "$CONN" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/dev/cores-schema.sql"
    psql "$CONN" -v ON_ERROR_STOP=1 -q -f "$DIR/supabase/dev/seed.sql"
    # The dev project already exposes "Cores" to the API (set once with
    # `supabase config push --project-ref giwexoouqxioxkjhoxoe` and an [api]
    # schemas list; setting pgrst.db_schemas in SQL breaks its API). Just make
    # the API reload the rebuilt tables.
    psql "$CONN" -q -c "NOTIFY pgrst, 'reload schema';"
    echo "Dev database rebuilt with fake data."
    ;;
  psql)
    exec psql "$CONN"
    ;;
  *)
    echo "usage: $0 setup|psql" >&2; exit 1 ;;
esac
