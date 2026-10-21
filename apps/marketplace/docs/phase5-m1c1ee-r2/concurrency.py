#!/usr/bin/env python3
"""M1C-1E-E-R2 concurrency evidence — two independent committed sessions.

Each scenario:
  * session S0 commits the fixture (so a second backend can see it)
  * sessions A and B open real concurrent transactions and interleave
  * the loser must fail; the winner must be the only acceptance
  * S0 then force-cleans the fixture with session_replication_role=replica,
    which is the ONLY guard bypass used anywhere and is used solely to remove
    by-design-undeletable test rows from the disposable clone.
Nothing here runs against production.
"""
import json, psycopg2, sys

DSN = "host=/tmp/r2 port=5599 user=postgres dbname=postgres"
OUT = []

def new(autocommit=False):
    c = psycopg2.connect(DSN); c.autocommit = autocommit; return c

def seed(tag, publish=True, expiry="interval '2 days'"):
    c = new(True); cur = c.cursor()
    cur.execute("SELECT harness.seed(%s, " + expiry + ", %s)", (tag, publish))
    s = cur.fetchone()[0]; c.close(); return s

def cleanup(s):
    c = new(True); cur = c.cursor()
    cur.execute("SET session_replication_role='replica'")
    for t in ("manual_shipping_quote_state_events", "manual_shipping_quote_acceptances"):
        cur.execute(f"DELETE FROM public.{t} WHERE request_family_id=%s", (s["family"],))
    cur.execute("DELETE FROM public.manual_shipping_quote_offer_conditions WHERE manual_shipping_quote_offer_id IN (SELECT id FROM public.manual_shipping_quote_offers WHERE manual_shipping_quote_request_id IN (SELECT id FROM public.manual_shipping_quote_requests WHERE request_family_id=%s))", (s["family"],))
    for t in ("manual_shipping_quote_offers",):
        cur.execute(f"DELETE FROM public.{t} WHERE manual_shipping_quote_request_id IN (SELECT id FROM public.manual_shipping_quote_requests WHERE request_family_id=%s)", (s["family"],))
    for t in ("manual_shipping_quote_request_items", "manual_shipping_quote_request_packages"):
        cur.execute(f"DELETE FROM public.{t} WHERE manual_shipping_quote_request_id IN (SELECT id FROM public.manual_shipping_quote_requests WHERE request_family_id=%s)", (s["family"],))
    cur.execute("DELETE FROM public.manual_shipping_quote_requests WHERE request_family_id=%s", (s["family"],))
    cur.execute("DELETE FROM public.customer_delivery_destination_versions WHERE id=%s", (s["destv"],))
    cur.execute("DELETE FROM public.customer_delivery_destinations WHERE buyer_principal_id=%s", (s["buyer"],))
    cur.execute("DELETE FROM public.merchant_store_sku_shipping_profiles WHERE merchant_store_id=%s", (s["store"],))
    cur.execute("DELETE FROM public.merchant_fulfillment_origins WHERE id=%s", (s["origin"],))
    cur.execute("DELETE FROM public.merchant_stores WHERE id=%s", (s["store"],))
    cur.execute("DELETE FROM public.companies WHERE id=%s", (s["company"],))
    c.close()

def err(e):
    return f"SQLSTATE={e.pgcode} " + (e.pgerror or str(e)).strip().split("\n")[0]

def record(cid, title, expect, observed, ok, note=""):
    OUT.append(dict(id=cid, title=title, expected=expect, observed=observed,
                    result="PASS" if ok else "FAIL", note=note))
    print(f"{'PASS' if ok else 'FAIL'}  {cid}  {title}\n      observed: {observed}\n")

def accept(cur, s, at=None):
    if at:
        cur.execute("SELECT harness.accept(%s::jsonb, " + at + ")", (json.dumps(s),))
    else:
        cur.execute("SELECT harness.accept(%s::jsonb)", (json.dumps(s),))
    return cur.fetchone()[0]

def count_acc(s):
    c = new(True); cur = c.cursor()
    cur.execute("SELECT count(*) FROM public.manual_shipping_quote_acceptances WHERE request_family_id=%s", (s["family"],))
    n = cur.fetchone()[0]; c.close(); return n

