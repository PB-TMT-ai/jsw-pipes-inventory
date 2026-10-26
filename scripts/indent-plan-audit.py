# ── Independent audit of an indent-plan.py output ──
#
# Re-derives every figure from the raw inputs WITHOUT sharing code with indent-plan.py, and fails on
# any mismatch: Sheet1 stock columns per row (region flow), and on the Truck Plan every line's Indent,
# Dispatch (to that distributor from ANY plant) and Qty Left; that no load exceeds qty left or the
# plant's stock; that every truck loads from the distributor's own region; that no truck tops the truck capacity (6th argument, default 25 MT).
# Written after VVN's 150x150 (invoiced from Tapi) read as 0 dispatched — Oct 2026.
#
# Usage: python3 scripts/indent-plan-audit.py INDENT.xlsx flow.txt disp.txt OUT.xlsx scripts/indent-plan-distributors.json [TRUCK_MT]
#        [--ageing ageing.txt --combined COMBINED.xlsx [--split SPLIT.xlsx]]     (R17: the combined workbook as well)
import sys, json, re, collections, openpyxl
indent_f, flow_f, disp_f, out_f, cfg_f = sys.argv[1:6]
NM = lambda x: re.sub(r'\s+', ' ', str(x)).strip().upper()
cfg = json.load(open(cfg_f)); dmap = {NM(k): v for k, v in cfg['distributors'].items()}
RP = cfg['regionPlants']
def key(sec, size, thk):
    s = re.sub(r'\s', '', str(size)).upper().replace('*', 'X')
    s = cfg['sizeFixes'].get(s, s)
    t = float(thk); t = 1.6 if t == 1.5 else t; t = 3.0 if abs(t - 3.2) < 1e-9 else round(t, 2)
    if 'NB' in s or (sec == 'CHS' and 'X' not in s): return ('CHS', s.replace('NB', ''), t)
    h, b = s.split('X'); return ('SHS' if float(h) == float(b) else 'RHS', f'{h}x{b}', t)
# indent — columns by header (both layouts), read from the OUTPUT's Sheet1 because added rows move the
# originals down; a thickness with no distributor belongs to the distributor above (R15)
def table(ws):
    H = {NM(ws.cell(3, c).value): c for c in range(1, ws.max_column + 1) if isinstance(ws.cell(3, c).value, str)}
    C = {n: next((c for h, c in H.items() if f(h)), None) for n, f in (
        ('d', lambda h: h == 'DISTRIBUTOR'), ('s', lambda h: h == 'SECTION'), ('z', lambda h: h == 'SIZE'),
        ('t', lambda h: h == 'THICKNESS'), ('q', lambda h: 'QTY IN MT' in h), ('b', lambda h: h.startswith('BILLED')),
        ('o', lambda h: h == 'OPENING INVENTORY (MT)'), ('g', lambda h: h == 'REGION'))}
    out_, prev = [], None
    for r in range(4, ws.max_row + 1):
        g = lambda n: ws.cell(r, C[n]).value if C[n] else None
        if g('t') is None or (isinstance(g('q'), str) and 'SUBTOTAL' in g('q').upper()): continue
        d, s_, z = g('d'), g('s'), g('z')
        if d is None:
            if prev is None: continue
            d, s_, z = prev[0], s_ or prev[1], z or prev[2]
        else: prev = (d, s_, z)
        if s_ is None: continue
        out_.append((r, NM(d), key(s_, z, g('t')), g('q') if isinstance(g('q'), (int, float)) else 0, g('b')))
    return C, out_
iw = openpyxl.load_workbook(indent_f)['Sheet1']; _, in_rows = table(iw)
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
s1 = out['Sheet1']; C, rows = table(s1)
ind = collections.Counter()
for r, d, k, q, b in rows: ind[(d, k)] += q
# the user's rows are all still there, in order, with the same indent; anything extra is an added row (Indent 0)
it = iter(rows); kept = 0
for r0, d0, k0, q0, _ in in_rows:
    for r, d, k, q, b in it:
        if (d, k, q) == (d0, k0, q0): kept += 1; break
        if q: errs.append(f'Sheet1 row {r}: {d} {k} indent {q} is not in the input'); break
