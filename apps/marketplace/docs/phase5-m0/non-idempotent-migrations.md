# M0-E1 — Non-idempotent migrations

**Status:** NOT EXECUTED IN THIS ENVELOPE.

Detecting non-idempotent migrations requires running each migration under
`psql -v ON_ERROR_STOP=1 -f <file>` twice against a scratch database and
recording the second-run outcome. The scratch database could not be created
in this sandbox — see `docs/phase5-m0/replay-log.txt` for the failure mode
and the required off-sandbox procedure.

No migration is currently attested as idempotent or non-idempotent. This
file remains empty of concrete findings until the clean-room replay runs.
