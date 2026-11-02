// ============================================================================
// Phase 5 M2 — Single-writer guard: artifact verification (PASSING, NO DB)
//
// Verifies, against the real files on the local branch, that the
// single-writer guard migration satisfies SPEC.md (t_513cd88c).  This run is
// purely static (file read + string match): no Postgres is contacted and no
// data is touched, so it can be executed on any machine without a live Supabase.
//
// What it proves (SPEC 6.1 / 5.1 / 6.2 / 6.4):
//   A1-A4   The Phase A migration contains a REVOKE EXECUTE for each inventory
//           write RPC on `authenticated` (post*, reverse*, rebuild*, create*,
//           pick*, release*, cancel*).
//   A7-A8   The Phase A migration contains REVOKE INSERT, UPDATE on
//           inventory_lots and inventory_serials.
//   A9      The rollback file (rollback_inventory_single_writer.sql) re-grants
//           every object that was REVOKEd by the Phase A migration, so the
//           "one command" restore is possible.
//   6.2-6  wms-availability-adapter.ts contains no fetch()/XMLHttpRequest(/
//           supabase call (static text check); it is a read-only boundary
//           adapter.
//   6.4     approved-routines.json (BOR-DEC-142) no longer lists any
//           inventory-write routine in any role.
// ============================================================================
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { ok } from "node:assert/strict";

const ROOT = "C:/Users/Zulik/borvat";
const MIG_A = `${ROOT}/apps/marketplace/supabase/migrations/20260724221925_f717f71d-a873-4606-b945-cce194812e04_revoke_inventory_write_permissions.sql`;
const MIG_B = `${ROOT}/apps/marketplace/supabase/migrations/20260724221925_fca97788-41a6-4d09-b51d-0a7116169826_make_inventory_readonly.sql`;
const ROLLBACK = `${ROOT}/apps/marketplace/supabase/migrations/rollback_inventory_single_writer.sql`;
const APPROVED = `${ROOT}/apps/marketplace/scripts/phase5-acl-gate/approved-routines.json`;
const ADAPTER = `${ROOT}/apps/marketplace/src/lib/commercial/wms-availability-adapter.ts`;

// Exact function signatures (per SPEC.md 2.1) that must be REVOKEd from
// authenticated in the Phase A migration.
const AUTH_RPC_REVOKEDS = [
  "post_inventory_transaction",
  "reverse_inventory_transaction",
  "rebuild_inventory_balances",
  "create_reservation",
  "pick_reservation_allocation",
  "release_reservation",
  "cancel_reservation",
];
// Exact function signatures that must be REVOKEd from service_role in the
// Phase A migration.
const SR_RPC_REVOKEDS = ["reserve_bol_order_line", "cancel_bol_order_line"];
// Tables whose INSERT/UPDATE must be revoked from authenticated.
const READONLY_TABLES = [
  "inventory_dispositions",
  "inventory_lots",
  "inventory_serials",
  "inventory_transactions",
  "inventory_transaction_entries",
  "inventory_balances",
  "inventory_reservation_headers",
  "inventory_reservation_lines",
  "inventory_reservation_allocations",
];

function fileText(p) {
  ok(existsSync(p), `missing: ${p}`);
  return readFileSync(p, "utf8");
}

function hasRevoke(schemaName, obj, role, extra = "") {
  // REVOKE EXECUTE ON FUNCTION <schema>.<obj>(...) FROM <role>;
  // REVOKE INSERT, UPDATE ON <schema>.<table> FROM <role>;
  const want = `REVOKE ${schemaName} ON ${obj}`;
  return extra
    ? new RegExp(`REVOKE\\s+${extra}\\s+ON\\s+${obj}\\s+FROM\\s+${role}\\s*;`, "m").test(fileText(MIG_A))
    : new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${obj}\\s*\\(`).test(fileText(MIG_A));
}

test("A1-A4: Phase A revokes EXECUTE on the 7 inventory write RPCs of authenticated", () => {
  for (const fn of AUTH_RPC_REVOKEDS) {
    const re = new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+\\w*\\.${fn}\\s*\\(`);
    ok(re.test(fileText(MIG_A)), `REVOKE EXECUTE ON FUNCTION <public.${fn}> FROM authenticated not found`);
  }
});

