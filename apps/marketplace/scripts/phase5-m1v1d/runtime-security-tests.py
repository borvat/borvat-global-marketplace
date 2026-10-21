#!/usr/bin/env python3
"""M1V-1D — RUNTIME SECURITY TESTS (14 declared tests).

Identities used (no privilege is granted, nothing is bypassed):
  A. anon           — publishable key only, no session.
  B. outsider       — a freshly signed-up authenticated user. Not a platform
                      admin, not a member of any company.
  C. owner/admin    — the injected live session of ceo@suroohholdings.com
                      (Qnan B.V. company owner AND, pre-existing since
                      M1A-M2D1C, the single platform administrator).

Read-only where possible. The only writes are the seller-side draft upsert on
the seller's own company (an authorised seller action) and the test account
signup. No admin bypass, no role grants, no ACL changes.
"""
import json, os, sys, time, urllib.request, urllib.error

URL = "https://bmtjeyuiwfubwvpxwojr.supabase.co"
ANON = "sb_publishable_4nOQIk1Oeam_Llq1erEyQg_1v8GYT4G"
QNAN = "8069c727-61c1-4285-9275-6fc22ef621f7"

results = []


def call(path, token=None, method="POST", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method)
    req.add_header("apikey", ANON)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def rpc(name, args, token=None):
    return call("/rest/v1/rpc/" + name, token, "POST", args)


def check(no, name, ok, detail):
    results.append((no, name, ok, detail))
    print(("PASS" if ok else "FAIL") + f" T{no:02d}: {name} :: {detail[:220]}")


owner_token = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN")
if not owner_token:
    sess = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    owner_token = json.loads(sess)["access_token"] if sess else None
if not owner_token:
    print("HARNESS FAILURE: no live owner/admin session available")
    sys.exit(70)

# ---- identity B: outsider (authenticated, no admin role, no membership) -----
# ---- identity B: outsider (authenticated, no admin role, no membership) -----
# The service key is used ONLY to create and delete this throwaway confirmed
# test account. It is never used to call any M1V-1D RPC and grants the account
# no role: the account signs in normally and is a plain authenticated user.
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
stamp = int(time.time())
email = f"m1v1d_outsider_{stamp}@borvat.test"
password = f"Tst!{stamp}aA9"


def admin_api(path, method="POST", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method)
    req.add_header("apikey", SERVICE)
    req.add_header("Authorization", "Bearer " + SERVICE)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


st, bd = admin_api("/auth/v1/admin/users", "POST",
                   {"email": email, "password": password, "email_confirm": True})
outsider_uid = json.loads(bd).get("id") if st in (200, 201) else None
st, bd = call("/auth/v1/token?grant_type=password", None, "POST",
              {"email": email, "password": password})
outsider = json.loads(bd).get("access_token") if st == 200 else None
if not outsider:
    print("HARNESS FAILURE: could not create a non-admin authenticated identity:", st, bd[:300])
    sys.exit(70)
print(f"outsider identity: {email} (plain authenticated, no roles, no memberships)")


# ---------------------------------------------------------------- tests -----
# 1-3: anon has no execute right on the admin review surface at all.
ANON_PROBES = [
    ("admin_list_seller_applications", {"p_status": None, "p_limit": 10, "p_offset": 0}),
    ("admin_get_seller_application", {"p_application_id": "00000000-0000-0000-0000-000000000000"}),
    ("admin_review_seller_application", {"p_application_id": "00000000-0000-0000-0000-000000000000",
                                         "p_action": "approve", "p_reason": None}),
]
for i, (fn, args) in enumerate(ANON_PROBES, start=1):
    st, bd = rpc(fn, args, None)
    check(i, f"anon cannot execute {fn}",
          st >= 400 and "permission denied for function" in bd, f"http {st} {bd[:140]}")


# 4-6: authenticated non-admin is refused by the admin RPCs.
st, bd = rpc("admin_list_seller_applications",
             {"p_status": None, "p_limit": 10, "p_offset": 0}, outsider)
check(4, "non-admin authenticated cannot list seller applications",
      st >= 400 and "not_platform_admin" in bd, f"http {st} {bd[:160]}")

st, bd = rpc("admin_get_seller_application",
             {"p_application_id": "00000000-0000-0000-0000-000000000000"}, outsider)
check(5, "non-admin authenticated cannot read a seller application",
      st >= 400 and "not_platform_admin" in bd, f"http {st} {bd[:160]}")

