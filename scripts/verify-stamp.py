# ── Verification stamp for a data output ──
#
# Written ONLY by the independent data-verifier agent (.claude/agents/data-verifier.md) after it has
# recomputed the file from the database, or with --verdict USER_OVERRIDE when the user has waived the
# check for this exact file in their own words. The stamp pins the file's SHA-256, so changing a single
# cell afterwards invalidates it. .claude/hooks/require-verified-output.py refuses to send an .xlsx/.csv
# to the user without a matching PASS (or USER_OVERRIDE) stamp.
#
# Usage:
#   python3 scripts/verify-stamp.py FILE --verdict PASS|FAIL|USER_OVERRIDE --by data-verifier --summary "…"
#   python3 scripts/verify-stamp.py FILE --show
import sys, json, hashlib, argparse, datetime

ap = argparse.ArgumentParser()
ap.add_argument('file'); ap.add_argument('--verdict', choices=['PASS', 'FAIL', 'USER_OVERRIDE'])
ap.add_argument('--by', default='data-verifier'); ap.add_argument('--summary', default='')
ap.add_argument('--show', action='store_true')
a = ap.parse_args()
stamp = a.file + '.verified.json'
sha = hashlib.sha256(open(a.file, 'rb').read()).hexdigest()
if a.show:
    try: s = json.load(open(stamp))
    except FileNotFoundError: sys.exit(f'no stamp for {a.file}')
    print(json.dumps(s, indent=1)); print('matches file' if s.get('sha256') == sha else 'DOES NOT MATCH the file (changed after verification)')
    sys.exit(0)
if not a.verdict: sys.exit('--verdict is required')
if a.verdict == 'USER_OVERRIDE' and not a.summary: sys.exit('USER_OVERRIDE needs --summary quoting the user\'s words')
json.dump({'file': a.file, 'sha256': sha, 'verdict': a.verdict, 'by': a.by, 'summary': a.summary,
           'at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}, open(stamp, 'w'), indent=1)
print(f'{a.verdict} stamp written: {stamp}')
