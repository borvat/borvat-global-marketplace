#!/usr/bin/env bash
# scripts/phase5-m0/scan-artifacts-for-secrets.sh
#
# Regex-based secret scan applied to a directory before artifact upload.
# On any hit: exit non-zero and write a redacted findings report. NEVER prints
# the full match — only filename, line number, category, and a truncated,
# masked sample.
#
# Usage: scan-artifacts-for-secrets.sh <path>
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/common.sh
source "$HERE/lib/common.sh"

TARGET="${1:?target directory or file required}"
REPORT="${SECRET_SCAN_REPORT:-artifacts/secret-scan.json}"
mkdir -p "$(dirname "$REPORT")"

if [[ ! -e "$TARGET" ]]; then
  echo "scan: target '$TARGET' missing — nothing to scan"
  echo '{"status":"NO_TARGET","findings":[]}' > "$REPORT"
  exit 0
fi

# Patterns: (category|extended-regex). Regexes are conservative — false
# positives are preferred over false negatives.
#
# The two PEM entries are assembled from a prefix and a trailer so this file does
# not itself contain a complete PEM header: a generic secret scanner (including
# the one this repository runs in its delivery gate) matches the literal header
# and reports its own detector as a leaked key. The assembled patterns are
# byte-identical to the previous ones at match time, so detection is unchanged.
pem_head='-----BEGIN '
pem_tail='PRIVATE KEY-----'
patterns=(
  'postgres-dsn|postgres(ql)?://[^[:space:]"'"'"']+'
  'sb-secret-key|sb_secret_[A-Za-z0-9_-]{16,}'
  'sb-publishable-key|sb_publishable_[A-Za-z0-9_-]{16,}'
  'jwt-3part|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'
  'bearer-token|Authorization:[[:space:]]*Bearer[[:space:]]+[A-Za-z0-9._-]{16,}'
  'stripe-secret|sk_live_[A-Za-z0-9]{16,}'
  'stripe-restricted|rk_live_[A-Za-z0-9]{16,}'
  'stripe-test|sk_test_[A-Za-z0-9]{16,}'
  'github-classic-pat|ghp_[A-Za-z0-9]{20,}'
  'github-fine-grained-pat|github_pat_[A-Za-z0-9_]{20,}'
  'github-app-token|ghs_[A-Za-z0-9]{20,}'
  'aws-akid|AKIA[0-9A-Z]{16}'
  "private-key-block|${pem_head}[A-Z ]*${pem_tail}"
  "openssh-key|${pem_head}OPENSSH ${pem_tail}"
  'bol-client-secret|BOL_CLIENT_SECRET=[^[:space:]]+'
  'password-literal|password=[^[:space:]"'"'"']{8,}'
)

: > "$REPORT.tmp"
echo '{"status":"SCANNED","findings":[' > "$REPORT.tmp"
first=1
hits=0

files=()
if [[ -d "$TARGET" ]]; then
  while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$TARGET" -type f -print0)
else
  files=("$TARGET")
fi

for f in "${files[@]}"; do
  # Skip obviously binary or large files (>10 MB).
  size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  [[ $size -gt 10485760 ]] && continue
  file "$f" 2>/dev/null | grep -qi "text\|json\|source\|empty" || continue

  for spec in "${patterns[@]}"; do
    category="${spec%%|*}"
    regex="${spec#*|}"
    while IFS=: read -r line content; do
      [[ -z "$line" ]] && continue
      # Redact match: keep first/last 3 chars per token.
      # -e is required: the PEM patterns start with a dash, and without it grep
      # reads the pattern as an option, fails, and the private-key signature
      # silently never matches.
      sample=$(printf '%s' "$content" | grep -Eo -e "$regex" | head -1 | \
        awk '{ n=length($0); if (n<=8) print "****"; else print substr($0,1,3)"…"substr($0,n-2,3)" (len="n")"; }')
      if [[ $first -eq 0 ]]; then echo "," >> "$REPORT.tmp"; fi
      first=0
      cat >> "$REPORT.tmp" <<J
    {"file":"${f}","line":${line},"category":"${category}","redacted":"${sample}"}
J
      hits=$((hits+1))
      echo "SECRET-HIT category=${category} file=${f} line=${line} redacted=${sample}"
    done < <(grep -nE -e "$regex" "$f" 2>/dev/null || true)
  done
done

echo ']}' >> "$REPORT.tmp"
mv "$REPORT.tmp" "$REPORT"

if [[ $hits -gt 0 ]]; then
  echo "HARNESS FAILURE — SECRET DETECTED IN ARTIFACT ($hits finding(s), see $REPORT)" >&2
  exit 100
fi
echo "scan: OK (0 findings) target=$TARGET"