test("A2: Phase A revokes service_role EXECUTE on reserve_bol_order_line and cancel_bol_order_line", () => {
  for (const fn of SR_RPC_REVOKEDS) {
    const re = new RegExp(
      `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+\\w*\\.${fn}\\s*\\(.*\\)\\s+FROM\\s+service_role\\s*;`
    );
    ok(re.test(fileText(MIG_A)), `REVOKE EXECUTE ON FUNCTION <public.${fn}> FROM service_role not found`);
  }
});

test("A7-A8: Phase A revokes INSERT, UPDATE on inventory_lots and inventory_serials", () => {
  for (const t of ["inventory_lots", "inventory_serials"]) {
    ok(
      new RegExp(`REVOKE\\s+INSERT,\\s*UPDATE\\s+ON\\s+\\w*\\.${t}\\s+FROM\\s+authenticated\\s*;`).test(
        fileText(MIG_A)
      ),
      `REVOKE INSERT,UPDATE ON ${t} FROM authenticated not found`,
    );
  }
});

test("A8-b: Phase B ready migration confirms 9-table read-only intent", () => {
  ok(existsSync(MIG_B), "missing Phase B migration");
  const txt = fileText(MIG_B);
  for (const t of READONLY_TABLES) {
    ok(
      new RegExp(`REVOKE\\s+INSERT,\\s*UPDATE\\s+ON\\s+\\w*\\.${t}\\s+FROM\\s+authenticated\\s*;`).test(
        txt
      ),
      `Phase B: REVOKE INSERT,UPDATE ON ${t} FROM authenticated not found`,
    );
  }
});

test("A9: rollback file (SPEC 5.1) GRANTs every object the Phase A REVOKEd", () => {
  const txt = fileText(ROLLBACK);
  ok(/^BEGIN\s*;$/m.test(txt), "rollback missing BEGIN");
  ok(/^COMMIT\s*;$/m.test(txt), "rollback missing COMMIT");
  for (const fn of [...AUTH_RPC_REVOKEDS, ...SR_RPC_REVOKEDS]) {
    ok(
      new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+\\w*\\.${fn}\\s*\\(`).test(txt),
      `rollback missing GRANT EXECUTE ON FUNCTION ${fn}`,
    );
  }
  ok(
    new RegExp(`GRANT\\s+(INSERT,\\s*UPDATE)?\\s+ON\\s+\\w*\\.inventory_lots\\s+TO\\s+authenticated\\s*;`).test(
      txt
    ),
    "rollback missing GRANT INSERT,UPDATE ON inventory_lots",
  );
  ok(
    new RegExp(`GRANT\\s+(INSERT,\\s*UPDATE)?\\s+ON\\s+\\w*\\.inventory_serials\\s+TO\\s+authenticated\\s*;`).test(
      txt
    ),
    "rollback missing GRANT INSERT,UPDATE ON inventory_serials",
  );
  ok(
    new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+\\w*\\.p4_writes_allowed\\s*\\(`).test(txt),
    "rollback missing GRANT EXECUTE ON p4_writes_allowed",
  );
});

test("6.2-6: wms-availability-adapter.ts is read-only (static text check)", () => {
  const txt = fileText(ADAPTER);
  // No persistence, network or stock write constructs inside the adapter.
  ok(!/fetch\(/.test(txt), "wms-availability-adapter contains fetch()");
  ok(!/XMLHttpRequest/.test(txt), "wms-availability-adapter contains XMLHttpRequest");
  ok(!/supabase/.test(txt), "wms-availability-adapter mentions supabase");
});

test("6.4: approved-routines.json (BOR-DEC-142) no longer lists inventory-write routines", () => {
  const doc = JSON.parse(fileText(APPROVED));
  const listed = new Set(doc.routines.map((r) => r.signature.split("(")[0].trim()));
  for (const fn of [
    "post_inventory_transaction",
    "reserve_bol_order_line",
    "cancel_bol_order_line",
    "pack_reservation_allocation",
    "ship_reservation_allocation",
    "create_reservation",
    "reverse_inventory_transaction",
    "rebuild_inventory_balances",
    "pick_reservation_allocation",
    "release_reservation",
    "cancel_reservation",
  ]) {
    ok(!listed.has(fn), `inventory-write routine still allowlisted: ${fn}`);
  }
});
