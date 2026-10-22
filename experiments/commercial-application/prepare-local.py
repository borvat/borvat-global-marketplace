#!/usr/bin/env python3
"""Link an existing reviewed local app runtime. No network/install/credential operation."""
from pathlib import Path
lab=Path(__file__).resolve().parent
runtime=(lab.parents[1]/'apps/marketplace/node_modules').resolve()
if not (runtime/'vite/package.json').is_file() or not (runtime/'tsx/package.json').is_file():
 raise SystemExit('Existing app Vite/tsx dependencies unavailable; use owner-reviewed installation. No automatic install.')
link=lab/'node_modules'
if link.exists() or link.is_symlink():
 if link.resolve()!=runtime:raise SystemExit('Different runtime already present; leave it unchanged for review')
else:link.symlink_to(runtime,target_is_directory=True)
print('Existing local runtime linked; no dependency files changed')
