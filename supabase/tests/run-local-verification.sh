#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Execute and verify the StudyFlow migration against a LOCAL PostgreSQL.
#
# This is not a substitute for running the migration on Supabase -- it proves
# the SQL is valid and that the security behaviour is what we claim, using a
# shim that reproduces the parts of Supabase the migration depends on.
#
# Creates a throwaway database, runs everything, drops it again. Existing
# databases are never touched.
#
#   PGPASSWORD=postgres bash supabase/tests/run-local-verification.sh
# ---------------------------------------------------------------------------
set -euo pipefail

PSQL="${PSQL:-psql}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
DB="studyflow_verify_$$"

command -v "$PSQL" >/dev/null 2>&1 || {
  echo "psql not found. Set PSQL to its full path, e.g."
  echo "  PSQL='/c/Program Files/PostgreSQL/16/bin/psql.exe' bash $0"
  exit 1
}

run() { "$PSQL" -w -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

cleanup() { run -d postgres -q -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ creating throwaway database $DB"
run -d postgres -q -c "create database $DB;"

echo "→ applying Supabase shim"
run -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_supabase_shim.sql

echo "→ applying migration (run 1)"
run -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_auth_and_profiles.sql

echo "→ applying migration again (idempotency check)"
run -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/0001_auth_and_profiles.sql

echo "→ running verification suite"
run -d "$DB" -v ON_ERROR_STOP=1 -P pager=off -f supabase/tests/01_verify_profiles.sql

echo "✓ all checks passed"
