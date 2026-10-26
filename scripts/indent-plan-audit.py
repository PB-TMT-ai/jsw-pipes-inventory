# ── Independent audit of an indent-plan.py output ──
#
# Re-derives every figure from the raw inputs WITHOUT sharing code with indent-plan.py, and fails on
# any mismatch: Sheet1 stock columns per row (region flow), and on the Truck Plan every line's Indent,
# Dispatch (to that distributor from ANY plant) and Qty Left; that no load exceeds qty left or the
# plant's stock; that every truck loads from the distributor's own region; that no truck tops the truck capacity (6th argument, default 25 MT).
# Written after VVN's 150x150 (invoiced from Tapi) read as 0 dispatched — Oct 2026.
#
# Usage: python3 scripts/indent-plan-audit.py INDENT.xlsx flow.txt disp.txt OUT.xlsx scripts/indent-plan-distributors.json
import sys, json, re, collections, openpyxl
indent_f, flow_f, disp_f, out_f, cfg_f = sys.argv[1:6]
cfg = json.load(open(cfg_f)); dmap = {k.upper(): v for k, v in cfg['distributors'].items()}
RP = cfg['regionPlants']
def key(sec, size, thk):
    s = re.sub(r'\s', '', str(size)).upper().replace('*', 'X')
    s = cfg['sizeFixes'].get(s, s)
    t = float(thk); t = 1.6 if t == 1.5 else t; t = 3.0 if abs(t - 3.2) < 1e-9 else round(t, 2)
    if 'NB' in s or sec == 'CHS': return ('CHS', s.replace('NB', ''), t)
    h, b = s.split('X'); return ('SHS' if float(h) == float(b) else 'RHS', f'{h}x{b}', t)
# indent
ws = openpyxl.load_workbook(indent_f).active
ind = collections.Counter(); rows = []
for r in range(4, ws.max_row + 1):
    v = [ws.cell(r, c).value for c in range(3, 9)]
    if v[2] is None or v[0] is None: continue
    d = str(v[0]).strip().upper(); k = key(v[2], v[3], v[4]); ind[(d, k)] += v[5] or 0; rows.append((r, d, k))
# dispatch to customer, all plants
disp = collections.Counter()
for rec in open(disp_f).read().strip().split(';'):
    pt, sz, th, pl, cu, mt = rec.split('|'); disp[(cu, (pt, sz, 3.0 if float(th) == 3.2 else round(float(th), 2)))] += float(mt)
# plant flow
flow = collections.defaultdict(lambda: [0.0] * 4)
for rec in open(flow_f).read().strip().split(';'):
    pt, sz, th, pl, *n = rec.split('|'); k = (pt, sz, 3.0 if float(th) == 3.2 else round(float(th), 2))
    for i in range(4): flow[(pl, k)][i] += float(n[i])
out = openpyxl.load_workbook(out_f, data_only=True)
errs = []
# 1. Sheet1 stock columns = region flow
s1 = out['Sheet1']
for r, d, k in rows:
    reg = dmap[d]['region']; F = [flow[(p, k)] for p in RP[reg]]
    want = (sum(max(0.0, x[0] - x[1]) for x in F), sum(x[2] for x in F), sum(x[3] for x in F),
            sum(max(0.0, x[0] - x[1] + x[2] - x[3]) for x in F))           # each plant floored at 0 (rule R6)
    got = tuple(s1.cell(r, c).value for c in range(9, 13))
    if any(abs((g or 0) - w) > 0.02 for g, w in zip(got, want)): errs.append(f'Sheet1 row {r}: want {want} got {got}')
    if s1.cell(r, 13).value != reg: errs.append(f'Sheet1 row {r} region')
# 2. Truck Plan detail rows
tp = out['Truck Plan']; tr = [list(r) for r in tp.iter_rows(values_only=True)]
hdr = next(i for i, r in enumerate(tr) if r[0] == 'Truck' and i > 3)
name2d = {}; 
for d in dmap: name2d[d] = d
loads = collections.Counter(); plant_load = collections.Counter(); lines = 0
for r in tr[hdr + 1:]:
    if not (r[0] and str(r[0]).startswith('T')): break
    lines += 1
    d = str(r[1]).strip().upper(); size = str(r[4]).replace(' NB', '')
    k = (r[3], size, 3.0 if float(r[5]) == 3.2 else round(float(r[5]), 2))
    cu = dmap[d]['customer']; reg = dmap[d]['region']
    wi, wd = ind[(d, k)], disp[(cu, k)]
    if abs(r[6] - wi) > 0.01: errs.append(f'Truck {r[0]} {d} {k}: indent {r[6]} want {wi}')
    if abs(r[7] - wd) > 0.011: errs.append(f'Truck {r[0]} {d} {k}: dispatch {r[7]} want {round(wd,2)}')
    if abs(r[8] - (wi - wd)) > 0.011: errs.append(f'Truck {r[0]} {d} {k}: qty left {r[8]}')
    pl = {v.lower(): v for v in ['Hyderabad', 'Lepakshi', 'NPMD', 'Tapi']}
    pid = r[2].lower()
    if pid not in RP[reg]: errs.append(f'Truck {r[0]} {d}: plant {r[2]} outside {reg}')
    loads[(d, k)] += r[9]; plant_load[(pid, k)] += r[9]
for (d, k), l in loads.items():
    if l > max(0, ind[(d, k)] - disp[(dmap[d]['customer'], k)]) + 0.02: errs.append(f'load {l} > qty left for {d} {k}')
for (p, k), l in plant_load.items():
    f = flow[(p, k)]; st = f[0] - f[1] + f[2] - f[3]
    if l > st + 0.02: errs.append(f'load {l} > stock {st:.2f} at {p} {k}')
# 3. truck totals
tot = collections.Counter()
for r in tr[hdr + 1:hdr + 1 + lines]: tot[r[0].split()[0]] += r[9]
CAP = float(sys.argv[6]) if len(sys.argv) > 6 else 25.0          # same default as indent-plan.py --truck-mt
over = {t: round(v, 2) for t, v in tot.items() if v > CAP + 0.05}
if over: errs.append(f'trucks over {CAP:g} MT: {over}')
# 4. per-distributor dispatch totals (all plants) vs bundle
for d, v in dmap.items():
    print(f"  {d:24s} {v['region']:5s} indent {sum(q for (dd, k), q in ind.items() if dd == d):7.1f}  Oct dispatch (all plants) {sum(m for (c, k), m in disp.items() if c == v['customer']):7.2f}")
print('VVN 150x150 lines in truck plan:', [(r[0], r[4], r[5], r[6], r[7], r[8], r[9]) for r in tr[hdr+1:hdr+1+lines] if 'V V N' in str(r[1]) and '150x150' in str(r[4])])
print('VVN 150x150 independent: ', {k: (ind[('V V N STEELS P LTD', k)], round(disp[('V V N STEELS P LTD', k)], 2)) for k in [('SHS', '150x150', 4.0), ('SHS', '150x150', 5.0), ('SHS', '150x150', 3.0), ('SHS', '150x150', 6.0)]})
print(f'checked: {len(rows)} Sheet1 rows, {lines} truck lines, {len(tot)} trucks')
print('\n'.join(errs) if errs else 'AUDIT OK — every checked figure matches the independent recomputation')
sys.exit(1 if errs else 0)
