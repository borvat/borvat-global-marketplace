#!/usr/bin/env python3
"""Apply ordinary email typing delta to an explicit disposable accepted-baseline copy."""
from pathlib import Path
import argparse,hashlib,json,subprocess
p=argparse.ArgumentParser();p.add_argument('sandbox');a=p.parse_args()
root=Path(__file__).resolve().parent; target=Path(a.sandbox).resolve()
if 'apps/marketplace' in str(target):raise SystemExit('Original import is forbidden; supply disposable accepted-baseline copy')
manifest=json.loads((root/'file-hashes.json').read_text())
for name,hashes in manifest.items():
 f=target/name
 if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=hashes['before']:raise SystemExit('Baseline mismatch: '+name)
cmd=['patch','-p1','--batch','--forward','--fuzz=0','-i',str(root/'borvat-email-types.delta.patch')]
subprocess.run(cmd+['--dry-run'],cwd=target,check=True)
subprocess.run(cmd,cwd=target,check=True)
for name,hashes in manifest.items():
 if hashlib.sha256((target/name).read_bytes()).hexdigest()!=hashes['after']:raise SystemExit('Result mismatch: '+name)
print('PASS: seven-file candidate applied; no install/build/network or production operation performed')
