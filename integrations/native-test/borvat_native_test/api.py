"""Version 0.1 lab bridge, deliberately not a production or fiscal API.

Uses the existing Surooh JWT/current-role guard and command metadata. Every stock,
reservation, invoice and credit mutation goes through native ERPNext documents.
No alternate stock/financial ledger is created. Test catalogue prices are EUR20,
tax is zero, no shipping invoice mapping is silently invented.
"""
import hashlib
import json
import re

import frappe
from surooh_accounting.native_lab import api as wms


def identity(company):
    if company not in ("TEST-A", "TEST-B"):
        frappe.throw("Synthetic company required", frappe.PermissionError)
    return wms._identity(
        frappe.get_request_header("X-Surooh-Synthetic-JWT") or "", company, "lab-manual"
    )


def bind(envelope):
    if isinstance(envelope, str):
        envelope = json.loads(envelope)
    if not isinstance(envelope, dict) or set(envelope) != {"company", "source", "request_id", "operation", "payload"}:
        frappe.throw("Invalid envelope")
    actor = identity(envelope["company"])
    if envelope["source"] != "lab-manual" or not re.fullmatch(r"[a-f0-9]{64}", envelope["request_id"]):
        frappe.throw("Invalid test command identity")
    digest = hashlib.sha256(json.dumps(
        {"operation": envelope["operation"], "payload": envelope["payload"]},
        sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode()).hexdigest()
    key = hashlib.sha256(json.dumps([envelope["company"], "lab-manual", envelope["request_id"]], separators=(",", ":")).encode()).hexdigest()
    return envelope, actor, digest, key


@frappe.whitelist(allow_guest=True, methods=["POST"])
def lookup(envelope):
    _, _, digest, key = bind(envelope)
    row = frappe.db.sql("SELECT payload_hash,result FROM `tabSurooh Native Command` WHERE name=%s FOR UPDATE", key, as_dict=True)
    if row and row[0].payload_hash != digest:
        frappe.throw("Idempotency payload conflict")
    return {"found": bool(row and row[0].result), "result": json.loads(row[0].result) if row and row[0].result else None}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def availability(company):
    identity(company)
    warehouse = frappe.conf.surooh_lab_warehouse
    bins = frappe.get_all("Bin", filters={"warehouse": warehouse}, fields=["item_code", "actual_qty", "reserved_stock"])
    # Advisory read. Native reserve locks Bin and revalidates availability before success.
    return {"available": {x.item_code: max(0, float(x.actual_qty) - float(x.reserved_stock)) for x in bins}}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def command(envelope):
    e, actor, digest, key = bind(envelope)
    frappe.db.sql("INSERT IGNORE INTO `tabSurooh Native Command` (name,company,source,request_id,payload_hash,actor) VALUES (%s,%s,%s,%s,%s,%s)",
                  (key,e["company"],"lab-manual",e["request_id"],digest,actor))
    row = frappe.db.sql("SELECT payload_hash,result FROM `tabSurooh Native Command` WHERE name=%s FOR UPDATE", key, as_dict=True)[0]
    if row.payload_hash != digest:
        frappe.throw("Idempotency payload conflict")
    if row.result:
        return json.loads(row.result)
    old = frappe.session.user
    frappe.set_user("Administrator")
    frappe.local.surooh_native_command = True
    frappe.local.surooh_actor = actor
    frappe.db.savepoint("borvat_native_operation")
    try:
        try:
            result = dispatch(e["operation"], e["payload"], e["company"])
        except frappe.ValidationError:
            # Only transaction-local native validation: roll back every document/stock effect
            # before persisting a definite rejection. Transport/deadlock errors stay uncertain.
            frappe.db.rollback(save_point="borvat_native_operation")
            frappe.clear_messages()
            result = {"rejected": True, "reason": "NATIVE_VALIDATION_REJECTED"}
        result = json.loads(frappe.as_json(result))
        frappe.db.set_value("Surooh Native Command", key, "result", json.dumps(result), update_modified=False)
        return result
    finally:
        frappe.local.surooh_native_command = False
        frappe.local.surooh_actor = None
        frappe.set_user(old)


def dispatch(operation, payload, company):
    lines = payload.get("lines")
    if not isinstance(lines, list) or not lines:
        frappe.throw("Server-bound order lines required")
    for line in lines:
        if (line.get("company") != company or line.get("sellerId") != payload.get("sellerId")
            or line.get("skuId") not in ("TEST-C1", "TEST-C2", "BORVAT-LAST")
            or type(line.get("quantity")) is not int or not 1 <= line["quantity"] <= 10
            or line.get("unitPriceCents") != 2000 or line.get("packQuantity") != 1):
            frappe.throw("Only explicit EUR20 native synthetic SKU bindings supported")
    refs = payload.get("references", {})
    if operation == "reserve":
        result = wms._native("order", {"lines": [{"product_id": x["skuId"], "quantity": x["quantity"]} for x in lines]}, company)
        names = frappe.get_all("Stock Reservation Entry", filters={"voucher_no": result["order_id"], "docstatus": 1}, pluck="name")
        if not names:
            frappe.throw("Native reservations missing")
        return {"sales_order": result["order_id"], "reservation": ",".join(names)}
    order = wms._document("Sales Order", refs.get("reserve", {}).get("sales_order"), company)
    if operation in ("pick", "pack", "ship", "cancel"):
        return wms._native(operation, {"order_id": order.name}, company)
    delivery = wms._document("Delivery Note", refs.get("ship", {}).get("delivery_note"), company)
    if delivery.docstatus != 1 or delivery.is_return:
        frappe.throw("Submitted original delivery required")
    if operation == "invoice":
        from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice
        doc = make_sales_invoice(delivery.name)
        doc.insert()
        doc.submit()
        if doc.update_stock:
            frappe.throw("Delivery already owns stock movement")
        return {"invoice": doc.name, "delivery_note": delivery.name, "gross_minor": int(round(doc.grand_total * 100))}
    invoice = wms._document("Sales Invoice", refs.get("invoice", {}).get("invoice"), company)
    if invoice.docstatus != 1 or invoice.is_return:
        frappe.throw("Submitted original invoice required")
    if operation in ("receipt", "refund"):
        from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
        target = invoice
        if operation == "refund":
            target = wms._document("Sales Invoice", refs.get("credit", {}).get("credit_note"), company)
            if not target.is_return or target.return_against != invoice.name or target.docstatus != 1:
                frappe.throw("Submitted linked credit required")
        cash = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name")
        if not cash:
            frappe.throw("Synthetic cash clearing account required")
        payment = get_payment_entry("Sales Invoice", target.name, bank_account=cash)
        payment.reference_no = "BORVAT-SIMULATOR-" + payload["orderId"]
        payment.reference_date = target.posting_date
        payment.insert()
        payment.submit()
        target.reload()
        if abs(target.outstanding_amount) > 0.001:
            frappe.throw("Native payment did not reconcile the document")
        return {"payment_entry": payment.name, "invoice": target.name, "amount_minor": int(round(abs(payment.paid_amount) * 100)), "provider": "SIMULATOR-NO-PROVIDER"}
    if operation == "return":
        from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_return
        qty, sku = payload.get("quantity"), payload.get("lineId")
        if type(qty) is not int or qty <= 0 or sku not in {x["skuId"] for x in lines}:
            frappe.throw("Explicit partial return line/quantity required")
        # Locks the original delivery; native validation owns cumulative over-return prevention.
        doc = make_sales_return(delivery.name)
        selected = [x for x in doc.items if x.item_code == sku]
        if len(selected) != 1 or qty > abs(selected[0].qty):
            frappe.throw("Return exceeds native remaining delivered quantity")
        doc.set("items", [selected[0]])
        doc.items[0].qty = -qty
        quarantine = frappe.db.get_value("Warehouse", {"company": company, "warehouse_name": "BORVAT Return Quarantine", "is_rejected_warehouse": 1, "is_group": 0}, "name")
        if not quarantine:
            frappe.throw("Native quarantine binding required")
        wms._stock_locks([sku], quarantine)
        doc.items[0].warehouse = quarantine
        doc.remarks = "BORVAT synthetic partial return; quarantine pending inspection; actor: " + frappe.local.surooh_actor
        doc.insert()
        doc.submit()
        return {"return_note": doc.name, "delivery_note": delivery.name, "warehouse": quarantine}
    if operation == "credit":
        from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return
        returned = wms._document("Delivery Note", refs.get("return", {}).get("return_note"), company)
        if returned.return_against != delivery.name or returned.docstatus != 1:
            frappe.throw("Native return evidence mismatch")
        doc = make_sales_return(invoice.name)
        quantities = {x.item_code: x.qty for x in returned.items}
        selected = [x for x in doc.items if x.item_code in quantities]
        for item in selected:
            item.qty = quantities[item.item_code]
            item.delivery_note = returned.name
            item.dn_detail = next(x.name for x in returned.items if x.item_code == item.item_code)
        doc.set("items", selected)
        doc.update_stock = 0
        doc.insert()
        doc.submit()
        return {"credit_note": doc.name, "invoice": invoice.name, "return_note": returned.name, "gross_minor": int(round(abs(doc.grand_total) * 100))}
    frappe.throw("Unsupported native action")


@frappe.whitelist(allow_guest=True, methods=["POST"])
def document(company, invoice, line=None, creditNote=None):
    identity(company)
    doc = wms._document("Sales Invoice", creditNote or invoice, company)
    if doc.docstatus != 1 or (creditNote and (not doc.is_return or doc.return_against != invoice)):
        frappe.throw("Submitted native document required")
    rows = [x for x in doc.items if line is None or x.item_code == line]
    if len(rows) != 1:
        frappe.throw("One explicit native source line required")
    return {"company":company,"invoice":invoice,"line":rows[0].item_code,"customer":doc.customer,"submitted":True,
            "currency":doc.currency,"eligibleNetCents":int(round(abs(rows[0].net_amount)*100)),
            "eligibleCreditCents":int(round(abs(rows[0].net_amount)*100)),
            "paid":abs(doc.outstanding_amount)<0.001,
            "fulfilled":bool(rows[0].delivery_note),"creditNote":creditNote,
            "source":"native Sales Invoice/Payment Entry; synthetic zero-tax catalogue"}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def inspect_order(company, sales_order):
    identity(company)
    order = wms._document("Sales Order", sales_order, company)
    deliveries = frappe.db.sql("SELECT DISTINCT d.name,d.is_return,d.return_against FROM `tabDelivery Note` d JOIN `tabDelivery Note Item` i ON i.parent=d.name WHERE i.against_sales_order=%s AND d.company=%s AND d.docstatus=1",(order.name,company),as_dict=True)
    names = [d.name for d in deliveries]
    invoices = []
    if names:
        invoices = frappe.db.sql("SELECT DISTINCT s.name,s.is_return,s.return_against,s.grand_total,s.outstanding_amount FROM `tabSales Invoice` s JOIN `tabSales Invoice Item` i ON i.parent=s.name WHERE i.delivery_note IN %(names)s AND s.company=%(company)s AND s.docstatus=1",dict(names=names,company=company),as_dict=True)
    documents = [s.name for s in invoices]
    payments = []
    if documents:
        payments = frappe.db.sql("SELECT DISTINCT p.name,p.payment_type,p.paid_amount FROM `tabPayment Entry` p JOIN `tabPayment Entry Reference` r ON r.parent=p.name WHERE r.reference_doctype='Sales Invoice' AND r.reference_name IN %(names)s AND p.company=%(company)s AND p.docstatus=1",dict(names=documents,company=company),as_dict=True)
    vouchers = names+documents+[p.name for p in payments]
    gl = frappe.get_all("GL Entry",filters={"company":company,"voucher_no":["in",vouchers],"is_cancelled":0},fields=["voucher_no","debit","credit"]) if vouchers else []
    stock = frappe.get_all("Stock Ledger Entry",filters={"company":company,"voucher_no":["in",names],"is_cancelled":0},fields=["voucher_no","item_code","warehouse","actual_qty"]) if names else []
    return {"company":company,"sales_order":order.name,"reservations":frappe.get_all("Stock Reservation Entry",filters={"voucher_no":order.name,"docstatus":1},pluck="name"),"deliveries":[dict(x)for x in deliveries],"invoices":[dict(x)for x in invoices],"payments":[dict(x)for x in payments],"general_ledger":[dict(x)for x in gl],"stock_ledger":[dict(x)for x in stock],"source":"native ERPNext submitted documents, SRE, SLE, GL; no marketplace ledger"}