if kept != len(in_rows): errs.append(f'Sheet1: only {kept} of {len(in_rows)} input rows found in order')
if abs(sum(ind.values()) - sum(q for *_, q, _ in in_rows)) > 0.001: errs.append('Sheet1: total indent changed')
if C['b']:                                         # R14: Billed = this month's invoices to that distributor, any plant
    billed = collections.Counter()
    for r, d, k, q, b in rows: billed[(d, k)] += float(b or 0)
    for (d, k), v in billed.items():
        if abs(v - disp[(dmap[d]['customer'], k)]) > 0.011: errs.append(f'Billed {d} {k}: {v:.2f} want {disp[(dmap[d]["customer"], k)]:.2f}')
    tb = sum(billed.values()); td = sum(v for (cu, k), v in disp.items() if any(dmap[d]['customer'] == cu for d, _ in billed))
    if abs(tb - td) > 0.005: errs.append(f'Billed total {tb:.3f} want {td:.3f} (cells rounded? store them exact)')
    for (cu, k), v in disp.items():
        ds_ = [d for d in dmap if dmap[d]['customer'] == cu and any(dd == d for dd, _ in billed)]
        if ds_ and v > 0.005 and (ds_[0], k) not in billed: errs.append(f'Billed: {ds_[0]} {k} invoiced {v:.2f} but has no row')
OC = C['o']; RC = C['g']
for r, d, k, q, b in rows:
    reg = dmap[d]['region']; F = [flow[(p, k)] for p in RP[reg]]
    want = (sum(max(0.0, x[0] - x[1]) for x in F), sum(x[2] for x in F), sum(x[3] for x in F),
            sum(max(0.0, x[0] - x[1] + x[2] - x[3]) for x in F))           # each plant floored at 0 (rule R6)
    got = tuple(s1.cell(r, c).value for c in range(OC, OC + 4))
    if any(abs((g or 0) - w) > 0.02 for g, w in zip(got, want)): errs.append(f'Sheet1 row {r}: want {want} got {got}')
    if s1.cell(r, RC).value is not None and NM(s1.cell(r, RC).value) != NM(reg): errs.append(f'Sheet1 row {r} region')
# 2. Truck Plan detail rows
tp = out['Truck Plan']; tr = [list(r) for r in tp.iter_rows(values_only=True)]
hdr = next(i for i, r in enumerate(tr) if r[0] == 'Truck' and i > 3)
name2d = {}; 
for d in dmap: name2d[d] = d
loads = collections.Counter(); plant_load = collections.Counter(); lines = 0
for r in tr[hdr + 1:]:
    if not (r[0] and str(r[0]).startswith('T')): break
    lines += 1
    d = NM(r[1]); size = str(r[4]).replace(' NB', '')
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
CAP = float(sys.argv[6]) if len(sys.argv) > 6 and not sys.argv[6].startswith('--') else 25.0          # same default as indent-plan.py --truck-mt
over = {t: round(v, 2) for t, v in tot.items() if v > CAP + 0.05}
if over: errs.append(f'trucks over {CAP:g} MT: {over}')
# 4. per-distributor dispatch totals (all plants) vs bundle
for d, v in dmap.items():
    print(f"  {d:24s} {v['region']:5s} indent {sum(q for (dd, k), q in ind.items() if dd == d):7.1f}  Oct dispatch (all plants) {sum(m for (c, k), m in disp.items() if c == v['customer']):7.2f}")