# ---------------------------------------------------------- C1 double accept
def c1():
    s = seed("cc1")
    A, B = new(), new()
    ca, cb = A.cursor(), B.cursor()
    ca.execute("BEGIN"); cb.execute("BEGIN")
    accept(ca, s)                      # A takes the family row lock
    blocked = None
    B_err = None
    try:
        cb.execute("SET LOCAL statement_timeout='2500ms'")
        accept(cb, s)                  # must block on A's FOR UPDATE
        blocked = False
    except psycopg2.Error as e:
        blocked = (e.pgcode == "57014"); B_err = err(e)
    A.commit()
    B.rollback()
    # replay B after A committed: must now fail on merit, not on lock
    C = new(); cc = C.cursor()
    try:
        accept(cc, s); C.commit(); second = "SECOND ACCEPTANCE SUCCEEDED"
    except psycopg2.Error as e:
        second = err(e); C.rollback()
    C.close()
    n = count_acc(s)
    ok = blocked and n == 1 and "not acceptable" in second
    record("C1", "double acceptance of the same offer, two sessions",
           "B blocks on A's family lock; after A commits, B fails on merit; exactly 1 acceptance",
           f"B blocked on lock (timeout 57014): {blocked}; replay: {second}; acceptances={n}", ok,
           f"B while-blocked error: {B_err}")
    A.close(); B.close(); cleanup(s)

# ------------------------------------------------- C2 accept vs new request version
def c2():
    s = seed("cc2")
    A, B = new(), new()
    ca, cb = A.cursor(), B.cursor()
    accept(ca, s)
    loser = None
    try:
        cb.execute("SET LOCAL statement_timeout='2500ms'")
        cb.execute("""INSERT INTO public.manual_shipping_quote_requests
          (request_family_id,company_id,merchant_store_id,buyer_principal_id,delivery_destination_version_id,
           fulfillment_origin_id,shipment_form,currency_code,version_number,status)
          VALUES (%(f)s,%(c)s,%(s)s,%(b)s,%(d)s,%(o)s,'parcel','EUR',2,'draft')""",
          dict(f=s["family"], c=s["company"], s=s["store"], b=s["buyer"], d=s["destv"], o=s["origin"]))
        B.commit(); loser = "REVISION SUCCEEDED"
    except psycopg2.Error as e:
        loser = err(e); B.rollback()
    A.commit()
    n = count_acc(s)
    # after commit, a fresh session must still be refused
    D = new(); cd = D.cursor()
    try:
        cd.execute("""INSERT INTO public.manual_shipping_quote_requests
          (request_family_id,company_id,merchant_store_id,buyer_principal_id,delivery_destination_version_id,
           fulfillment_origin_id,shipment_form,currency_code,version_number,status)
          VALUES (%(f)s,%(c)s,%(s)s,%(b)s,%(d)s,%(o)s,'parcel','EUR',2,'draft')""",
          dict(f=s["family"], c=s["company"], s=s["store"], b=s["buyer"], d=s["destv"], o=s["origin"]))
        D.commit(); after = "REVISION SUCCEEDED AFTER ACCEPTANCE"
    except psycopg2.Error as e:
        after = err(e); D.rollback()
    D.close()
    submit = "n/a (no concurrent draft survived)"
    if loser == "REVISION SUCCEEDED":
        E = new(); ce = E.cursor()
        try:
            ce.execute("""UPDATE public.manual_shipping_quote_requests SET status='requested', requested_at=now()
                          WHERE request_family_id=%s AND version_number=2""", (s["family"],))
            E.commit(); submit = "SURVIVING DRAFT v2 WAS SUBMITTED"
        except psycopg2.Error as e:
            submit = err(e); E.rollback()
        E.close()
    ok = n == 1 and "closed to new versions" in after and "WAS SUBMITTED" not in submit
    record("C2", "acceptance vs concurrent request revision",
           "acceptance wins; the accepted family is closed to new request versions",
           f"concurrent revision: {loser}; surviving-draft submission: {submit}; post-commit revision: {after}; acceptances={n}", ok)
    A.close(); B.close(); cleanup(s)

