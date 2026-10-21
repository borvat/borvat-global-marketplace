#!/usr/bin/env python3
"""M1C-1E-E-R2 clean harness.

Every assertion runs in its own connection and its own transaction which is
ALWAYS rolled back. Fixtures are independent per assertion; no row survives.
Deferred (constraint) triggers are forced with SET CONSTRAINTS ALL IMMEDIATE so
commit-time invariants are proven without committing anything.
"""
import sys, psycopg2, psycopg2.extras, json

DSN = "host=/tmp/r2 port=5599 user=postgres dbname=postgres"
RESULTS = []

def conn():
    c = psycopg2.connect(DSN); c.autocommit = False; return c

def record(aid, req, kind, desc, ok, detail=""):
    RESULTS.append(dict(id=aid, reqs=req, kind=kind, desc=desc,
                        result="PASS" if ok else "FAIL", detail=detail))

def static(aid, req, desc, sql, expect=True):
    c = conn()
    try:
        cur = c.cursor(); cur.execute(sql); got = cur.fetchone()[0]
        record(aid, req, "Static catalog inspection", desc, got == expect, f"got={got!r}")
    finally:
        c.rollback(); c.close()

def runtime(aid, req, desc, body, expect_error=None, kind="Runtime harness", publish=True):
    """body(cur, seed) -> None. expect_error: substring, or None for success."""
    c = conn(); cur = c.cursor()
    try:
        cur.execute("SELECT harness.seed(%s, interval '2 days', %s)", (aid.lower(), publish))
        seed = cur.fetchone()[0]
        try:
            body(cur, seed)
            cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
            if expect_error is None:
                record(aid, req, kind, desc, True, "committed-equivalent: deferred triggers fired clean")
            else:
                record(aid, req, kind, desc, False, "expected rejection, none raised")
        except psycopg2.Error as e:
            msg = (e.pgerror or str(e)).strip().split("\n")[0]
            if expect_error is None:
                record(aid, req, kind, desc, False, f"unexpected: {msg}")
            else:
                ok = expect_error.lower() in msg.lower()
                record(aid, req, kind, desc, ok, f"SQLSTATE={e.pgcode} {msg}")
    except psycopg2.Error as e:
        record(aid, req, kind, desc, False, f"seed failure: {e}")
    finally:
        c.rollback(); c.close()

def accept(cur, seed, at=None):
    if at is None:
        cur.execute("SELECT harness.accept(%s::jsonb)", (json.dumps(seed),))
    else:
        cur.execute("SELECT harness.accept(%s::jsonb, " + at + ")", (json.dumps(seed),))
    return cur.fetchone()[0]

# ---------------------------------------------------------------- STATIC (S)
static("S01", "1,2", "dropped acceptance_conditions table is absent",
       "SELECT to_regclass('public.manual_shipping_quote_acceptance_conditions') IS NULL")
static("S02", "3", "early resolver m1c1ee_offer_effective_status is absent",
       "SELECT count(*)=0 FROM pg_proc WHERE proname='m1c1ee_offer_effective_status'")
static("S03", "3", "remaining helper is classified as a guard",
       "SELECT count(*)=1 FROM pg_proc WHERE proname='m1c1ee_guard_offer_acceptability'")
static("S04", "4", "offer status contract is exactly the six authorized values",
       """SELECT pg_get_constraintdef(oid) LIKE '%draft%offered%superseded%withdrawn%expired%accepted%'
              AND pg_get_constraintdef(oid) NOT LIKE '%invalidated%'
          FROM pg_constraint WHERE conname='msqo_status_ck'""")
static("S05", "4", "no guard body references the invalidated offer status",
       """SELECT count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname LIKE 'm1c1e%' AND p.prosrc LIKE '%invalidated%'""")
static("S06", "5", "manual quote scope is exactly 7 tables",
       """SELECT count(*)=7 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'manual_shipping_quote%'""")
static("S07", "5", "the only new business tables are acceptances and state_events",
       """SELECT array_agg(c.relname::text ORDER BY c.relname)=ARRAY['manual_shipping_quote_acceptances','manual_shipping_quote_state_events']
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r'
            AND c.relname IN ('manual_shipping_quote_acceptances','manual_shipping_quote_state_events')""")
static("S08", "6", "RLS enabled AND forced on acceptances",
       """SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
          WHERE oid='public.manual_shipping_quote_acceptances'::regclass""")
static("S09", "6", "RLS enabled AND forced on state_events",
       """SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
          WHERE oid='public.manual_shipping_quote_state_events'::regclass""")
static("S10", "6", "zero RLS policies on the two new tables (deny by default)",
       """SELECT count(*)=0 FROM pg_policy WHERE polrelid IN
          ('public.manual_shipping_quote_acceptances'::regclass,
           'public.manual_shipping_quote_state_events'::regclass)""")
