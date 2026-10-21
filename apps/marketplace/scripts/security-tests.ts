/**
 * Security & Verification Sprint — automated RLS/role tests.
 *
 * Runs against the live Cloud DB using SERVICE_ROLE to bootstrap test users,
 * then re-authenticates as each user with the publishable key so RLS runs
 * as that user (identical to production request path).
 *
 * Usage (local, secrets already set in the sandbox env):
 *   bunx tsx scripts/security-tests.ts
 *
 * The script does not run automatically — it is opt-in because it creates
 * and deletes real auth.users rows.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function mkUser(email: string, role: "buyer" | "seller" | "admin") {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  // handle_new_user trigger inserts default 'buyer' role — patch to desired role via service role
  await admin.from("user_roles").delete().eq("user_id", uid);
  await admin.from("user_roles").insert({ user_id: uid, role });
  const c = anon();
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: pw });
  if (sErr) throw sErr;
  return { uid, client: c };
}

async function main() {
  const stamp = Date.now();
  const buyer = await mkUser(`buyer_${stamp}@borvat.test`, "buyer");
  const sellerA = await mkUser(`sellerA_${stamp}@borvat.test`, "seller");
  const sellerB = await mkUser(`sellerB_${stamp}@borvat.test`, "seller");
  const adminUser = await mkUser(`admin_${stamp}@borvat.test`, "admin");

  try {
    // ── Seed: sellerA creates one published + one draft product
    const { data: pubA } = await admin.from("products").insert({
      seller_id: sellerA.uid, title: `pub-A-${stamp}`, price_cents: 1000, stock: 5,
      is_active: true, is_draft: false,
    }).select().single();
    const { data: draftA } = await admin.from("products").insert({
      seller_id: sellerA.uid, title: `draft-A-${stamp}`, price_cents: 999, stock: 1,
      is_active: false, is_draft: true,
    }).select().single();
    const { data: pubB } = await admin.from("products").insert({
      seller_id: sellerB.uid, title: `pub-B-${stamp}`, price_cents: 2000, stock: 5,
      is_active: true, is_draft: false,
    }).select().single();

    // T1: anon sees published, not drafts
    const { data: anonProducts } = await anon().from("products").select("id").in("id", [pubA!.id, draftA!.id, pubB!.id]);
    check(
      "anon sees only published (drafts hidden)",
      anonProducts?.length === 2 && !anonProducts.some((p) => p.id === draftA!.id),
      `saw ${anonProducts?.length} rows`,
    );

    // T2: buyer sees published, not drafts
    const { data: buyerProducts } = await buyer.client.from("products").select("id").in("id", [pubA!.id, draftA!.id]);
    check(
      "buyer sees published, not drafts",
      buyerProducts?.length === 1 && buyerProducts[0].id === pubA!.id,
    );

    // T3: seller A sees own drafts
    const { data: sellerADrafts } = await sellerA.client.from("products").select("id").eq("id", draftA!.id);
    check("seller A sees own draft", sellerADrafts?.length === 1);

    // T4: seller B cannot see seller A's draft
    const { data: sellerBView } = await sellerB.client.from("products").select("id").eq("id", draftA!.id);
    check("seller B blocked from seller A draft", (sellerBView?.length ?? 0) === 0);

    // T5: seller A cannot rebind product to seller B
    const { error: rebindErr } = await sellerA.client
      .from("products").update({ seller_id: sellerB.uid }).eq("id", pubA!.id);
    check("seller A cannot rebind seller_id (WITH CHECK)", rebindErr !== null, rebindErr?.message);

    // T6: seller cannot self-grant admin role
    const { error: adminErr } = await sellerA.client.from("user_roles").insert({ user_id: sellerA.uid, role: "admin" });
    check("seller cannot self-grant admin", adminErr !== null, adminErr?.message);

    // T7: user cannot alter another user's role
    const { error: otherRoleErr } = await sellerA.client.from("user_roles").insert({ user_id: sellerB.uid, role: "admin" });
    check("seller cannot grant admin to others", otherRoleErr !== null, otherRoleErr?.message);

    // T8: buyer cannot read other users' orders
    const { data: order } = await admin.from("orders").insert({
      user_id: buyer.uid, total_cents: 100, status: "pending",
    }).select().single();
    const { data: sellerAOrderView } = await sellerA.client.from("orders").select("id").eq("id", order!.id);
    check("seller cannot read buyer orders (except through items)", (sellerAOrderView?.length ?? 0) === 0);

    // T9: suggestions — sellerB cannot see sellerA's suggestions
    const { data: sug } = await admin.from("product_suggestions").insert({
      seller_id: sellerA.uid, product_id: pubA!.id, suggestion_type: "title",
      current_value: { value: pubA!.title }, suggested_value: { value: "Better title" },
    }).select().single();
    const { data: bSug } = await sellerB.client.from("product_suggestions").select("id").eq("id", sug!.id);
    check("seller B cannot see seller A suggestions", (bSug?.length ?? 0) === 0);

    // T10: direct UPDATE on product_suggestions is revoked — must go via RPC
    const { error: directUpd } = await sellerA.client
      .from("product_suggestions").update({ status: "accepted" }).eq("id", sug!.id);
    check("direct suggestion status update is blocked", directUpd !== null, directUpd?.message);

    // T11: RPC path works for owner
    const { error: rpcErr, data: rpcOk } = await sellerA.client.rpc("decide_product_suggestion", {
      _suggestion_id: sug!.id, _accept: true, _feedback: "ok",
    });
    check("decide_product_suggestion RPC accepts for owner", rpcErr === null, rpcErr?.message ?? JSON.stringify(rpcOk));

    // T12: double-apply is blocked
    const { error: doubleErr } = await sellerA.client.rpc("decide_product_suggestion", {
      _suggestion_id: sug!.id, _accept: true,
    });
    check("double-apply of suggestion is blocked", doubleErr !== null, doubleErr?.message);

    // T13: RPC rejects other sellers
    const { data: sug2 } = await admin.from("product_suggestions").insert({
      seller_id: sellerA.uid, product_id: pubA!.id, suggestion_type: "title",
      current_value: { value: pubA!.title }, suggested_value: { value: "X" },
    }).select().single();
    const { error: otherRpc } = await sellerB.client.rpc("decide_product_suggestion", {
      _suggestion_id: sug2!.id, _accept: true,
    });
    check("RPC rejects non-owner", otherRpc !== null, otherRpc?.message);

    // T14: audit log append-only — direct UPDATE/DELETE blocked
    const { error: auditUpd } = await sellerA.client
      .from("agent_audit_log").update({ status: "hacked" }).eq("user_id", sellerA.uid);
    check("audit log UPDATE blocked", auditUpd !== null, auditUpd?.message);
    const { error: auditDel } = await sellerA.client
      .from("agent_audit_log").delete().eq("user_id", sellerA.uid);
    check("audit log DELETE blocked", auditDel !== null, auditDel?.message);

    // T15: agent_memory scope isolation via CHECK
    const { error: badScope } = await sellerA.client.from("agent_memory").insert({
      owner_id: sellerA.uid, owner_role: "seller", scope: "hacked_scope",
      key: "k", value: {}, source: "test",
    });
    check("agent_memory rejects unknown scope", badScope !== null, badScope?.message);

    // T16: seller cannot read seller_bol_credentials of another seller
    await admin.from("seller_bol_credentials").insert({
      user_id: sellerA.uid,
      client_id_ciphertext: "x", client_secret_ciphertext: "y",
    });
    const { data: peekBol } = await sellerB.client.from("seller_bol_credentials").select("user_id").eq("user_id", sellerA.uid);
    check("seller B cannot read seller A bol credentials", (peekBol?.length ?? 0) === 0);

    // Cleanup
    await admin.from("products").delete().in("id", [pubA!.id, draftA!.id, pubB!.id]);
    await admin.from("orders").delete().eq("id", order!.id);
  } finally {
    for (const u of [buyer, sellerA, sellerB, adminUser]) {
      await admin.auth.admin.deleteUser(u.uid).catch(() => {});
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
