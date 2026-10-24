"""Compose the pinned WMS fresh installer with an additional BORVAT integration case.

No upstream file, assertion, guard, database or source archive is patched. The hook
runs before the WMS browser case while its real native HTTP server is still alive.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
WMS = Path(os.environ["SUROOH_WMS_ROOT"])
sys.path.insert(0, str(WMS / "verification/native_integration"))
sys.path.insert(0, str(ROOT / "integrations/native-test"))
import native_cases

original_browser = native_cases.run_browser


def commerce_then_browser(browser_config, output):
    import frappe
    from frappe.installer import install_app
    bindings = {}
    for suffix in ("a", "b"):
        frappe.destroy()
        site = f"wms-native-{suffix}.invalid"
        frappe.init(site)
        frappe.connect()
        frappe.set_user("Administrator")
        frappe.flags.mute_emails = True
        if "borvat_native_test" not in frappe.get_installed_apps():
            # The extension's source is declared to the same disposable bench only.
            apps = Path("apps.txt")
            names = apps.read_text().splitlines()
            if "borvat_native_test" not in names:
                apps.write_text(apps.read_text() + "borvat_native_test\n")
            target = Path("../apps/borvat_native_test")
            if not target.exists():
                target.symlink_to(ROOT / "integrations/native-test", target_is_directory=True)
            install_app("borvat_native_test", verbose=False)
        company = "TEST-" + suffix.upper()
        # Create only missing synthetic fixture metadata on the second independent site.
        frappe.local.surooh_native_command = True
        if not frappe.db.exists("Fiscal Year", "BORVAT-2026"):
            if not frappe.db.exists("Fiscal Year", {"year_start_date": "2026-01-01"}):
                frappe.get_doc(dict(doctype="Fiscal Year",year="BORVAT-2026",year_start_date="2026-01-01",year_end_date="2026-12-31")).insert()
        for doctype, name, fields in [
            ("Customer Group","TEST-CUSTOMERS",dict(customer_group_name="TEST-CUSTOMERS",parent_customer_group="All Customer Groups",is_group=0)),
            ("Item Group","TEST-ITEMS",dict(item_group_name="TEST-ITEMS",parent_item_group="All Item Groups",is_group=0)),
            ("Customer","TEST-CUSTOMER",dict(customer_name="TEST-CUSTOMER",customer_type="Company",customer_group="TEST-CUSTOMERS",territory="All Territories")),
            ("Price List","TEST-EUR",dict(price_list_name="TEST-EUR",selling=1,currency="EUR",enabled=1)),
        ]:
            if not frappe.db.exists(doctype,name):
                frappe.get_doc(dict(doctype=doctype,**fields)).insert()
        for code in ("TEST-C1","TEST-C2","BORVAT-LAST"):
            if not frappe.db.exists("Item",code):
                frappe.get_doc(dict(doctype="Item",item_code=code,item_name=code,item_group="TEST-ITEMS",stock_uom="Nos",is_stock_item=1)).insert()
        frappe.defaults.set_global_default("company",company)
        frappe.defaults.set_global_default("currency","EUR")
        frappe.db.set_single_value("System Settings","setup_complete",1)
        frappe.db.set_single_value("Stock Settings","enable_stock_reservation",1)
        frappe.db.set_single_value("Stock Settings","auto_reserve_stock",0)
        frappe.db.set_single_value("Stock Settings","allow_partial_reservation",0)
        actor = f"borvat-worker-{suffix}@example.invalid"
        if not frappe.db.exists("User",actor):
            frappe.get_doc(dict(doctype="User",email=actor,first_name="BORVAT TEST WORKER",send_welcome_email=0,roles=[{"role":"Surooh Lab Operator"}])).insert()
        # Fresh receipt through the approved WMS native writer, never direct Bin/SLE writes.
        from surooh_accounting.native_lab.api import _native
        _native("location_create",{"label":"BORVAT Return Quarantine","quarantine":True},company)
        _native("receive",{"items":[{"item":"TEST-C1","qty":20,"rate":10},{"item":"BORVAT-LAST","qty":1,"rate":10}]},company)
        frappe.db.commit()
        frappe.clear_cache()
        cfg=json.loads(Path(site,"site_config.json").read_text())
        bindings[company]={"url":"http://127.0.0.1:18080/","site":site,"company":company,"actor":actor,"signingKey":cfg["surooh_lab_jwt_key"]}
        frappe.local.surooh_native_command = False
        frappe.destroy()
    result = subprocess.run(
        [str(Path(os.environ['SUROOH_BROWSER_NODE'])),str(ROOT/'scripts/commerce-integration/native-cycle.mjs')],
        input=json.dumps({"bindings":bindings,"output":str(output.parent/'borvat-native-cycle.json')}),
        text=True,capture_output=True,timeout=240,
    )
    # Never forward stderr/config/keys. The safe structured report contains no credentials.
    if result.returncode:
        (output.parent/'borvat-native-process.txt').write_text('Node integration runner exit '+str(result.returncode)+'\n'+result.stdout[-3000:])
        raise RuntimeError('BORVAT native cycle failed; see borvat-native-cycle.json')
    compiled = subprocess.run(
        [str(Path(os.environ['SUROOH_BROWSER_NODE'])),str(ROOT/'scripts/commerce-integration/compiled-native-http.mjs')],
        input=json.dumps({"bindings":bindings,"output":str(output.parent/'borvat-compiled-http.json')}),
        text=True,capture_output=True,timeout=120,
    )
    if compiled.returncode:
        raise RuntimeError('BORVAT compiled HTTP acceptance failed; see borvat-compiled-http.json')
    return original_browser(browser_config,output)


native_cases.run_browser = commerce_then_browser
spec=importlib.util.spec_from_file_location("wms_original_installer",WMS/"verification/native_integration/install_site.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.main()
