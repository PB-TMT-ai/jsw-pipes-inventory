#!/usr/bin/env python3
# PreToolUse gate on SendUserFile: a data output (.xlsx/.xls/.csv) reaches the user only with a
# verification stamp from the independent data-verifier agent whose SHA-256 matches the file exactly.
# See CLAUDE.md "Non-negotiables" and scripts/verify-stamp.py. Exit 2 blocks the send and tells the
# agent why; anything unexpected in the payload is let through so the gate never breaks other tools.
import sys, json, os, hashlib

DATA_EXT = ('.xlsx', '.xls', '.csv')
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)
files = (payload.get('tool_input') or {}).get('files') or []
cwd = payload.get('cwd') or os.getcwd()
problems = []
for f in files:
    if not isinstance(f, str) or not f.lower().endswith(DATA_EXT):
        continue
    path = f if os.path.isabs(f) else os.path.join(cwd, f)
    stamp = path + '.verified.json'
    try:
        s = json.load(open(stamp))
    except FileNotFoundError:
        problems.append(f'{f}: no verification stamp. Run the data-verifier agent on it first.'); continue
    except Exception as e:
        problems.append(f'{f}: unreadable stamp ({e}).'); continue
    try:
        sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    except FileNotFoundError:
        continue                                      # the send itself will report the missing file
    if s.get('sha256') != sha:
        problems.append(f'{f}: the file changed after it was verified. Verify this exact file again.')
    elif s.get('verdict') not in ('PASS', 'USER_OVERRIDE'):
        problems.append(f'{f}: verifier verdict is {s.get("verdict")!r}, not PASS. Fix the discrepancies and re-verify.')
if problems:
    print('BLOCKED — data outputs must pass independent verification before they are sent (CLAUDE.md):\n- '
          + '\n- '.join(problems), file=sys.stderr)
    sys.exit(2)
sys.exit(0)
