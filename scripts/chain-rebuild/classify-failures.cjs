// Classifies every migration failure from an apply.cjs result file, deterministically.
// Output: JSON manifest with, per failure, the assertion that raised (file + line),
// a category, and the DDL the file would have contributed. Same inputs -> same output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RESULT = process.argv[2] || 'chain-apply-result.json';
const DIR = process.argv[3] || 'apps/marketplace/supabase/migrations';
const OUT = process.argv[4] || 'chain-failure-manifest.json';

const classify = (msg) => {
  if (/schema ".*" does not exist|relation ".*" does not exist/.test(msg)) return 'cascade-missing-object';
  if (/expected \d+|ABORT|FAILED_TESTS|VERIFICATION FAILED|purge-set|keep-set/i.test(msg)) return 'production-snapshot-assertion';
  if (/not found in auth\.users|no user available|need two companies|insufficient fixture|two companies required|owner_user_id/i.test(msg)) return 'fixture-dependent';
  return 'other';
};

const ddlOf = (sql) => {
  const out = [];
  for (const m of sql.matchAll(/CREATE\s+(TABLE|SCHEMA|FUNCTION|INDEX|TYPE|VIEW|POLICY)\s+(?:IF NOT EXISTS\s+)?([\w."]+)/gi)) {
    out.push(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return [...new Set(out)];
};

const result = JSON.parse(fs.readFileSync(RESULT, 'utf8'));
const manifest = {
  source: path.basename(RESULT),
  total: result.total,
  ok: result.ok,
  failed: result.failed,
  skipped: result.skipped || 0,
  failures: [],
};

for (const f of result.failures) {
  const full = path.join(DIR, f.file);
  const sql = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const lines = sql.split(/\r?\n/);
  // the assertion that raised: first RAISE EXCEPTION line in the file
  let assertion = null;
  for (let i = 0; i < lines.length; i++) {
    if (/RAISE\s+EXCEPTION/i.test(lines[i])) {
      assertion = { line: i + 1, text: lines[i].trim().slice(0, 160) };
      break;
    }
  }
  const category = classify(f.message);
  manifest.failures.push({
    file: f.file,
    code: f.code,
    category,
    message: f.message,
    assertionAt: assertion ? `${f.file.split('_')[0]}:${assertion.line}` : null,
    assertionText: assertion ? assertion.text : null,
    ddlThatRolledBack: ddlOf(sql),
  });
}

const counts = {};
for (const f of manifest.failures) counts[f.category] = (counts[f.category] || 0) + 1;
manifest.countsByCategory = counts;
manifest.ddlLostObjectCount = manifest.failures.reduce((n, f) => n + f.ddlThatRolledBack.length, 0);
manifest.fingerprint = crypto.createHash('sha256')
  .update(JSON.stringify(manifest.failures.map((f) => [f.file, f.code, f.category])))
  .digest('hex')
  .slice(0, 16);

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`failures: ${manifest.failures.length}`);
console.log('by category:', JSON.stringify(counts));
console.log('objects lost to rollback:', manifest.ddlLostObjectCount);
console.log('fingerprint:', manifest.fingerprint);
for (const f of manifest.failures) {
  console.log(`  [${f.category}] ${f.file.split('_')[0]} ${f.code} @${f.assertionAt || '?'} :: ${(f.message || '').slice(0, 90)}`);
}
