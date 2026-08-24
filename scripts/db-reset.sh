#!/usr/bin/env bash
# Rebuilds the local test database from scratch: the Supabase auth shim, then
# every migration in order. Used by scripts/test-rls.sh; safe to run repeatedly.
set -euo pipefail

DB="${SHAN_TEST_DB:-shan_village_test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

as_pg() { su postgres -c "PGOPTIONS='-c client_min_messages=warning' $*"; }

as_pg "dropdb --if-exists $DB"
as_pg "createdb $DB"
as_pg "psql -v ON_ERROR_STOP=1 -q -d $DB -f $ROOT/scripts/local-auth-shim.sql" > /dev/null

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  as_pg "psql -v ON_ERROR_STOP=1 -q -d $DB -f $f" > /dev/null
done

echo "Database $DB ready."
