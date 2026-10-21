#!/usr/bin/env bash
# scripts/phase5-m0/verify-hotfix-acl.sh
# Assert P5-HF-001 invariants on the CURRENT clean-room DB.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"
require_cleanroom_env

fail=0
require_ok() { local m="$1"; shift; if ! "$@"; then echo "FAIL: $m"; fail=1; else echo "OK  : $m"; fi; }

# 1. place_order exists.
exists=$(psql_quiet -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='place_order'")
if [[ "$exists" -lt 1 ]]; then echo "FAIL: public.place_order missing"; fail=1; else echo "OK  : public.place_order present"; fi

# 2. No EXECUTE on place_order for any non-admin role.
for role in anon authenticated service_role public; do
  set +e
  has=$(psql_quiet -c "
    select bool_or(has_function_privilege('${role}', p.oid, 'EXECUTE'))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='place_order'
  ")
  ec=$?
  set -e
  if [[ $ec -ne 0 ]]; then
    echo "HARNESS FAILURE — hotfix ACL probe failed for role '${role}'" >&2
    exit 70
  fi
  if [[ "$has" == "t" ]]; then
    echo "FAIL: role '${role}' still has EXECUTE on place_order"; fail=1
  else
    echo "OK  : role '${role}' has NO EXECUTE on place_order"
  fi
done

exit $fail
