#!/bin/sh
# Runs once, on first start of an empty data directory. Creates one login role and
# one schema per service, each role limited to its own schema (SECURITY A9).
# Names come from the fixed list below and are checked. Passwords are checked, then
# read by psql from the environment (\getenv, so never in argv) and quoted by
# format(%I / %L); nothing is spliced into SQL by the shell.
set -eu

SERVICES="sessions reports goals battery system focus gateway"
PLACEHOLDER_PREFIX="change-me"

fail() {
  echo "init: $1" >&2
  exit 1
}

for service in $SERVICES; do
  case "$service" in
    *[!a-z]*) fail "invalid service name" ;;
  esac
  var="$(printf '%s' "$service" | tr 'a-z' 'A-Z')_DB_PASSWORD"
  eval "password=\${$var:-}"
  [ -n "$password" ] || fail "$var is not set"
  case "$password" in
    "$PLACEHOLDER_PREFIX"*) fail "$var is still a placeholder; run npm run setup" ;;
  esac

  ROLE_PASSWORD="$password" psql -v ON_ERROR_STOP=1 -v svc="$service" \
    --username postgres --dbname postgres <<'SQL'
\getenv pw ROLE_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'svc', :'pw') \gexec
SELECT format('CREATE SCHEMA %I AUTHORIZATION %I', :'svc', :'svc') \gexec
SELECT format('ALTER ROLE %I SET search_path = %I', :'svc', :'svc') \gexec
SQL
done

# Nothing is shared: no role may create objects in, or even see into, public.
psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO PUBLIC;
SQL
