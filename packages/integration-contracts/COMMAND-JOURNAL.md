# Durable integration intent journal

`command-journal.mjs` is an isolated server-side coordinator building block, not a deployed
adapter, HTTP/authentication service or replacement commerce engine. Node24 SQLite stores
only command envelopes, immutable request hashes, outcomes, retry counts and worker leases.
There are no stock quantities, reservations, invoice numbers, GL entries, vendor balances
or loyalty balances here. No receiver is configured by default and no URL/secret is read.

A trusted server authorizer must resolve current company/operation permission on every
read, enqueue and dispatch. Passing browser JSON as principal/authorize is unsafe. Bind
operation payload schemas and company/operator mapping in a reviewed server adapter before
using this journal. The metadata envelope is not certified as the proposed OpenAPI or
upstream Frappe route contract; native schema and UUID mapping remain integration work.

`enqueue` durably records one company/source/operation/external key. A changed body under
that identity conflicts. `run` claims a bounded lease, performs receiver lookup before every
possible dispatch, never holds a DB transaction across I/O, and only accepts completed/
rejected evidence matching the command and company. Ambiguous lookup or transport failure
stays `unknown`. Same-key replay and receiver durable dedup are mandatory; no fallback to a
new business ID or simulated successful result. Exhausted dispatch budget remains visible
and lookup recovery is still allowed. A receiver declaring these semantics must actually
prove them; the declaration alone is not verification.

Tests use actual disposable SQLite files and separate DB connections. The remote receiver
is an explicit in-memory test double. Lost-response and retry tests prove coordinator
semantics, not ERPNext, PSP, carrier, true tenant authentication or upstream compatibility.
No actual native last-unit inventory race is tested here.

Run `node --test tests/integration-contracts/*.test.mjs`. Node24 is required; SQLite is a
local test transport choice. Multi-host production workers need a reviewed shared database,
identity boundary, migration/backup/recovery and operational controls before adoption.
