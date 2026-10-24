"""Reuse the exact WMS bootstrap, substituting only its additional-case installer.

Requires an explicit checkout. Hash/source identities are recorded by the original
runner. This does not skip native assertions or promote blocked browser results.
"""
import argparse
import hashlib
from pathlib import Path
import sys
import shutil
import time

parser=argparse.ArgumentParser(add_help=False)
parser.add_argument('--wms-root',type=Path,required=True)
args,remaining=parser.parse_known_args()
wms=args.wms_root.resolve()
sys.path.insert(0,str(wms/'verification/native_integration'))
source=(wms/'verification/native_integration/bootstrap.py').read_text()
old='ROOT / "verification/native_integration/install_site.py"'
if source.count(old)!=1:
    raise RuntimeError('Upstream installer dispatch changed: review required')
root=Path(__file__).resolve().parents[2]
original_remove=shutil.rmtree
def remove_owned(path,*positional,**keywords):
    owned=Path(path).absolute()
    if owned.parent!=root.parent or not owned.name.startswith('surooh-new-native-'):
        return original_remove(path,*positional,**keywords)
    # A previous native run exposed delayed filesystem teardown after MariaDB exited.
    # Retry only this runner-owned disposable directory; preserve a real cleanup failure.
    for attempt in range(6):
        try:
            if owned.exists(): original_remove(path,*positional,**keywords)
            return
        except OSError:
            if attempt==5: raise
            time.sleep(0.2)
shutil.rmtree=remove_owned
source=source.replace(old,repr(str(root/'scripts/commerce-integration/native-installer.py')))
sys.argv=[sys.argv[0],*remaining]
namespace={'__name__':'borvat_composed_bootstrap','__file__':str(wms/'verification/native_integration/bootstrap.py')}
exec(compile(source,str(wms/'verification/native_integration/bootstrap.py'),'exec'),namespace)
print('WMS bootstrap source SHA256',hashlib.sha256((wms/'verification/native_integration/bootstrap.py').read_bytes()).hexdigest(),flush=True)
sys.exit(namespace['main']())