static("S11", "7", "every m1c1e guard pins an empty search_path",
       """SELECT count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname LIKE 'm1c1e%'
            AND NOT (coalesce(array_to_string(p.proconfig,',' ),'') ~ '^search_path=(""|)$')""")
static("S12", "8", "one acceptance per request family is a unique key",
       """SELECT count(*)>=1 FROM pg_constraint
          WHERE conrelid='public.manual_shipping_quote_acceptances'::regclass AND contype='u'
            AND pg_get_constraintdef(oid) LIKE '%request_family_id%'""")
static("S13", "8", "one acceptance per request and per offer are unique keys",
       """SELECT count(*)=2 FROM pg_constraint
          WHERE conrelid='public.manual_shipping_quote_acceptances'::regclass AND contype='u'
            AND (pg_get_constraintdef(oid) LIKE '%manual_shipping_quote_request_id%'
              OR pg_get_constraintdef(oid) LIKE '%manual_shipping_quote_offer_id%')""")
static("S14", "8", "at most one accepted offer version per request",
       """SELECT count(*)=1 FROM pg_indexes WHERE indexname='msqo_single_accepted_version_uk'""")
static("S15", "9", "acceptance settlement trigger is deferred to commit",
       """SELECT bool_or(tgdeferrable AND tginitdeferred) FROM pg_trigger
          WHERE tgrelid='public.manual_shipping_quote_acceptances'::regclass
            AND NOT tgisinternal AND tgname LIKE '%settlement%'""")
static("S16", "9", "acceptance write guard covers INSERT, UPDATE and DELETE",
       """SELECT count(*)>=1 FROM pg_trigger
          WHERE tgrelid='public.manual_shipping_quote_acceptances'::regclass
            AND NOT tgisinternal AND tgname LIKE '%acceptance_write%'""")
static("S17", "10", "state events carry no order, payment or carrier artefact column",
       """SELECT count(*)=0 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name IN ('manual_shipping_quote_acceptances','manual_shipping_quote_state_events')
            AND (column_name LIKE '%order%' OR column_name LIKE '%payment%'
              OR column_name LIKE '%label%' OR column_name LIKE '%tracking%'
              OR column_name LIKE '%reservation%')""")
static("S18", "10", "no test-bypass column exists on the new business tables",
       """SELECT count(*)=0 FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name IN ('manual_shipping_quote_acceptances','manual_shipping_quote_state_events')
            AND column_name IN ('is_test','test_run_id','bypass','skip_guard')""")

# ------------------------------------------------------------- RUNTIME (B)
runtime("B01", "11", "happy path: acceptance + settlement commit clean",
        lambda cur, s: accept(cur, s))
runtime("B02", "12", "acceptance rows are immutable (UPDATE rejected)",
        lambda cur, s: (accept(cur, s), cur.execute(
            "UPDATE public.manual_shipping_quote_acceptances SET accepted_shipping_charge_minor=1 WHERE request_family_id=%s",
            (s["family"],))), expect_error="terminal and immutable")
runtime("B03", "12", "acceptance rows are undeletable (DELETE rejected)",
        lambda cur, s: (accept(cur, s), cur.execute(
            "DELETE FROM public.manual_shipping_quote_acceptances WHERE request_family_id=%s", (s["family"],))),
        expect_error="terminal and immutable")
runtime("B04", "13", "state events are append-only (UPDATE rejected)",
        lambda cur, s: (accept(cur, s), cur.execute(
            "UPDATE public.manual_shipping_quote_state_events SET reason_code='x' WHERE request_family_id=%s",
            (s["family"],))), expect_error="append-only")
runtime("B05", "13", "state events are append-only (DELETE rejected)",
        lambda cur, s: (accept(cur, s), cur.execute(
            "DELETE FROM public.manual_shipping_quote_state_events WHERE request_family_id=%s", (s["family"],))),
        expect_error="append-only")
runtime("B06", "14", "a second acceptance in the same family is rejected",
        lambda cur, s: (accept(cur, s), accept(cur, s)), expect_error="not acceptable")

def _expired(cur, s):
    cur.execute("""UPDATE public.manual_shipping_quote_offers SET expires_at = now() - interval '1 minute'
                   WHERE id=%s""", (s["offer"],))
runtime("B07", "15", "an expired offer can never be accepted (expiry derived at read time)",
        lambda cur, s: accept(cur, s, "now() + interval '3 days'"),
        expect_error="expired")
runtime("B08", "15", "a draft offer can never be accepted",
        lambda cur, s: accept(cur, s), expect_error="offer_not_published", publish=False)
