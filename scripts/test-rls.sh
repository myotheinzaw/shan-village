#!/usr/bin/env bash
# Rebuilds the test database from the real migrations and runs the security suite.
set -euo pipefail
DB="${SHAN_TEST_DB:-shan_village_test}"
bash "$(dirname "$0")/db-reset.sh"
su postgres -c "psql -v ON_ERROR_STOP=1 -d $DB -f $(pwd)/scripts/test-rls.sql"