# ------------------------------------------------- C3 accept vs offer withdrawal
def c3():
    s = seed("cc3")
    A, B = new(), new()
    ca, cb = A.cursor(), B.cursor()
    accept(ca, s)                      # A locks the offer row FOR UPDATE
    w = None
    try:
        cb.execute("SET LOCAL statement_timeout='2500ms'")
        cb.execute("UPDATE public.manual_shipping_quote_offers SET status='withdrawn' WHERE id=%s", (s["offer"],))
        B.commit(); w = "WITHDRAWAL SUCCEEDED"
    except psycopg2.Error as e:
        w = err(e); B.rollback()
    blocked = w.startswith("SQLSTATE=57014")
    A.commit()
    # after acceptance commits, withdrawal must be refused on merit
    D = new(); cd = D.cursor()
    try:
        cd.execute("UPDATE public.manual_shipping_quote_offers SET status='withdrawn' WHERE id=%s", (s["offer"],))
        D.commit(); after = "WITHDRAWAL SUCCEEDED AFTER ACCEPTANCE"
    except psycopg2.Error as e:
        after = err(e); D.rollback()
    D.close()
    st = new(True); c = st.cursor()
    c.execute("SELECT status FROM public.manual_shipping_quote_offers WHERE id=%s", (s["offer"],))
    final = c.fetchone()[0]; st.close()
    ok = blocked and final == "accepted" and count_acc(s) == 1 and "frozen" in after
    record("C3", "acceptance vs concurrent offer withdrawal",
           "withdrawal blocks on the acceptance's row lock, then is refused; offer ends accepted",
           f"concurrent withdrawal: {w}; post-commit withdrawal: {after}; final offer status={final}", ok)
    A.close(); B.close(); cleanup(s)

# ------------------------------------------------- C4 accept vs expiry transition
def c4():
    import time
    s = seed("cc4", True, expiry="interval '2 seconds'")
    time.sleep(3)
    A, B = new(), new()
    ca, cb = A.cursor(), B.cursor()
    # A evaluates acceptance at a time AFTER the offer expires
    a_err = None
    try:
        accept(ca, s); a_err = "ACCEPTED PAST EXPIRY"
    except psycopg2.Error as e:
        a_err = err(e)
    A.rollback()
    # concurrently, the merchant marks the offer expired; that must succeed
    try:
        cb.execute("UPDATE public.manual_shipping_quote_offers SET status='expired' WHERE id=%s", (s["offer"],))
        B.commit(); b_res = "expiry transition committed"
    except psycopg2.Error as e:
        b_res = err(e); B.rollback()
    # and an acceptance attempt after the expiry transition must also fail
    D = new(); cd = D.cursor()
    try:
        accept(cd, s); D.commit(); after = "ACCEPTED AN EXPIRED OFFER"
    except psycopg2.Error as e:
        after = err(e); D.rollback()
    D.close()
    n = count_acc(s)
    ok = "offer_expired" in a_err and b_res == "expiry transition committed" \
         and "not acceptable" in after and n == 0
    record("C4", "acceptance vs expiry transition",
           "read-time expiry refuses acceptance; the expiry transition commits; no acceptance exists",
           f"A (accept past expiry): {a_err}; B: {b_res}; post-expiry accept: {after}; acceptances={n}", ok)
    A.close(); B.close(); cleanup(s)

for f in (c1, c2, c3, c4):
    f()

fails = [r for r in OUT if r["result"] != "PASS"]
json.dump(OUT, open("/tmp/r2/gen/concurrency_results.json", "w"), indent=1)

# residue proof
c = new(True); cur = c.cursor()
tot = {}
for t in ("manual_shipping_quote_requests","manual_shipping_quote_request_items",
          "manual_shipping_quote_request_packages","manual_shipping_quote_offers",
          "manual_shipping_quote_offer_conditions","manual_shipping_quote_acceptances",
          "manual_shipping_quote_state_events"):
    cur.execute(f"SELECT count(*) FROM public.{t}"); tot[t] = cur.fetchone()[0]
c.close()
print("residual rows in the clone:", tot)
print(f"\nCONCURRENCY {len(OUT)}  PASS {len(OUT)-len(fails)}  FAIL {len(fails)}")
sys.exit(1 if fails or any(tot.values()) else 0)