print('VVN 150x150 lines in truck plan:', [(r[0], r[4], r[5], r[6], r[7], r[8], r[9]) for r in tr[hdr+1:hdr+1+lines] if 'V V N' in str(r[1]) and '150x150' in str(r[4])])
print('VVN 150x150 independent: ', {k: (ind[('V V N STEELS P LTD', k)], round(disp[('V V N STEELS P LTD', k)], 2)) for k in [('SHS', '150x150', 4.0), ('SHS', '150x150', 5.0), ('SHS', '150x150', 3.0), ('SHS', '150x150', 6.0)]})
# 5. R17 — the combined workbook (--ageing + --combined): Truck Load = Truck Plan, No Stock = the split's No Stock,
#    SKU Inventory per plant (> 2 MT, biggest first, buckets, Other line, plant total), Ageing per plant + total.
opt = {a: sys.argv[i + 1] for i, a in enumerate(sys.argv) if a in ('--ageing', '--combined', '--split') and i + 1 < len(sys.argv)}
if '--combined' in opt:
    cb = openpyxl.load_workbook(opt['--combined'], data_only=True)
    if cb.sheetnames != ['Truck Load', 'No Stock', 'SKU Inventory', 'Ageing']: errs.append(f'combined tabs {cb.sheetnames}')
    rowsof = lambda ws: [[c for c in r] for r in ws.iter_rows(values_only=True)]
    tl = rowsof(cb['Truck Load'])
    if tl != [list(r) for r in tp.iter_rows(values_only=True)]: errs.append('Truck Load differs from the Truck Plan tab of the indent output')
    if '--split' in opt:
        sp_ = openpyxl.load_workbook(opt['--split'], data_only=True)
        if rowsof(cb['No Stock']) != rowsof(sp_['No Stock']): errs.append('No Stock differs from the split workbook')
    # ageing bundle, read here again (not shared with the builder)
    ag = []
    for rec in open(opt['--ageing']).read().strip().split(';'):
        pt, sz, th, pl, on, b1, b2, b3, b4, old, wa = rec.split('|')
        ag.append((pl, (pt, sz, float(th)), float(on), [float(b1), float(b2), float(b3), float(b4)], int(old), float(wa)))
    # the ageing on-hand is the plant stock the rest of the workbook uses (floored at 0, 3 = 3.2)
    st = collections.Counter()
    for pl, (pt, sz, th), on, *_ in ag: st[(pl, (pt, sz, 3.0 if abs(th - 3.2) < 1e-9 else th))] += on
    for pk in set(st) | set(flow):
        f = flow.get(pk, [0.0] * 4); want = max(0.0, f[0] - f[1] + f[2] - f[3])
        if abs(st.get(pk, 0) - want) > 0.002: errs.append(f'ageing on-hand {pk}: {st.get(pk, 0):.3f} want {want:.3f}')
    si = rowsof(cb['SKU Inventory'])
    def close(a, b): return (a is None and b is None) or (a is not None and b is not None and abs(a - b) < 1e-5)
    def wavg(rs): t = sum(r[2] for r in rs); return sum(r[2] * r[5] for r in rs) / t if t else None
    plant_rows = {}
    for pl in ('hyderabad', 'lepakshi', 'npmd', 'tapi'):
        name = {v.lower(): v for v in ['Hyderabad', 'Lepakshi', 'NPMD', 'Tapi']}[pl]
        i0 = next((i for i, r in enumerate(si) if r[0] == name), None)
        if i0 is None: errs.append(f'SKU Inventory: no block for {name}'); continue
        i1 = next(i for i, r in enumerate(si) if i > i0 and str(r[0]).endswith('total on-hand'))
        blk = si[i0:i1 + 1]; mine = [r for r in ag if r[0] == pl]
        big = sorted([r for r in mine if r[2] > 2.0], key=lambda r: (-r[2], {'CHS': 0, 'SHS': 1, 'RHS': 2}[r[1][0]], [float(v) for v in r[1][1].split('x')], r[1][2]))
        small = [r for r in mine if r[2] <= 2.0]
        listed = [r for r in blk if r[0] and ' x ' in str(r[0])]
        if len(listed) != len(big): errs.append(f'SKU Inventory {name}: {len(listed)} SKUs listed, want {len(big)} over 2 MT')
        for row, r in zip(listed, big):
            lab = (r[1][1] + (' NB' if r[1][0] == 'CHS' else '')) + f' x {r[1][2]:g}'
            if row[0] != lab or not all(close(a, b) for a, b in zip(row[1:8], [r[2], *r[3], r[4], r[5]])): errs.append(f'SKU Inventory {name} {lab}: {row[:8]} want {[r[2], *r[3], r[4], r[5]]}')
        for lab, rs in ((f'Subtotal (> 2 MT)', big), (f'Other SKUs (≤ 2 MT)', small), (f'{name} total on-hand', mine)):
            row = next((x for x in blk if x[0] == lab), None)
            want = [sum(r[2] for r in rs), *[sum(r[3][i] for r in rs) for i in range(4)], max((r[4] for r in rs), default=None), wavg(rs)]
            if row is None or not all(close(a, b) for a, b in zip(row[1:8], want)): errs.append(f'SKU Inventory {name} "{lab}": {row and row[1:8]} want {want}')
        plant_rows[name] = (sum(r[2] for r in mine), [sum(r[3][i] for r in mine) for i in range(4)], max((r[4] for r in mine), default=None), wavg(mine))
    at = {r[0]: r for r in rowsof(cb['Ageing']) if r[0]}
    for name, (on, b, old, wa) in plant_rows.items():
        r = at.get(name)
        want = [on, *b, *[(x / on) if on else None for x in b], old, wa]
        if r is None or not all(close(a, c) for a, c in zip(r[1:12], want)): errs.append(f'Ageing {name}: {r and r[1:12]} want {want}')
    tot = at.get('Total'); allb = [sum(v[1][i] for v in plant_rows.values()) for i in range(4)]
    if tot is None or not close(tot[1], sum(v[0] for v in plant_rows.values())) or not all(close(a, b) for a, b in zip(tot[2:6], allb)) or not close(tot[11], wavg(ag)):
        errs.append(f'Ageing Total: {tot and tot[1:12]}')
    print(f'R17: {len(ag)} ageing rows, {sum(r[2] for r in ag):.3f} MT on hand; combined tabs checked')
print(f'checked: {len(rows)} Sheet1 rows, {lines} truck lines, {len(tot)} trucks')
print('\n'.join(errs) if errs else 'AUDIT OK — every checked figure matches the independent recomputation')
sys.exit(1 if errs else 0)