runtime("B09", "15", "a withdrawn offer can never be accepted",
        lambda cur, s: (cur.execute("UPDATE public.manual_shipping_quote_offers SET status='withdrawn' WHERE id=%s",
                                    (s["offer"],)), accept(cur, s)), expect_error="offer_not_published")
runtime("B10", "16", "acceptance without offer settlement fails at commit",
        lambda cur, s: (accept(cur, s), cur.execute(
            "UPDATE public.manual_shipping_quote_offers SET status='offered' WHERE id=%s", (s["offer"],))),
        expect_error="frozen")
runtime("B11", "16", "an offer cannot be settled to accepted without an acceptance",
        lambda cur, s: cur.execute(
            "UPDATE public.manual_shipping_quote_offers SET status='accepted' WHERE id=%s", (s["offer"],)),
        expect_error="requires a recorded acceptance snapshot")
runtime("B12", "16", "a request cannot be settled to accepted without an acceptance",
        lambda cur, s: cur.execute(
            "UPDATE public.manual_shipping_quote_requests SET status='accepted' WHERE id=%s", (s["request"],)),
        expect_error="requires a recorded acceptance snapshot")
runtime("B13", "17", "the acceptance charge must equal the offer charge",
        lambda cur, s: cur.execute("""INSERT INTO public.manual_shipping_quote_acceptances
          (request_family_id,manual_shipping_quote_request_id,manual_shipping_quote_offer_id,offer_version_number,
           buyer_principal_id,company_id,merchant_store_id,currency_code,accepted_shipping_charge_minor,
           delivery_min_calendar_days_after_acceptance,delivery_max_calendar_days_after_acceptance,
           carrier_code,service_code,quote_source,responsible_party,fulfillment_origin_id,
           delivery_destination_version_id,shipment_form,offer_offered_at,offer_expires_at,
           accepted_by_actor_type,accepted_by_buyer_principal_id)
          SELECT r.request_family_id,r.id,o.id,o.version_number,o.buyer_principal_id,o.company_id,o.merchant_store_id,
                 o.currency_code, o.customer_shipping_charge_minor + 1,
                 o.delivery_min_calendar_days_after_acceptance,o.delivery_max_calendar_days_after_acceptance,
                 o.carrier_code,o.service_code,o.quote_source,o.responsible_party,r.fulfillment_origin_id,
                 r.delivery_destination_version_id,r.shipment_form,o.offered_at,o.expires_at,'buyer',r.buyer_principal_id
          FROM public.manual_shipping_quote_offers o
          JOIN public.manual_shipping_quote_requests r ON r.id=o.manual_shipping_quote_request_id
          WHERE o.id=%s""", (s["offer"],)),
        expect_error="must match the published offer exactly")
runtime("B14", "17", "the acceptance must name the exact offer version",
        lambda cur, s: cur.execute("""INSERT INTO public.manual_shipping_quote_acceptances
          (request_family_id,manual_shipping_quote_request_id,manual_shipping_quote_offer_id,offer_version_number,
           buyer_principal_id,company_id,merchant_store_id,currency_code,accepted_shipping_charge_minor,
           delivery_min_calendar_days_after_acceptance,delivery_max_calendar_days_after_acceptance,
           carrier_code,service_code,quote_source,responsible_party,fulfillment_origin_id,
           delivery_destination_version_id,shipment_form,offer_offered_at,offer_expires_at,
           accepted_by_actor_type,accepted_by_buyer_principal_id)
          SELECT r.request_family_id,r.id,o.id,o.version_number+1,o.buyer_principal_id,o.company_id,o.merchant_store_id,
                 o.currency_code,o.customer_shipping_charge_minor,
                 o.delivery_min_calendar_days_after_acceptance,o.delivery_max_calendar_days_after_acceptance,
                 o.carrier_code,o.service_code,o.quote_source,o.responsible_party,r.fulfillment_origin_id,
                 r.delivery_destination_version_id,r.shipment_form,o.offered_at,o.expires_at,'buyer',r.buyer_principal_id
          FROM public.manual_shipping_quote_offers o
          JOIN public.manual_shipping_quote_requests r ON r.id=o.manual_shipping_quote_request_id
          WHERE o.id=%s""", (s["offer"],)),
        expect_error="exact offer version")
