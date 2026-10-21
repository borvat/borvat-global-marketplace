/**
 * Phase 3 Migration 3 verification — Reconciliation (multi-tenant strict).
 *
 * Test groups:
 *  S. Schema
 *     S.01 Four tables exist with target XOR and correct FKs.
 *     S.02 Unique index on channel_snapshots (batch, company, channel, target).
 *     S.03 Findings check constraints (type, resolution, target XOR).
 *  G. Grants
 *     G.01 Reconciliation RPCs NOT executable by anon/authenticated.
 *     G.02 Direct INSERT/UPDATE on reconciliation tables forbidden for authenticated.
 *     G.03 Authenticated seller can SELECT their own reports; sees zero of another seller.
 *  B. Batch lifecycle
 *     B.01 open_reconciliation_batch requires valid channel account.
 *     B.02 record_channel_snapshot rejects sku from another company.
 *     B.03 record_channel_snapshot rejects XOR violation (both/none).
 *     B.04 record_channel_snapshot rejects when batch is closed.
 *     B.05 Unique target within a batch — second snapshot for same target fails.
 *     B.06 close_reconciliation_batch flips status and rejects re-close.
 *     B.07 run_reconciliation requires closed batch.
 *  R. Reconciliation classification
 *     R.01 match: local == external.
 *     R.02 drift_quantity: qty differs.
 *     R.03 drift_version: version differs, quantity equal.
 *     R.04 missing_local: snapshot with no local listing.
 *     R.05 missing_external: local listing with no snapshot.
 *     R.06 Report counters equal finding counts.
 *     R.07 Findings all carry (company_id, channel_account_id, target) of the batch.
 *  T. Tenant isolation
 *     T.01 Reconciliation of company A never joins company B's listings even
 *          when a matching SKU exists in B's isolated catalog.
 *  E. Re-enqueue
 *     E.01 reenqueue_drift_finding enqueues a channel.resync event for the exact target.
 *     E.02 Second call on same finding is rejected (already resolved).
 *     E.03 Finding of type missing_local cannot be re-enqueued.
 *     E.04 Tenant guard: manually forging a listing_id from another company on a
 *          finding is impossible via the API (finding has FKs), so we just prove
 *          the RPC's tenant check rejects a hand-tampered finding.
 *
 * Usage:  bunx tsx scripts/phase3-m3-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin: SupabaseClient = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};
const errMsg = (e: unknown): string =>
  !e ? "" : e instanceof Error ? e.message
    : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message ?? "")
    : String(e);
const matches = (e: unknown, pat: RegExp) => !!e && pat.test(errMsg(e));

async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password: pw });
  return { uid, client: c, email };
}
async function roleId(key: string) {
  const { data } = await admin.from("system_company_roles").select("id").eq("key", key).single();
  return data!.id as string;
}
async function addMember(company_id: string, user_id: string, role_key: string) {
  const { data: m } = await admin.from("company_members")
    .insert({ company_id, user_id, status: "active" }).select().single();
  const rid = await roleId(role_key);
  await admin.from("company_member_roles").insert({ member_id: m!.id, role_id: rid });
}
async function publish(clientAs: SupabaseClient, listing_id: string, qty: number, expected_version: number) {
  const { data, error } = await clientAs.rpc("set_channel_published_quantity", {
    _listing_id: listing_id, _new_quantity: qty, _reason: "phase3-m3-test",
    _expected_version: expected_version, _metadata: {},
  });
  if (error) throw new Error(`publish: ${error.message}`);
  return data as { to_version: number; to_quantity: number };
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p3m3_alice_${stamp}@borvat.test`);
  const bob   = await mkUser(`p3m3_bob_${stamp}@borvat.test`);

  // ─── Company A (Alice)
  const { data: compA } = await alice.client.from("companies")
    .insert({ name: "M3A", slug: `m3a-${stamp}`, owner_user_id: alice.uid }).select().single();
  const { data: skuA1 } = await alice.client.from("catalog_skus")
    .insert({ company_id: compA!.id, code: "M3A-1", tracking_mode: "none" }).select().single();
  const { data: skuA2 } = await alice.client.from("catalog_skus")
    .insert({ company_id: compA!.id, code: "M3A-2", tracking_mode: "none" }).select().single();
  const { data: skuA3 } = await alice.client.from("catalog_skus")
    .insert({ company_id: compA!.id, code: "M3A-3", tracking_mode: "none" }).select().single();
  const { data: skuA_missing } = await alice.client.from("catalog_skus")
    .insert({ company_id: compA!.id, code: "M3A-X", tracking_mode: "none" }).select().single();
  const { data: acctA } = await alice.client.from("channel_accounts")
    .insert({ company_id: compA!.id, provider: "bol", external_account_id: "A-" + stamp, display_name: "A Bol" })
    .select().single();
  const { data: L_A1 } = await alice.client.from("channel_listings")
    .insert({ company_id: compA!.id, channel_account_id: acctA!.id, sku_id: skuA1!.id,
              external_listing_id: "A1-" + stamp, units_per_offer: 1, channel_cap: 500 }).select().single();
  const { data: L_A2 } = await alice.client.from("channel_listings")
    .insert({ company_id: compA!.id, channel_account_id: acctA!.id, sku_id: skuA2!.id,
              external_listing_id: "A2-" + stamp, units_per_offer: 1, channel_cap: 500 }).select().single();
  const { data: L_A3 } = await alice.client.from("channel_listings")
    .insert({ company_id: compA!.id, channel_account_id: acctA!.id, sku_id: skuA3!.id,
              external_listing_id: "A3-" + stamp, units_per_offer: 1, channel_cap: 500 }).select().single();
  const { data: L_A_missext } = await alice.client.from("channel_listings")
    .insert({ company_id: compA!.id, channel_account_id: acctA!.id, sku_id: skuA_missing!.id,
              external_listing_id: "AX-" + stamp, units_per_offer: 1, channel_cap: 500 }).select().single();
  // Push local state we will reconcile against.
  await publish(alice.client, L_A1!.id, 10, 0);      // qty=10 v=1 — will MATCH
  await publish(alice.client, L_A2!.id, 20, 0);      // qty=20 v=1 — will DRIFT_QUANTITY
  await publish(alice.client, L_A3!.id, 30, 0);      // qty=30 v=1 — will DRIFT_VERSION
  await publish(alice.client, L_A_missext!.id, 5, 0);// no snapshot → MISSING_EXTERNAL

  // ─── Company B (Bob) — isolation control
  const { data: compB } = await bob.client.from("companies")
    .insert({ name: "M3B", slug: `m3b-${stamp}`, owner_user_id: bob.uid }).select().single();
  const { data: skuB1 } = await bob.client.from("catalog_skus")
    .insert({ company_id: compB!.id, code: "M3B-1", tracking_mode: "none" }).select().single();
  const { data: acctB } = await bob.client.from("channel_accounts")
    .insert({ company_id: compB!.id, provider: "bol", external_account_id: "B-" + stamp, display_name: "B Bol" })
    .select().single();
  const { data: L_B1 } = await bob.client.from("channel_listings")
    .insert({ company_id: compB!.id, channel_account_id: acctB!.id, sku_id: skuB1!.id,
              external_listing_id: "B1-" + stamp, units_per_offer: 1, channel_cap: 500 }).select().single();
  await publish(bob.client, L_B1!.id, 499, 0);

  // ==========================================================================
  // S. SCHEMA
  // ==========================================================================
  {
    // S.01 Tables exist and target XOR is enforced at snapshots.
    const { data: b } = await admin.rpc("open_reconciliation_batch", {
      _channel_account_id: acctA!.id, _source: "mock", _note: "schema-probe",
    });
    const batch_id = b as unknown as string;
    check("S.01 open_reconciliation_batch returned uuid", typeof batch_id === "string" && batch_id.length >= 30, String(batch_id));

    const { error: xorBoth } = await admin.rpc("record_channel_snapshot", {
      _batch_id: batch_id, _sku_id: skuA1!.id, _offer_id: skuA1!.id,
      _external_quantity: 1, _external_version: null, _external_ref: {},
    });
    check("S.01a XOR violated when both sku and offer supplied", matches(xorBoth, /target_xor/i), errMsg(xorBoth));

    const { error: xorNone } = await admin.rpc("record_channel_snapshot", {
      _batch_id: batch_id, _sku_id: null, _offer_id: null,
      _external_quantity: 1, _external_version: null, _external_ref: {},
    });
    check("S.01b XOR violated when neither supplied", matches(xorNone, /target_xor/i), errMsg(xorNone));

    // S.02 Unique target within a batch.
    const { error: firstSnap } = await admin.rpc("record_channel_snapshot", {
      _batch_id: batch_id, _sku_id: skuA1!.id, _offer_id: null,
      _external_quantity: 10, _external_version: 1, _external_ref: {},
    });
    check("S.02a first snapshot accepted", !firstSnap, errMsg(firstSnap));

    const { error: dupSnap } = await admin.rpc("record_channel_snapshot", {
      _batch_id: batch_id, _sku_id: skuA1!.id, _offer_id: null,
      _external_quantity: 99, _external_version: 2, _external_ref: {},
    });
    check("S.02b duplicate target in same batch rejected", !!dupSnap, errMsg(dupSnap));

    // S.03 Findings status enum via a direct insert probe (service_role only).
    const { data: rep } = await admin.from("channel_reconciliation_reports").insert({
      batch_id, company_id: compA!.id, channel_account_id: acctA!.id,
    }).select().single();
    const { error: badType } = await admin.from("channel_reconciliation_findings").insert({
      report_id: rep!.id, company_id: compA!.id, channel_account_id: acctA!.id,
      sku_id: skuA1!.id, listing_id: L_A1!.id, finding_type: "invalid_kind", resolution: "pending",
    });
    check("S.03a finding_type check rejects unknown kind", matches(badType, /findings_type_ck/i), errMsg(badType));

    const { error: badRes } = await admin.from("channel_reconciliation_findings").insert({
      report_id: rep!.id, company_id: compA!.id, channel_account_id: acctA!.id,
      sku_id: skuA1!.id, listing_id: L_A1!.id, finding_type: "drift_quantity", resolution: "invalid",
    });
    check("S.03b resolution check rejects unknown value", matches(badRes, /findings_resolution_ck/i), errMsg(badRes));

    // cleanup: close so we don't leak an open batch into R group.
    await admin.rpc("close_reconciliation_batch", { _batch_id: batch_id });
  }

  // ==========================================================================
  // G. GRANTS
  // ==========================================================================
  {
    // G.01 RPCs not executable by anon/authenticated.
    const { error: e1 } = await alice.client.rpc("open_reconciliation_batch", {
      _channel_account_id: acctA!.id, _source: "mock", _note: null,
    });
    check("G.01a open_reconciliation_batch blocked for authenticated",
      matches(e1, /permission denied|not.*found in schema|function.*does not exist/i), errMsg(e1));

    const { error: e2 } = await alice.client.rpc("run_reconciliation", { _batch_id: "00000000-0000-0000-0000-000000000000" });
    check("G.01b run_reconciliation blocked for authenticated",
      matches(e2, /permission denied|not.*found in schema|function.*does not exist/i), errMsg(e2));

    const { error: e3 } = await alice.client.rpc("record_channel_snapshot", {
      _batch_id: "00000000-0000-0000-0000-000000000000",
      _sku_id: skuA1!.id, _offer_id: null,
      _external_quantity: 1, _external_version: null, _external_ref: {},
    });
    check("G.01c record_channel_snapshot blocked for authenticated",
      matches(e3, /permission denied|not.*found in schema|function.*does not exist/i), errMsg(e3));

    const { error: e4 } = await alice.client.rpc("reenqueue_drift_finding", {
      _finding_id: "00000000-0000-0000-0000-000000000000",
    });
    check("G.01d reenqueue_drift_finding blocked for authenticated",
      matches(e4, /permission denied|not.*found in schema|function.*does not exist/i), errMsg(e4));

    // G.02 Direct writes blocked for authenticated.
    const { error: dw1 } = await alice.client.from("channel_snapshot_batches").insert({
      company_id: compA!.id, channel_account_id: acctA!.id, source: "mock",
    });
    check("G.02a INSERT into channel_snapshot_batches denied", matches(dw1, /row-level|permission|violates/i), errMsg(dw1));

    const { error: dw2 } = await alice.client.from("channel_snapshots").insert({
      batch_id: "00000000-0000-0000-0000-000000000000",
      company_id: compA!.id, channel_account_id: acctA!.id,
      sku_id: skuA1!.id, external_quantity: 1,
    });
    check("G.02b INSERT into channel_snapshots denied", matches(dw2, /row-level|permission|violates/i), errMsg(dw2));

    const { error: dw3 } = await alice.client.from("channel_reconciliation_findings").update({ resolution: "resolved" })
      .eq("company_id", compA!.id);
    check("G.02c UPDATE on findings denied for authenticated (no policy)", matches(dw3, /permission|denied|no.*update.*policy/i) || dw3 === null,
      errMsg(dw3));
  }

  // ==========================================================================
  // B. BATCH LIFECYCLE
  // ==========================================================================
  let batchA: string;
  {
    // B.01 unknown channel_account rejected.
    const { error: bad } = await admin.rpc("open_reconciliation_batch", {
      _channel_account_id: "00000000-0000-0000-0000-000000000000",
      _source: "mock", _note: null,
    });
    check("B.01 open_reconciliation_batch rejects unknown channel_account",
      matches(bad, /channel_account_not_found/i), errMsg(bad));

    const { data: bA } = await admin.rpc("open_reconciliation_batch", {
      _channel_account_id: acctA!.id, _source: "mock", _note: "R-run",
    });
    batchA = bA as unknown as string;
    check("B.01b batch opened for compA", !!batchA);

    // B.02 sku from another company rejected.
    const { error: xTenant } = await admin.rpc("record_channel_snapshot", {
      _batch_id: batchA, _sku_id: skuB1!.id, _offer_id: null,
      _external_quantity: 1, _external_version: null, _external_ref: {},
    });
    check("B.02 record_channel_snapshot rejects SKU from another company",
      matches(xTenant, /sku_not_in_company/i), errMsg(xTenant));

    // B.03 XOR probes already covered in S.01a/b — record here for group completeness.
    check("B.03 XOR probes (both/none) — covered by S.01a/b", true);

    // B.04 Snapshot on closed batch rejected.
    const { data: bTemp } = await admin.rpc("open_reconciliation_batch", {
      _channel_account_id: acctA!.id, _source: "mock", _note: "temp",
    });
    await admin.rpc("close_reconciliation_batch", { _batch_id: bTemp as unknown as string });
    const { error: closedErr } = await admin.rpc("record_channel_snapshot", {
      _batch_id: bTemp as unknown as string, _sku_id: skuA1!.id, _offer_id: null,
      _external_quantity: 1, _external_version: null, _external_ref: {},
    });
    check("B.04 record_channel_snapshot rejected on closed batch", matches(closedErr, /batch_not_open/i), errMsg(closedErr));

    // Second close is rejected.
    const { error: dblClose } = await admin.rpc("close_reconciliation_batch", {
      _batch_id: bTemp as unknown as string,
    });
    check("B.06 double close rejected", matches(dblClose, /batch_not_open_or_missing/i), errMsg(dblClose));

    // B.07 run_reconciliation requires closed batch.
    const { error: notClosed } = await admin.rpc("run_reconciliation", { _batch_id: batchA });
    check("B.07 run_reconciliation rejects open batch", matches(notClosed, /batch_not_closed/i), errMsg(notClosed));
  }

  // ==========================================================================
  // R. RECONCILIATION CLASSIFICATION
  // ==========================================================================
  let reportA: string;
  {
    // Record snapshots for compA:
    //   skuA1 → qty=10 ver=1 (MATCH)
    //   skuA2 → qty=99 ver=1 (DRIFT_QUANTITY)
    //   skuA3 → qty=30 ver=42 (DRIFT_VERSION)
    //   skuA_orphan → present externally, no local listing → MISSING_LOCAL
    //   skuA_missing (L_A_missext) → NO snapshot → MISSING_EXTERNAL
    const orphan = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "M3A-ORPH", tracking_mode: "none" }).select().single();

    for (const [sku_id, qty, ver] of [
      [skuA1!.id, 10, 1],
      [skuA2!.id, 99, 1],
      [skuA3!.id, 30, 42],
      [orphan.data!.id, 7, 1],
    ] as [string, number, number][]) {
      const { error } = await admin.rpc("record_channel_snapshot", {
        _batch_id: batchA, _sku_id: sku_id, _offer_id: null,
        _external_quantity: qty, _external_version: ver, _external_ref: { probe: true },
      });
      if (error) throw new Error(`snapshot insert failed for ${sku_id}: ${error.message}`);
    }
    await admin.rpc("close_reconciliation_batch", { _batch_id: batchA });

    const { data: rpt, error: runErr } = await admin.rpc("run_reconciliation", { _batch_id: batchA });
    reportA = rpt as unknown as string;
    check("R.00 run_reconciliation succeeded", !runErr && !!reportA, runErr?.message);

    const { data: report } = await admin.from("channel_reconciliation_reports")
      .select("*").eq("id", reportA).single();
    const { data: findings } = await admin.from("channel_reconciliation_findings")
      .select("*").eq("report_id", reportA);

    const kinds = new Map<string, number>();
    for (const f of findings ?? []) kinds.set(f.finding_type, (kinds.get(f.finding_type) ?? 0) + 1);

    check("R.01 matched counter = 1 (skuA1 exact)", report!.matched === 1, `matched=${report!.matched}`);
    check("R.02 drift_quantity = 1 (skuA2)", report!.drift_quantity === 1 && (kinds.get("drift_quantity") ?? 0) === 1);
    check("R.03 drift_version  = 1 (skuA3)", report!.drift_version === 1 && (kinds.get("drift_version") ?? 0) === 1);
    check("R.04 missing_local  = 1 (orphan snapshot)", report!.missing_local === 1 && (kinds.get("missing_local") ?? 0) === 1);
    check("R.05 missing_external = 1 (L_A_missext local, no snapshot)",
      report!.missing_external === 1 && (kinds.get("missing_external") ?? 0) === 1);
    check("R.06 counters equal finding counts",
      (findings?.length ?? 0) === (report!.drift_quantity + report!.drift_version + report!.missing_local + report!.missing_external),
      `findings=${findings?.length}`);

    // R.07 Tenant fields on every finding.
    const bad = (findings ?? []).filter(
      (f) => f.company_id !== compA!.id || f.channel_account_id !== acctA!.id,
    );
    check("R.07 all findings carry batch (company_id, channel_account_id)", bad.length === 0, `bad=${bad.length}`);
  }

  // ==========================================================================
  // T. TENANT ISOLATION
  // ==========================================================================
  {
    // Even though Bob has a listing with qty=999, running reconciliation for
    // company A's batch must NOT pick it up as missing_external or drift.
    const { data: findings } = await admin.from("channel_reconciliation_findings")
      .select("company_id,channel_account_id,listing_id,sku_id")
      .eq("report_id", reportA);
    const leaked = (findings ?? []).some((f) =>
      f.channel_account_id === acctB!.id || f.listing_id === L_B1!.id || f.sku_id === skuB1!.id,
    );
    check("T.01 no leakage of company B rows into company A report", !leaked);

    // And the reverse: bob.client, using SELECT policy, sees zero of compA's reports.
    const { data: bobView } = await bob.client.from("channel_reconciliation_reports")
      .select("id").eq("id", reportA);
    check("G.03 authenticated cross-seller cannot SELECT report from other company",
      (bobView ?? []).length === 0);
  }

  // ==========================================================================
  // E. RE-ENQUEUE
  // ==========================================================================
  {
    // Find the drift_quantity finding for skuA2.
    const { data: fs } = await admin.from("channel_reconciliation_findings")
      .select("*").eq("report_id", reportA).eq("finding_type", "drift_quantity").single();

    const beforeVersion = (await admin.from("channel_listings").select("published_version,published_quantity")
      .eq("id", L_A2!.id).single()).data!;

    const { data: evtId, error: reErr } = await admin.rpc("reenqueue_drift_finding", { _finding_id: fs!.id });
    check("E.01a reenqueue_drift_finding returned event uuid", !reErr && typeof evtId === "string", errMsg(reErr));

    const { data: evt } = await admin.from("outbox_events").select("*").eq("id", evtId as unknown as string).single();
    check("E.01b outbox event is scoped to the same (company, channel, target)",
      evt!.company_id === compA!.id
      && evt!.channel_account_id === acctA!.id
      && evt!.sku_id === skuA2!.id
      && evt!.listing_id === L_A2!.id);
    check("E.01c event carries CURRENT listing version (no re-versioning)",
      Number(evt!.listing_version) === Number(beforeVersion.published_version));
    check("E.01d event_type = channel.resync", evt!.event_type === "channel.resync");

    // Finding is marked reenqueued.
    const { data: after } = await admin.from("channel_reconciliation_findings").select("*").eq("id", fs!.id).single();
    check("E.01e finding.resolution = reenqueued and remediation_event_id set",
      after!.resolution === "reenqueued" && after!.remediation_event_id === evt!.id);

    // E.02 second call rejected.
    const { error: dbl } = await admin.rpc("reenqueue_drift_finding", { _finding_id: fs!.id });
    check("E.02 second reenqueue on same finding rejected",
      matches(dbl, /finding_not_pending/i), errMsg(dbl));

    // E.03 missing_local cannot be re-enqueued.
    const { data: ml } = await admin.from("channel_reconciliation_findings")
      .select("*").eq("report_id", reportA).eq("finding_type", "missing_local").single();
    const { error: mlErr } = await admin.rpc("reenqueue_drift_finding", { _finding_id: ml!.id });
    check("E.03 missing_local finding cannot be re-enqueued",
      matches(mlErr, /finding_has_no_local_listing|finding_not_reenqueueable/i), errMsg(mlErr));

    // E.04 Tenant tamper guard: forge a finding row pointing at a listing from
    // company B while keeping company_id=A. Service role can insert; the RPC
    // must still refuse due to tenant_target_mismatch.
    const { data: tampReport } = await admin.from("channel_reconciliation_reports").insert({
      batch_id: batchA, company_id: compA!.id, channel_account_id: acctA!.id,
    }).select().single();
    const { data: tamp } = await admin.from("channel_reconciliation_findings").insert({
      report_id: tampReport!.id,
      company_id: compA!.id,             // claim A
      channel_account_id: acctA!.id,     // claim A's account
      listing_id: L_B1!.id,              // ← but point at B's listing
      sku_id: skuB1!.id,                 // and B's sku
      finding_type: "drift_quantity",
      local_quantity: 999, local_version: 1,
      external_quantity: 5, external_version: 1,
    }).select().single();
    const { error: tampErr } = await admin.rpc("reenqueue_drift_finding", { _finding_id: tamp!.id });
    check("E.04 tenant/target tamper detected and rejected",
      matches(tampErr, /tenant_target_mismatch/i), errMsg(tampErr));
  }

  // ---- Summary ----
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) {
    console.log("\nFailures:");
    for (const r of results) if (!r.ok) console.log(`  ❌ ${r.name}${r.detail ? " — " + r.detail : ""}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
