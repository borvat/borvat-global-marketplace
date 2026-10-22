from pathlib import Path
import json,copy,sys
sys.path.insert(0,str(Path('hardening/python-validation').resolve()))
import jsonschema
root=Path('../marketplace-foundation/experiments/mercur-hardening/native-closure/contracts');schema=json.loads((root/'shared-command-v1.schema.json').read_text());auth=json.loads((root/'shared-core-authority.json').read_text())
base={'schema_version':1,'command_id':'synthetic-command-1','company_id':'A','source':'BORVAT Marketplace','operation':'reserve_bundle','external_key':'order-native-1:reservation:v1','payload':{'order_id':'order-native-1','items':[{'sku':'SYNTHETIC-A','quantity':1}]},'policy_version':'shared-core-001','bom_version':'synthetic-bom-v1'}
cases=[]
def case(name,value,expected):
 errors=list(jsonschema.Draft202012Validator(schema).iter_errors(value));actual=not errors;assert actual==expected,(name,[x.message for x in errors]);cases.append({'case':name,'status':'PASS','schema_valid':actual})
case('reservation command shape',base,True)
for operation in ['create_invoice_draft','create_credit_draft','release_reservation','dispatch_stock']:
 v=copy.deepcopy(base);v['operation']=operation;case(operation,v,True)
for name,change in [('reject direct financial submit',{'operation':'submit_invoice'}),('reject direct payment',{'operation':'pay_seller'}),('reject undeclared company override',{'actor_company_id':'B'}),('reject version drift',{'schema_version':2})]:
 v=copy.deepcopy(base);v.update(change);case(name,v,False)
v=copy.deepcopy(base);del v['company_id'];case('company required',v,False)
assert auth['authorities']['physical_quantity']=='ERPNext.Stock Ledger Entry';assert not auth['dual_reservation_writer_allowed'];assert not auth['execution_authorized'];assert not auth['direct_ui_engine_write_authorized']
Path('closure/contract-tests.json').write_text(json.dumps({'status':'PASS','cases':cases,'authority_invariants':'PASS','scope':'Real pinned schemas, synthetic fixtures; no deployed ERPNext/WMS endpoint contacted'},indent=2));Path('closure/command-example.json').write_text(json.dumps(base,indent=2));print('10 contract cases and authority invariants PASS')