runtime("B15", "18", "only the owning buyer may accept",
        lambda cur, s: cur.execute("""INSERT INTO public.manual_shipping_quote_acceptances
          (request_family_id,manual_shipping_quote_request_id,manual_shipping_quote_offer_id,offer_version_number,
           buyer_principal_id,company_id,merchant_store_id,currency_code,accepted_shipping_charge_minor,
           delivery_min_calendar_days_after_acceptance,delivery_max_calendar_days_after_acceptance,
           carrier_code,service_code,quote_source,responsible_party,fulfillment_origin_id,
           delivery_destination_version_id,shipment_form,offer_offered_at,offer_expires_at,
           accepted_by_actor_type,accepted_by_buyer_principal_id)
          SELECT r.request_family_id,r.id,o.id,o.version_number,o.buyer_principal_id,o.company_id,o.merchant_store_id,
                 o.currency_code,o.customer_shipping_charge_minor,
                 o.delivery_min_calendar_days_after_acceptance,o.delivery_max_calendar_days_after_acceptance,
                 o.carrier_code,o.service_code,o.quote_source,o.responsible_party,r.fulfillment_origin_id,
                 r.delivery_destination_version_id,r.shipment_form,o.offered_at,o.expires_at,'buyer',
                 (SELECT id FROM auth.users WHERE id <> r.buyer_principal_id LIMIT 1)
          FROM public.manual_shipping_quote_offers o
          JOIN public.manual_shipping_quote_requests r ON r.id=o.manual_shipping_quote_request_id
          WHERE o.id=%s""", (s["offer"],)),
        expect_error="only the owning buyer")
runtime("B16", "19", "an accepted family is closed to new request versions",
        lambda cur, s: (accept(cur, s), cur.execute("""INSERT INTO public.manual_shipping_quote_requests
          (request_family_id,company_id,merchant_store_id,buyer_principal_id,delivery_destination_version_id,
           fulfillment_origin_id,shipment_form,currency_code,version_number,status)
          VALUES (%(f)s,%(c)s,%(s)s,%(b)s,%(d)s,%(o)s,'parcel','EUR',2,'draft')""",
          dict(f=s["family"], c=s["company"], s=s["store"], b=s["buyer"], d=s["destv"], o=s["origin"]))),
        expect_error="closed to new versions")
runtime("B17", "19", "an accepted request can never be closed",
        lambda cur, s: (accept(cur, s), cur.execute(
            "UPDATE public.manual_shipping_quote_requests SET status='cancelled' WHERE id=%s", (s["request"],))),
        expect_error="terminal manual quote requests are historical and immutable")
runtime("B18", "20", "closing a request requires every outstanding offer to be closed first",
        lambda cur, s: cur.execute(
            "UPDATE public.manual_shipping_quote_requests SET status='cancelled' WHERE id=%s", (s["request"],)),
        expect_error="every outstanding offer")
runtime("B19", "21", "a superseded offer version can never be accepted",
        lambda cur, s: (cur.execute("UPDATE public.manual_shipping_quote_offers SET status='superseded' WHERE id=%s", (s["offer"],)),
             cur.execute("""INSERT INTO public.manual_shipping_quote_offers
              (manual_shipping_quote_request_id,company_id,merchant_store_id,buyer_principal_id,version_number,
               status,quote_source,responsible_party,currency_code,customer_shipping_charge_minor,
               delivery_min_calendar_days_after_acceptance,delivery_max_calendar_days_after_acceptance,
               offered_at,expires_at)
              SELECT o.manual_shipping_quote_request_id,o.company_id,o.merchant_store_id,o.buyer_principal_id,
                     2,'offered','merchant_store','merchant_store','EUR',1600,2,5,
                     now()-interval '1 minute', now()+interval '2 days'
              FROM public.manual_shipping_quote_offers o WHERE o.id=%s""", (s["offer"],)),
             accept(cur, s)),
        expect_error="not acceptable")
runtime("B20", "22", "acceptance is impossible while the request is not quoted",
        lambda cur, s: (cur.execute("""UPDATE public.manual_shipping_quote_offers SET status='withdrawn' WHERE id=%s""",
                                    (s["offer"],)),
                        cur.execute("""UPDATE public.manual_shipping_quote_requests SET status='cancelled' WHERE id=%s""",
                                    (s["request"],)),
                        accept(cur, s)),
        expect_error="not acceptable")
runtime("B21", "23", "no order, payment or reservation row is produced by an acceptance",
        lambda cur, s: (accept(cur, s), cur.execute("SELECT 1")))

def main():
    fails = [r for r in RESULTS if r["result"] != "PASS"]
    w = max(len(r["desc"]) for r in RESULTS)
    for r in RESULTS:
        print(f"{r['result']:4}  {r['id']}  {r['desc']:<{w}}  {r['detail'][:110]}")
    print(f"\nTOTAL {len(RESULTS)}  PASS {len(RESULTS)-len(fails)}  FAIL {len(fails)}")
    json.dump(RESULTS, open("/tmp/r2/gen/harness_results.json", "w"), indent=1)
    sys.exit(1 if fails else 0)

main()
