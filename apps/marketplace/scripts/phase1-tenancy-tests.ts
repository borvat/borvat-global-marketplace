/**
 * Phase 1 — Company Tenancy verification tests.
 *
 * Covers:
 *   • RLS visibility (members-only reads across companies)
 *   • Ownership invariants (owner is member; owner cannot be removed/demoted;
 *     owner role cannot be revoked while owner)
 *   • transfer_company_ownership (happy path, non-owner rejected, non-member rejected)
 *   • Permission-gated member management (members.manage vs viewer)
 *   • Direct owner_user_id UPDATE is blocked (must go through the RPC)
 *   • Concurrency: two simultaneous transfers → exactly one wins
 *
 * Usage: bunx tsx scripts/phase1-tenancy-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) throw new Error("Set SUPABASE_URL / _PUBLISHABLE_KEY / _SERVICE_ROLE_KEY");

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } });
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const psql = (sql: string) => execSync(`psql -X -A -t -c ${JSON.stringify(sql)}`, { encoding: "utf8" }).trim();
const psqlScript = (sql: string) => execSync(`psql -X -v ON_ERROR_STOP=1`, { encoding: "utf8", input: sql });

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function mkUser(email: string): Promise<{ uid: string; client: SupabaseClient }> {
  const pw = "Test1234!" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const uid = data.user!.id;
  const c = anonClient();
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: pw });
  if (sErr) throw sErr;
  return { uid, client: c };
}

async function roleId(key: string): Promise<string> {
  const { data } = await admin.from("system_company_roles").select("id").eq("key", key).single();
  return data!.id as string;
}

async function main() {
  const stamp = Date.now();
  const alice = await mkUser(`alice_${stamp}@borvat.test`);      // owner of company A
  const bob = await mkUser(`bob_${stamp}@borvat.test`);          // member of A (manager)
  const carol = await mkUser(`carol_${stamp}@borvat.test`);      // member of A (viewer)
  const dave = await mkUser(`dave_${stamp}@borvat.test`);        // outsider
  const erin = await mkUser(`erin_${stamp}@borvat.test`);        // owner of company B

  const cleanupUsers = [alice, bob, carol, dave, erin];
  const cleanupCompanies: string[] = [];

  try {
    // ── Company A owned by Alice
    const { data: compA, error: e1 } = await alice.client
      .from("companies").insert({ name: "Alpha", slug: `alpha-${stamp}`, owner_user_id: alice.uid })
      .select().single();
    check("T01 owner can create their own company", !!compA && !e1, e1?.message);
    if (!compA) throw new Error("company A create failed");
    cleanupCompanies.push(compA.id);

    // ── Bootstrap trigger: alice is now an active member with owner role
    const { data: aliceMember } = await admin.from("company_members")
      .select("id,status").eq("company_id", compA.id).eq("user_id", alice.uid).single();
    check("T02 owner auto-added as active member",
      !!aliceMember && aliceMember.status === "active");
    const { data: aliceRoles } = await admin.from("company_member_roles")
      .select("role_id").eq("member_id", aliceMember!.id);
    const ownerRoleId = await roleId("owner");
    check("T03 owner auto-granted 'owner' role",
      !!aliceRoles?.some((r) => r.role_id === ownerRoleId));

    // ── Cannot spoof someone else's ownership
    const { error: spoofErr } = await dave.client
      .from("companies").insert({ name: "Spoof", slug: `spoof-${stamp}`, owner_user_id: alice.uid });
    check("T04 cannot create a company owned by another user (RLS)", !!spoofErr);

    // ── Company B owned by Erin (for cross-tenant isolation checks)
    const { data: compB } = await erin.client
      .from("companies").insert({ name: "Bravo", slug: `bravo-${stamp}`, owner_user_id: erin.uid })
      .select().single();
    if (!compB) throw new Error("company B create failed");
    cleanupCompanies.push(compB.id);

    // ── Cross-tenant SELECT is blocked
    const { data: aliceSeesB } = await alice.client.from("companies").select("id").eq("id", compB.id);
    check("T05 outsider cannot see another company", (aliceSeesB?.length ?? 0) === 0);

    // ── Add Bob and Carol as members of A via admin (as if invited by owner)
    const { data: bobMem } = await admin.from("company_members")
      .insert({ company_id: compA.id, user_id: bob.uid, status: "active" }).select().single();
    const { data: carolMem } = await admin.from("company_members")
      .insert({ company_id: compA.id, user_id: carol.uid, status: "active" }).select().single();

    const managerRole = await roleId("manager");
    const viewerRole = await roleId("viewer");
    await admin.from("company_member_roles").insert([
      { member_id: bobMem!.id, role_id: managerRole },
      { member_id: carolMem!.id, role_id: viewerRole },
    ]);

    // ── T06 members can see their company
    const { data: bobSees } = await bob.client.from("companies").select("id").eq("id", compA.id);
    check("T06 member can read their company", bobSees?.length === 1);

    // ── T07 non-member cannot see members list of A
    const { data: daveMembers } = await dave.client.from("company_members").select("id").eq("company_id", compA.id);
    check("T07 outsider cannot list members of another company", (daveMembers?.length ?? 0) === 0);

    // ── T08 member.manage: manager (bob) does NOT have members.manage → cannot invite
    const { error: bobInviteErr } = await bob.client.from("company_members")
      .insert({ company_id: compA.id, user_id: dave.uid, status: "invited" });
    check("T08 manager (no members.manage) cannot invite members", !!bobInviteErr);

    // ── T09 viewer (carol) cannot invite either
    const { error: carolInviteErr } = await carol.client.from("company_members")
      .insert({ company_id: compA.id, user_id: dave.uid, status: "invited" });
    check("T09 viewer cannot invite members", !!carolInviteErr);

    // ── T10 owner (alice) CAN invite members
    const { error: aliceInviteErr, data: daveMem } = await alice.client.from("company_members")
      .insert({ company_id: compA.id, user_id: dave.uid, status: "invited" }).select().single();
    check("T10 owner can invite members", !aliceInviteErr && !!daveMem, aliceInviteErr?.message);

    // ── T11 owner membership cannot be deleted
    const { error: delOwnerErr } = await admin.from("company_members")
      .delete().eq("id", aliceMember!.id);
    check("T11 cannot delete owner membership", !!delOwnerErr,
      delOwnerErr ? "blocked" : "SHOULD HAVE FAILED");

    // ── T12 owner membership cannot be demoted to suspended/removed
    const { error: suspendErr } = await admin.from("company_members")
      .update({ status: "suspended" }).eq("id", aliceMember!.id);
    check("T12 cannot demote owner membership status", !!suspendErr);

    // ── T13 owner role cannot be revoked from owner
    const { error: revokeErr } = await admin.from("company_member_roles")
      .delete().eq("member_id", aliceMember!.id).eq("role_id", ownerRoleId);
    check("T13 cannot revoke 'owner' role from current owner", !!revokeErr);

    // ── T14 direct owner_user_id UPDATE is blocked (must use RPC)
    const { error: directOwnerErr } = await alice.client.from("companies")
      .update({ owner_user_id: bob.uid }).eq("id", compA.id);
    check("T14 direct owner_user_id UPDATE is blocked", !!directOwnerErr);

    // ── T15 transfer to non-member is rejected
    const { data: badTransfer, error: badErr } = await alice.client.rpc("transfer_company_ownership", {
      _company_id: compA.id, _new_owner_user_id: erin.uid,
    });
    check("T15 transfer to non-member is rejected", !!badErr || (badTransfer as any)?.ok === false,
      badErr?.message ?? JSON.stringify(badTransfer));

    // ── T16 non-owner cannot transfer
    const { error: nonOwnerErr } = await bob.client.rpc("transfer_company_ownership", {
      _company_id: compA.id, _new_owner_user_id: bob.uid,
    });
    check("T16 non-owner cannot transfer ownership", !!nonOwnerErr);

    // ── T17 owner CAN transfer to an active member (bob)
    const { data: okTransfer, error: transferErr } = await alice.client.rpc("transfer_company_ownership", {
      _company_id: compA.id, _new_owner_user_id: bob.uid,
    });
    check("T17 owner transfers ownership to active member",
      !transferErr && (okTransfer as any)?.ok === true, transferErr?.message);

    // ── T18 post-transfer: bob is the owner
    const { data: compAAfter } = await admin.from("companies").select("owner_user_id").eq("id", compA.id).single();
    check("T18 companies.owner_user_id updated to new owner", compAAfter?.owner_user_id === bob.uid);

    // ── T19 post-transfer: bob has 'owner' role; alice no longer does
    const { data: bobRolesAfter } = await admin.from("company_member_roles")
      .select("role_id").eq("member_id", bobMem!.id);
    const { data: aliceRolesAfter } = await admin.from("company_member_roles")
      .select("role_id").eq("member_id", aliceMember!.id);
    check("T19 owner role moved to new owner, revoked from old",
      !!bobRolesAfter?.some((r) => r.role_id === ownerRoleId)
      && !aliceRolesAfter?.some((r) => r.role_id === ownerRoleId));

    // ── T20 previous owner (alice) can no longer transfer
    const { error: aliceCannotErr } = await alice.client.rpc("transfer_company_ownership", {
      _company_id: compA.id, _new_owner_user_id: alice.uid,
    });
    check("T20 previous owner loses transfer capability", !!aliceCannotErr);

    // ── T21 previous owner membership still exists and is still active
    const { data: aliceStill } = await admin.from("company_members")
      .select("status").eq("id", aliceMember!.id).single();
    check("T21 previous owner remains an active member", aliceStill?.status === "active");

    // ── T22 permissions catalog is world-readable
    const { data: perms } = await anonClient().from("permissions").select("key");
    check("T22 permissions catalog readable to anon",
      !!perms && perms.some((p) => p.key === "members.manage") && perms.some((p) => p.key === "ownership.transfer"));

    // ── T23 owner role has ownership.transfer permission
    const { data: transferPerm } = await admin.from("permissions").select("id").eq("key", "ownership.transfer").single();
    const { data: ownerHas } = await admin.from("role_permissions")
      .select("permission_id").eq("role_id", ownerRoleId).eq("permission_id", transferPerm!.id);
    check("T23 owner role includes ownership.transfer", (ownerHas?.length ?? 0) === 1);

    // ── T24 admin role does NOT have ownership.transfer
    const adminRole = await roleId("admin");
    const { data: adminHas } = await admin.from("role_permissions")
      .select("permission_id").eq("role_id", adminRole).eq("permission_id", transferPerm!.id);
    check("T24 admin role excludes ownership.transfer", (adminHas?.length ?? 0) === 0);

    // ── T25 helper: company_member_has_permission returns true for owner
    const { data: bobHasManage } = await admin.rpc("company_member_has_permission", {
      _company_id: compA.id, _user_id: bob.uid, _permission: "members.manage",
    });
    check("T25 helper reports members.manage for new owner (via owner role)", bobHasManage === true);

    // ── T26 helper returns false for outsider
    const { data: daveHasManage } = await admin.rpc("company_member_has_permission", {
      _company_id: compA.id, _user_id: dave.uid, _permission: "members.manage",
    });
    check("T26 helper returns false for non-manager members", daveHasManage === false);

    // ── T27 CONCURRENCY: two simultaneous transfers — exactly one wins
    // Setup: give bob two candidate members (alice + carol) both active.
    const [r1, r2] = await Promise.allSettled([
      bob.client.rpc("transfer_company_ownership", {
        _company_id: compA.id, _new_owner_user_id: alice.uid,
      }),
      bob.client.rpc("transfer_company_ownership", {
        _company_id: compA.id, _new_owner_user_id: carol.uid,
      }),
    ]);
    const wins = [r1, r2].filter((r) => r.status === "fulfilled" && !(r.value as any).error && (r.value as any).data?.ok).length;
    const fails = [r1, r2].filter((r) => r.status === "rejected" || (r.status === "fulfilled" && ((r.value as any).error || !(r.value as any).data?.ok))).length;
    check("T27 concurrent transfers serialize (exactly one succeeds)", wins === 1 && fails === 1,
      `wins=${wins} fails=${fails}`);

    // ── T28 backfill sanity: system roles + permissions non-empty.
    // The permission catalog is intentionally expanded by later phases
    // (Phase 2 added catalog/warehouse/inventory/reservations/fulfilment
    // permissions and phases 3/4 added channels/exceptions/break_glass,
    // bringing the count from Phase 1's initial 19 to 35).  We assert
    // the current authoritative count so future drift is caught.
    const { count: roleCount } = await admin.from("system_company_roles").select("*", { count: "exact", head: true });
    const { count: permCount } = await admin.from("permissions").select("*", { count: "exact", head: true });
    check("T28 catalog seeded (5 roles, 35 permissions)",
      (roleCount ?? 0) === 5 && (permCount ?? 0) === 35,
      `roles=${roleCount} perms=${permCount}`);

    // ── T29 non-owner cannot spoof app.allow_owner_change to change ownership.
    // Carol (viewer of A) tries: SET the flag, then direct UPDATE.  RLS UPDATE policy
    // restricts writes to the current owner, so no row is affected regardless of the flag.
    try { await carol.client.rpc("set_config" as any, { setting_name: "app.allow_owner_change", new_value: "yes", is_local: true }); } catch {}
    const { data: spoofUpd, error: spoofUpdErr } = await carol.client.from("companies")
      .update({ owner_user_id: carol.uid }).eq("id", compA.id).select();
    const { data: postSpoof } = await admin.from("companies").select("owner_user_id").eq("id", compA.id).single();
    check("T29 non-owner cannot spoof app.allow_owner_change",
      (spoofUpd?.length ?? 0) === 0 && postSpoof?.owner_user_id !== carol.uid,
      `affected=${spoofUpd?.length ?? 0} owner=${postSpoof?.owner_user_id} err=${spoofUpdErr?.message ?? "none"}`);

    // ── T30 SUSPENDED member cannot see the company
    // Add erin to comp A as a member, then suspend her; verify she cannot SELECT it.
    const { data: erinMem } = await admin.from("company_members")
      .insert({ company_id: compA.id, user_id: erin.uid, status: "active" }).select().single();
    await admin.from("company_members").update({ status: "suspended" }).eq("id", erinMem!.id);
    const { data: erinSuspendedSees } = await erin.client.from("companies").select("id").eq("id", compA.id);
    check("T30 suspended member cannot access company data", (erinSuspendedSees?.length ?? 0) === 0);

    // ── T31 REMOVED member cannot see the company
    await admin.from("company_members").update({ status: "removed" }).eq("id", erinMem!.id);
    const { data: erinRemovedSees } = await erin.client.from("companies").select("id").eq("id", compA.id);
    check("T31 removed member cannot access company data", (erinRemovedSees?.length ?? 0) === 0);

    // ── T32 INVITED member does not receive active-member access
    await admin.from("company_members").update({ status: "invited" }).eq("id", erinMem!.id);
    const { data: erinInvitedSees } = await erin.client.from("companies").select("id").eq("id", compA.id);
    check("T32 invited member has no active-member access", (erinInvitedSees?.length ?? 0) === 0);

    // ── T33 transfer audit row is written in the same transaction (present after T17 succeeded)
    const { data: auditRows } = await admin.from("agent_audit_log")
      .select("id, user_id, tool_name, status, input_summary")
      .eq("tool_name", "transfer_company_ownership")
      .order("created_at", { ascending: false }).limit(5);
    const auditHit = auditRows?.find(
      (r: any) => r.input_summary?.company_id === compA.id && r.input_summary?.to === bob.uid,
    );
    check("T33 transfer audit written in same transaction",
      !!auditHit && auditHit.status === "success", JSON.stringify(auditHit?.input_summary));

    // ── T34 STRUCTURAL VERIFICATION (not an executed fault-injection test).
    // Sandbox connection role lacks CREATE ON SCHEMA public, so a temporary
    // BEFORE INSERT trigger cannot be installed here to force the audit write
    // to fail. We report this accurately as a structural verification against
    // the deployed function source rather than mislabelling it as executed.
    // Rationale: transfer_company_ownership has no EXCEPTION handler, its
    // final statement is the INSERT INTO public.agent_audit_log, and the
    // function returns a jsonb value AFTER that INSERT. Any failure of the
    // audit INSERT therefore propagates out of the PL/pgSQL block and aborts
    // the whole implicit transaction — including the owner_user_id UPDATE
    // and the role INSERT/DELETE. A real fault-injection run must be
    // performed in an environment where CREATE ON SCHEMA public is available.
    const src = psql("SELECT prosrc FROM pg_proc WHERE proname='transfer_company_ownership'");
    const hasAudit = /INSERT\s+INTO\s+public\.agent_audit_log/i.test(src);
    const auditBeforeReturn =
      src.search(/INSERT\s+INTO\s+public\.agent_audit_log/i) <
      src.search(/\bRETURN\s+jsonb_build_object/i);
    const noException = !/\bEXCEPTION\s+WHEN\b/i.test(src);
    const t34Structural = hasAudit && auditBeforeReturn && noException;
    console.log(
      `🔎 T34 STRUCTURAL (not executed) — hasAudit=${hasAudit} auditBeforeReturn=${auditBeforeReturn} noExceptionHandler=${noException}`,
    );
    if (!t34Structural) {
      results.push({ name: "T34 (structural)", ok: false });
    }

    const currentOwner = psql(`SELECT owner_user_id FROM public.companies WHERE id='${compA.id}'`);


    // ── T35 CURRENT OWNER cannot spoof app.allow_owner_change via direct UPDATE.
    // Column-level UPDATE privilege on owner_user_id is revoked from authenticated.
    const ownerClient =
      currentOwner === alice.uid ? alice.client :
      currentOwner === bob.uid   ? bob.client   :
      currentOwner === carol.uid ? carol.client :
      currentOwner === dave.uid  ? dave.client  : erin.client;
    const otherActive = psql(
      `SELECT user_id FROM public.company_members WHERE company_id='${compA.id}' AND status='active' AND user_id <> '${currentOwner}' LIMIT 1`,
    );
    try { await ownerClient.rpc("set_config" as any, { setting_name: "app.allow_owner_change", new_value: "yes", is_local: true }); } catch {}
    const { data: ownerSpoof, error: ownerSpoofErr } = await ownerClient.from("companies")
      .update({ owner_user_id: otherActive }).eq("id", compA.id).select();
    const postOwnerSpoof = psql(`SELECT owner_user_id FROM public.companies WHERE id='${compA.id}'`);
    check("T35 current owner cannot bypass RPC (column privilege blocks direct UPDATE)",
      (ownerSpoof?.length ?? 0) === 0 && postOwnerSpoof === currentOwner,
      `err=${ownerSpoofErr?.message ?? "none"} owner=${postOwnerSpoof}`);


    // ── T36-T39 Helper enumeration prevention — authenticated caller cannot
    // inspect another user's membership/roles/permissions via direct RPC.
    const { data: t36Data, error: t36Err } = await dave.client.rpc("is_company_member", {
      _company_id: compA.id, _user_id: alice.uid,
    });
    check("T36 is_company_member blocks _user_id ≠ auth.uid()",
      !!t36Err && t36Data === null, `err=${t36Err?.message ?? "none"} data=${JSON.stringify(t36Data)}`);

    const { data: t37Data, error: t37Err } = await dave.client.rpc("is_company_owner", {
      _company_id: compA.id, _user_id: bob.uid,
    });
    check("T37 is_company_owner blocks _user_id ≠ auth.uid()",
      !!t37Err && t37Data === null);

    const { data: t38Data, error: t38Err } = await dave.client.rpc("company_member_has_permission", {
      _company_id: compA.id, _user_id: bob.uid, _permission: "members.manage",
    });
    check("T38 company_member_has_permission blocks _user_id ≠ auth.uid()",
      !!t38Err && t38Data === null);

    const { data: t39Data, error: t39Err } = await dave.client.rpc("has_role", {
      _user_id: alice.uid, _role: "admin",
    });
    check("T39 has_role blocks _user_id ≠ auth.uid()",
      !!t39Err && t39Data === null);

    // ── T40 Helpers still work for the caller's own uid (regression check).
    const { data: t40Data, error: t40Err } = await bob.client.rpc("is_company_member", {
      _company_id: compA.id, _user_id: bob.uid,
    });
    check("T40 is_company_member works when _user_id = auth.uid()",
      !t40Err && t40Data === true, `err=${t40Err?.message ?? "none"} data=${t40Data}`);

    // ── T41 service_role bypass: admin scripts still enumerate freely.
    const { data: t41Data, error: t41Err } = await admin.rpc("is_company_member", {
      _company_id: compA.id, _user_id: alice.uid,
    });
    check("T41 service_role bypasses enumeration guard",
      !t41Err && t41Data === true, `err=${t41Err?.message ?? "none"} data=${t41Data}`);

  } finally {
    try { psql(`DROP TRIGGER IF EXISTS _t34_audit_fault ON public.agent_audit_log; DROP FUNCTION IF EXISTS public._t34_inject_fault();`); } catch {}
    for (const cid of cleanupCompanies) await admin.from("companies").delete().eq("id", cid);
    for (const u of cleanupUsers) await admin.auth.admin.deleteUser(u.uid).catch(() => {});
  }


  const passed = results.filter((r) => r.ok).length;
  console.log(`\n── ${passed}/${results.length} tests passed ──`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