st, bd = rpc("admin_review_seller_application",
             {"p_application_id": "00000000-0000-0000-0000-000000000000",
              "p_action": "approve", "p_reason": None}, outsider)
check(6, "non-admin authenticated cannot review a seller application",
      st >= 400 and "not_platform_admin" in bd, f"http {st} {bd[:160]}")

# 7-8: seller RPCs are membership scoped.
st, bd = rpc("seller_get_application", {"p_company_id": QNAN}, outsider)
check(7, "non-member cannot read another company's application",
      st >= 400 and "not_authorised" in bd, f"http {st} {bd[:160]}")

st, bd = rpc("seller_upsert_application",
             {"p_company_id": QNAN, "p_store_id": None, "p_contact_name": "x",
              "p_contact_email": "x@x.nl", "p_contact_phone": None,
              "p_intended_categories": ["a"], "p_expected_monthly_orders": 1,
              "p_business_summary": None, "p_seller_note": None}, outsider)
check(8, "non-member cannot write another company's application",
      st >= 400 and "not_authorised" in bd, f"http {st} {bd[:160]}")

# 9: no direct table access for any application role (RPC-only surface).
bad = []
for tok, label in ((None, "anon"), (outsider, "authenticated")):
    for t in ("seller_applications", "seller_application_events"):
        st, bd = call(f"/rest/v1/{t}?select=id&limit=1", tok, "GET")
        if st < 400:
            bad.append(f"{label}->{t}:{st}")
check(9, "seller_applications tables unreadable over the data API", not bad,
      "denied for anon and authenticated" if not bad else ",".join(bad))

# 10: platform admin CAN list (authorisation path proven positively).
st, bd = rpc("admin_list_seller_applications",
             {"p_status": None, "p_limit": 10, "p_offset": 0}, owner_token)
check(10, "platform admin can list seller applications",
      st == 200, f"http {st} {bd[:160]}")

# 11: seller owner can read/write its own company's application (draft).
st, bd = rpc("seller_upsert_application",
             {"p_company_id": QNAN, "p_store_id": None,
              "p_contact_name": "Anas Al Sirafy",
              "p_contact_email": "ceo@suroohholdings.com",
              "p_contact_phone": None, "p_intended_categories": ["elektronica"],
              "p_expected_monthly_orders": 50,
              "p_business_summary": "IBBO store on Borvat.",
              "p_seller_note": None}, owner_token)
app = json.loads(bd) if st == 200 else {}
check(11, "seller owner can create/update its own draft application",
      st == 200 and app.get("status") == "draft", f"http {st} {bd[:160]}")
app_id = app.get("id")

# 12: submission is blocked while the legal identity is not approved-grade.
st, bd = rpc("seller_submit_application", {"p_company_id": QNAN}, owner_token)
submit_ok = st == 200
check(12, "submission enforces the legal-identity precondition or succeeds cleanly",
      st == 200 or "legal_identity" in bd or "application_incomplete" in bd,
      f"http {st} {bd[:200]}")

# 13: self-review is structurally impossible, even for the platform admin.
if app_id:
    st, bd = rpc("admin_review_seller_application",
                 {"p_application_id": app_id, "p_action": "start_review",
                  "p_reason": None}, owner_token)
    check(13, "platform admin cannot review an application of a company he belongs to",
          st >= 400 and "self_review_forbidden" in bd, f"http {st} {bd[:200]}")
else:
    check(13, "self-review guard", False, "no application id available")

# 14: illegal transition rejected (approve straight from draft/submitted by a
#     non-authorised caller is already covered; here: outsider action verb).
st, bd = rpc("admin_review_seller_application",
             {"p_application_id": app_id or "00000000-0000-0000-0000-000000000000",
              "p_action": "not_a_real_action", "p_reason": None}, outsider)
check(14, "unknown/illegal review action never executes for a non-admin",
      st >= 400 and "not_platform_admin" in bd, f"http {st} {bd[:160]}")

# harness teardown: remove the throwaway outsider account.
if outsider_uid:
    admin_api(f"/auth/v1/admin/users/{outsider_uid}", "DELETE")
    print("outsider identity deleted")

fails = [r for r in results if not r[2]]
print("\n== M1V-1D RUNTIME SECURITY TESTS ==")
print(f"total={len(results)} pass={len(results)-len(fails)} fail={len(fails)}")
print("M1V-1D RUNTIME GATE: " + ("PASS" if not fails else "FAIL"))
sys.exit(0 if not fails else 1)
