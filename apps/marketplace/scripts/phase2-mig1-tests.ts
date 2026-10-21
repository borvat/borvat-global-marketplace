/**
 * Phase 2 Migration 1 verification — catalog, warehouses, permissions.
 *
 * Covers §19 subsets:
 *  A. Tenancy/RLS: cross-company denial for products, SKUs, offers, components,
 *     warehouses, warehouse_locations; forged company_id rejected via immutability.
 *  B. Product/SKU/Composition: SKU code unique per company; same code allowed in
 *     different companies; simple/pack/bundle shape constraints; components only
 *     on bundles; component company mismatch rejected; offer_type immutable.
 *  C. Warehouses/Locations: unique code per company; location cannot be moved
 *     between warehouses (immutable warehouse_id); location code unique per WH.
 *  D. Permissions: viewer cannot INSERT product; catalog.manage role can.
 *
 * Usage:  bunx tsx scripts/phase2-mig1-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type R = { name: string; ok: boolean; detail?: string };
const results: R[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function mkUser(email: string) {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: pw });
  if (sErr) throw sErr;
  return { uid, client: c, email };
}

async function roleId(key: string) {
  const { data } = await admin.from("system_company_roles").select("id").eq("key", key).single();
  return data!.id as string;
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`p2m1_alice_${stamp}@borvat.test`);   // owner of A
  const bob   = await mkUser(`p2m1_bob_${stamp}@borvat.test`);     // viewer of A
  const erin  = await mkUser(`p2m1_erin_${stamp}@borvat.test`);    // owner of B
  const cleanupUsers = [alice, bob, erin];
  const cleanupCompanies: string[] = [];

  try {
    // Companies
    const { data: compA } = await alice.client.from("companies")
      .insert({ name: "Alpha", slug: `alpha-${stamp}`, owner_user_id: alice.uid }).select().single();
    cleanupCompanies.push(compA!.id);
    const { data: compB } = await erin.client.from("companies")
      .insert({ name: "Beta", slug: `beta-${stamp}`, owner_user_id: erin.uid }).select().single();
    cleanupCompanies.push(compB!.id);

    // Add Bob to A as viewer
    const viewerRole = await roleId("viewer");
    const { data: bobMember } = await admin.from("company_members")
      .insert({ company_id: compA!.id, user_id: bob.uid, status: "active" }).select().single();
    await admin.from("company_member_roles").insert({ member_id: bobMember!.id, role_id: viewerRole });

    // ── T01 Alice (owner=catalog.manage) creates product in A
    const { data: prodA, error: eProdA } = await alice.client.from("catalog_products")
      .insert({ company_id: compA!.id, title: "Widget A", status: "active" }).select().single();
    check("T01 owner can create catalog product in own company", !!prodA && !eProdA, eProdA?.message);

    // ── T02 Bob (viewer) cannot INSERT product
    const { error: eBobIns } = await bob.client.from("catalog_products")
      .insert({ company_id: compA!.id, title: "Sneaky", status: "active" }).select().single();
    check("T02 viewer without catalog.manage cannot create product", !!eBobIns, eBobIns?.message ?? "should have errored");

    // ── T03 Bob CAN read products in A
    const { data: bobRead } = await bob.client.from("catalog_products").select("id").eq("id", prodA!.id);
    check("T03 viewer can read catalog products in own company", (bobRead?.length ?? 0) === 1);

    // ── T04 Erin (other company) cannot read A's product
    const { data: erinRead } = await erin.client.from("catalog_products").select("id").eq("id", prodA!.id);
    check("T04 cross-company product read denied", (erinRead?.length ?? 0) === 0);

    // ── T05 Erin cannot forge company_id when inserting
    const { error: eForge } = await erin.client.from("catalog_products")
      .insert({ company_id: compA!.id, title: "Forged", status: "active" });
    check("T05 forged company_id INSERT denied by RLS/WITH CHECK", !!eForge);

    // ── T06/07 SKU uniqueness per company; same code allowed across companies
    const { data: skuA1 } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, product_id: prodA!.id, code: "SKU-001", tracking_mode: "none" })
      .select().single();
    check("T06 SKU created", !!skuA1);
    const { error: eDup } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "sku-001" }); // case-insensitive
    check("T07 duplicate SKU code per company rejected", !!eDup);
    const { data: skuB } = await erin.client.from("catalog_skus")
      .insert({ company_id: compB!.id, code: "SKU-001" }).select().single();
    check("T08 same SKU code allowed in different company", !!skuB);

    // ── T09 SKU with product_id from another company rejected (trigger)
    const { data: prodB } = await erin.client.from("catalog_products")
      .insert({ company_id: compB!.id, title: "B-widget" }).select().single();
    const { error: eCross } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, product_id: prodB!.id, code: "SKU-CROSS" });
    check("T09 SKU cannot reference product from another company", !!eCross);

    // ── T10 immutable company_id
    const { error: eImm } = await alice.client.from("catalog_products")
      .update({ company_id: compB!.id }).eq("id", prodA!.id);
    check("T10 catalog_products.company_id is immutable", !!eImm);

    // ── T11-13 offer shape constraints
    const { error: eSimpleQty2 } = await alice.client.from("catalog_offers")
      .insert({ company_id: compA!.id, offer_type: "simple", base_sku_id: skuA1!.id, quantity_per_offer: 2 });
    check("T11 simple offer with qty!=1 rejected", !!eSimpleQty2);

    const { error: eSimpleNoSku } = await alice.client.from("catalog_offers")
      .insert({ company_id: compA!.id, offer_type: "simple", quantity_per_offer: 1 });
    check("T12 simple offer without base_sku rejected", !!eSimpleNoSku);

    const { error: eBundleWithSku } = await alice.client.from("catalog_offers")
      .insert({ company_id: compA!.id, offer_type: "bundle", base_sku_id: skuA1!.id, quantity_per_offer: 1 });
    check("T13 bundle offer with base_sku rejected", !!eBundleWithSku);

    // ── T14 pack offer requires base_sku but allows qty>1
    const { data: pack } = await alice.client.from("catalog_offers")
      .insert({ company_id: compA!.id, offer_type: "pack", base_sku_id: skuA1!.id, quantity_per_offer: 6 })
      .select().single();
    check("T14 pack offer created", !!pack);

    // ── T15 bundle offer
    const { data: skuA2 } = await alice.client.from("catalog_skus")
      .insert({ company_id: compA!.id, code: "SKU-002" }).select().single();
    const { data: bundle } = await alice.client.from("catalog_offers")
      .insert({ company_id: compA!.id, offer_type: "bundle" }).select().single();
    check("T15 bundle offer created", !!bundle);

    // ── T16 components only allowed on bundle
    const { error: ePackComp } = await alice.client.from("catalog_offer_components")
      .insert({ offer_id: pack!.id, sku_id: skuA1!.id, quantity_per_offer: 1 });
    check("T16 pack offer rejects components", !!ePackComp);

    // ── T17 bundle component happy path
    const { error: eComp1 } = await alice.client.from("catalog_offer_components")
      .insert({ offer_id: bundle!.id, sku_id: skuA1!.id, quantity_per_offer: 2 });
    check("T17 bundle accepts component", !eComp1, eComp1?.message);

    // ── T18 duplicate component (same sku) rejected
    const { error: eDupComp } = await alice.client.from("catalog_offer_components")
      .insert({ offer_id: bundle!.id, sku_id: skuA1!.id, quantity_per_offer: 3 });
    check("T18 duplicate component sku rejected", !!eDupComp);

    // ── T19 component sku from another company rejected
    const { error: eCompCross } = await alice.client.from("catalog_offer_components")
      .insert({ offer_id: bundle!.id, sku_id: skuB!.id, quantity_per_offer: 1 });
    check("T19 component sku from other company rejected", !!eCompCross);

    // ── T20 zero/negative component qty rejected
    const { error: eZeroQty } = await alice.client.from("catalog_offer_components")
      .insert({ offer_id: bundle!.id, sku_id: skuA2!.id, quantity_per_offer: 0 });
    check("T20 component qty=0 rejected", !!eZeroQty);

    // ── T21 offer_type immutable
    const { error: eOfferType } = await alice.client.from("catalog_offers")
      .update({ offer_type: "simple" }).eq("id", bundle!.id);
    check("T21 offer_type immutable", !!eOfferType);

    // ── T22-25 Warehouses
    const { data: whA } = await alice.client.from("warehouses")
      .insert({ company_id: compA!.id, code: "WH-MAIN", name: "Main", requires_location: true }).select().single();
    check("T22 warehouse created", !!whA);
    const { error: eWHDup } = await alice.client.from("warehouses")
      .insert({ company_id: compA!.id, code: "wh-main", name: "Dup" });
    check("T23 warehouse code unique per company (case-insensitive)", !!eWHDup);

    const { data: erinReadWH } = await erin.client.from("warehouses").select("id").eq("id", whA!.id);
    check("T24 cross-company warehouse read denied", (erinReadWH?.length ?? 0) === 0);

    // ── T26-28 Locations
    const { data: locA1 } = await alice.client.from("warehouse_locations")
      .insert({ warehouse_id: whA!.id, code: "A-01" }).select().single();
    check("T26 location created", !!locA1);

    const { data: whA2 } = await alice.client.from("warehouses")
      .insert({ company_id: compA!.id, code: "WH-2", name: "Second" }).select().single();
    const { error: eLocMove } = await alice.client.from("warehouse_locations")
      .update({ warehouse_id: whA2!.id }).eq("id", locA1!.id);
    check("T27 location warehouse_id is immutable", !!eLocMove);

    const { error: eLocDup } = await alice.client.from("warehouse_locations")
      .insert({ warehouse_id: whA!.id, code: "a-01" });
    check("T28 location code unique per warehouse (case-insensitive)", !!eLocDup);

    // ── T29 canonical dispositions present, no reserved_hold
    const { data: disps } = await admin.from("inventory_dispositions").select("key");
    const keys = new Set((disps ?? []).map((d) => d.key));
    const required = ["sellable","picked","packed_or_staging","in_transfer",
                      "returned_pending_inspection","quarantine","damaged"];
    check("T29 canonical dispositions seeded", required.every((k) => keys.has(k)));
    check("T30 no reserved_hold disposition", !keys.has("reserved_hold"));

    // ── T31 phase 2 permission keys seeded
    const { data: perms } = await admin.from("permissions").select("key");
    const permKeys = new Set((perms ?? []).map((p) => p.key));
    const newPerms = ["warehouses.read","inventory.transfer","inventory.reverse","inventory.disposal",
      "reservations.read","reservations.manage","reservations.override","fulfilment.pick",
      "fulfilment.pack","fulfilment.ship","fulfilment.return","channels.read","channels.activate",
      "exceptions.read","exceptions.resolve"];
    check("T31 Phase 2 permissions seeded", newPerms.every((k) => permKeys.has(k)));

    // ── T32 phase 1 permissions preserved
    const p1 = ["catalog.manage","catalog.read","warehouses.manage","inventory.read","ownership.transfer"];
    check("T32 Phase 1 permissions preserved", p1.every((k) => permKeys.has(k)));

    // ── T33 viewer role has phase-2 read perms (reservations.read, channels.read)
    const viewer = await admin.from("role_permissions").select("permission_id, permissions(key)")
      .eq("role_id", viewerRole);
    const viewerKeys = new Set((viewer.data ?? []).map((r: any) => r.permissions.key));
    check("T33 viewer inherits phase-2 read perms",
      viewerKeys.has("reservations.read") && viewerKeys.has("channels.read"));

    // ── T34 operator has fulfilment perms, NOT inventory.disposal
    const operatorRoleId = await roleId("operator");
    const op = await admin.from("role_permissions").select("permission_id, permissions(key)")
      .eq("role_id", operatorRoleId);
    const opKeys = new Set((op.data ?? []).map((r: any) => r.permissions.key));
    check("T34 operator has fulfilment.pick/pack/ship",
      opKeys.has("fulfilment.pick") && opKeys.has("fulfilment.pack") && opKeys.has("fulfilment.ship"));
    check("T35 operator does NOT have inventory.disposal", !opKeys.has("inventory.disposal"));
    check("T36 operator does NOT have reservations.override", !opKeys.has("reservations.override"));

    // ── T37 only owner has reservations.override
    const ownerRoleId = await roleId("owner");
    const own = await admin.from("role_permissions").select("permission_id, permissions(key)")
      .eq("role_id", ownerRoleId);
    const ownKeys = new Set((own.data ?? []).map((r: any) => r.permissions.key));
    check("T37 owner has reservations.override", ownKeys.has("reservations.override"));

    const adminRoleId = await roleId("admin");
    const ad = await admin.from("role_permissions").select("permission_id, permissions(key)")
      .eq("role_id", adminRoleId);
    const adKeys = new Set((ad.data ?? []).map((r: any) => r.permissions.key));
    check("T38 admin does NOT have reservations.override", !adKeys.has("reservations.override"));

  } finally {
    // Cleanup
    for (const c of cleanupCompanies) {
      await admin.from("warehouse_locations").delete().in("warehouse_id",
        (await admin.from("warehouses").select("id").eq("company_id", c)).data?.map((w: any) => w.id) ?? []);
      await admin.from("warehouses").delete().eq("company_id", c);
      await admin.from("catalog_offer_components").delete().in("offer_id",
        (await admin.from("catalog_offers").select("id").eq("company_id", c)).data?.map((o: any) => o.id) ?? []);
      await admin.from("catalog_offers").delete().eq("company_id", c);
      await admin.from("catalog_skus").delete().eq("company_id", c);
      await admin.from("catalog_products").delete().eq("company_id", c);
      await admin.from("company_member_roles").delete().in("member_id",
        (await admin.from("company_members").select("id").eq("company_id", c)).data?.map((m: any) => m.id) ?? []);
      await admin.from("company_members").delete().eq("company_id", c);
      await admin.from("companies").delete().eq("id", c);
    }
    for (const u of cleanupUsers) await admin.auth.admin.deleteUser(u.uid);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n─────── ${passed}/${results.length} passed ───────`);
  if (failed > 0) {
    console.log("FAILED:");
    for (const r of results.filter((r) => !r.ok)) console.log(`  • ${r.name}: ${r.detail ?? ""}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
