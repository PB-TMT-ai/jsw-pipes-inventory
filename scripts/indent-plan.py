# ── Indent plan: stock columns, size x thickness grids and a 20 MT truck plan for a distributor indent ──
#
# Reads a distributor indent workbook (Sheet1: S.No | Distributor | Material | Section | Size | Thickness
# | Qty in MT, header on row 3) and writes a copy with four extra tabs/columns:
#   Sheet1             + Opening / Production / Dispatch / Closing inventory and Region per row
#   Grid               one row per region + size, a column per distributor, then the four stock columns
#   Size x Thickness   per region: Indent | Dispatch | Qty Left | Inventory, whole MT
#   Truck Plan         20 MT trucks from stock on hand against Qty Left = Indent - Dispatch
#
# Every distributor is served ONLY by its own region's plants (CLAUDE.md non-negotiable, ADR-0006):
# South = Hyderabad + Lepakshi, West = NPMD + Tapi. A West distributor's invoice from a South plant
# is not counted against its indent, and a truck never loads from another region.
#
# Inputs are the two text bundles produced by scripts/indent-plan.sql (run via the Supabase MCP —
# the cloud sandbox cannot reach Supabase directly), and scripts/indent-plan-distributors.json,
# which maps each indent name to its invoice customer name and region. An indent name missing from
# that file stops the run and is named — add it there, never guess.
#
# Usage:
#   python3 scripts/indent-plan.py --indent IN.xlsx --flow flow.txt --disp disp.txt --out OUT.xlsx --asof "19 Oct"
#
# Rules (see blueprints/indent-truck-plan.md): stock = produced - dispatched (weight from the SKU
# master, never density); CRFH is read as Black; 3 mm and 3.2 mm are one size; obvious typos in the
# indent are corrected for the maths only and listed on stdout; loads are whole lines >= 1 MT, one
# plant per truck; short stock is shared pro rata to qty left within a region.

import sys, os, copy, json, math, argparse, openpyxl
from openpyxl.utils import get_column_letter as L
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# Pinned: the approved look (Oct 2026) is Cambria. An unnamed font would fall back to each app's
# own default, so the same file would look different in Excel and LibreOffice.
FONT = 'Cambria'

ap = argparse.ArgumentParser()
ap.add_argument('--indent', required=True); ap.add_argument('--flow', required=True)
ap.add_argument('--disp', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--asof', required=True, help='label for the data date, e.g. "19 Oct"')
ap.add_argument('--config', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'indent-plan-distributors.json'))
args = ap.parse_args()
src, flow_txt, disp_txt, out, ASOF = args.indent, args.flow, args.disp, args.out, args.asof

cfg = json.load(open(args.config))
REGION_PLANTS = cfg['regionPlants']
PNAME = cfg['plantNames']
SIZE_FIXES = {k.upper(): v.upper() for k, v in cfg.get('sizeFixes', {}).items()}
DIST = {k.upper(): (v['customer'], v['region']) for k, v in cfg['distributors'].items()}
T = lambda t: 3.0 if round(float(t), 2) == 3.2 else round(float(t), 2)   # 3 and 3.2 are one size
order = {'CHS': 0, 'SHS': 1, 'RHS': 2}
dims = lambda size: [float(v) for v in size.split('x')]
def sortkey(k):            # k = (sec, size, thk)
    return (order.get(k[0], 9), dims(k[1]), k[2])

fixes = []
def norm(dist, sec, size, thk, row):
    s = str(size).upper().replace(' ', '').replace('*', 'X')
    t = float(thk)
    if s in SIZE_FIXES:                            # typos the user has confirmed, kept in the config
        fixes.append(f'Row {row}: {dist.title()} size {size} read as {SIZE_FIXES[s]}'); s = SIZE_FIXES[s]
    if 'NB' in s or sec == 'CHS':
        sec2, s = 'CHS', s.replace('NB', '')
    else:
        h, b = s.split('X'); s = f'{h}x{b}'
        sec2 = 'SHS' if float(h) == float(b) else 'RHS'
        if float(h) < float(b): fixes.append(f'Row {row}: CHECK {dist.title()} size {size} — short side first, not a known RHS?')
        if sec2 != sec: fixes.append(f'Row {row}: {dist.title()} {sec} {size} read as {sec2}')
    if t == 1.5:
        t = 1.6; fixes.append(f'Row {row}: {dist.title()} {sec} {size} 1.5 mm read as 1.6 mm')
    if '*' in str(size): fixes.append(f'Row {row}: {dist.title()} size {size} read as {s}')
    return (sec2, s, T(t))

# ── data from the app (Supabase), as of ASOF ──
flow = {}                                          # (plant, key) -> [pre-Oct prod, pre-Oct disp, Oct prod, Oct disp]
for rec in open(flow_txt).read().strip().split(';'):
    pt, size, thk, plant, a, b, c, d = rec.split('|')
    k = (plant, (pt, size, T(thk)))
    cur = flow.setdefault(k, [0, 0, 0, 0])
    for i, v in enumerate((a, b, c, d)): cur[i] += float(v)
cdisp = {}                                         # (customer, plant, key) -> Oct MT
for rec in open(disp_txt).read().strip().split(';'):
    pt, size, thk, plant, cust, mt = rec.split('|')
    k = (cust, plant, (pt, size, T(thk))); cdisp[k] = cdisp.get(k, 0) + float(mt)

def plant_open(p, key):                            # raw balance before the month; may be negative
    f = flow.get((p, key), (0, 0, 0, 0)); return f[0] - f[1]
def plant_stock(p, key):                           # raw balance now; may be negative
    f = flow.get((p, key), (0, 0, 0, 0)); return f[0] - f[1] + f[2] - f[3]
def region_flow(reg, key):                         # open, prod, disp, close for one region's plants
    # A plant cannot hold less than nothing (user rule, Oct-26): each plant's opening and closing are
    # floored at 0 BEFORE the region adds them up, so Lepakshi invoicing a size it never recorded making
    # cannot cancel Hyderabad's real stock. Closing therefore need not equal Opening + Production − Dispatch;
    # every plant where the floor bit is listed on the Checks tab.
    ps = REGION_PLANTS[reg]
    o = sum(max(0.0, plant_open(p, key)) for p in ps)
    c = sum(flow.get((p, key), (0, 0, 0, 0))[2] for p in ps)
    d = sum(flow.get((p, key), (0, 0, 0, 0))[3] for p in ps)
    cl = sum(max(0.0, plant_stock(p, key)) for p in ps)
    return round(o, 3), round(c, 3), round(d, 3), round(cl, 3)
def dist_disp(dist, key):                          # Oct dispatch to this distributor from ANY plant
    # What the distributor received reduces its indent wherever it was loaded: VVN's 150x150 came from
    # Tapi (West) in Oct-26 and must not reappear as pending. Region scoping applies to STOCK and trucks.
    cust = DIST[dist][0]
    return sum(mt for (c_, p, k), mt in cdisp.items() if c_ == cust and k == key)

# ── Sheet1: four columns, filled from each row's region ──
wb = openpyxl.load_workbook(src)
ws = wb['Sheet1']; hdr = ws['H3']
NEW = ['Opening Inventory (MT)', 'Production (MT)', 'Dispatch (MT)', 'Closing Inventory (MT)', 'Region']
for i, t in enumerate(NEW):
    c = ws.cell(3, 9 + i, t); c._style = copy.copy(hdr._style)
    ws.column_dimensions[L(9 + i)].width = 14 if i < 4 else 9
indent = {}                                        # (dist, key) -> MT
dists = []
for r in range(4, ws.max_row + 1):
    dname, mat, sec, size, thk, qty = (ws.cell(r, c).value for c in range(3, 9))
    if sec is None or dname is None: continue
    dist = str(dname).strip().upper()
    if dist not in DIST:
        raise SystemExit(f'Row {r}: distributor {dname!r} is not in {args.config} — add its invoice name and region, then rerun')
    if dist not in dists: dists.append(dist)
    reg = DIST[dist][1]
    k = norm(dist, sec, size, thk, r)
    indent[(dist, k)] = indent.get((dist, k), 0) + (qty or 0)
    o, p, d, _ = region_flow(reg, k)
    body = ws.cell(r, 8)
    for c in range(9, 14): ws.cell(r, c)._style = copy.copy(body._style)
    ws.cell(r, 9, o); ws.cell(r, 10, p); ws.cell(r, 11, d); ws.cell(r, 12, region_flow(reg, k)[3]); ws.cell(r, 13, reg)
    for c in range(9, 13): ws.cell(r, c).number_format = '0.00'
label = {d: str(d).title() if d == 'SHIVAM PRIME' else d for d in dists}
regions = ['South', 'West']
rdists = {g: [d for d in dists if DIST[d][1] == g] for g in regions}

thin = Side(style='thin', color='BFBFBF'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
mid = Alignment(horizontal='center', vertical='center')
gray = PatternFill('solid', fgColor='D9D9D9')
def style(cell, bold=False, fill=None, fmt=None, al=None, size=9):
    cell.font = Font(name=FONT, bold=bold, size=size); cell.border = box
    if fill: cell.fill = fill
    if fmt: cell.number_format = fmt
    cell.alignment = al or Alignment(vertical='center')
    return cell

# ── Grid tab: one row per region + size, a column per distributor ──
g = wb.create_sheet('Grid')
cols = ['Region', 'Section', 'Size', 'Thickness'] + [label[d] for d in dists] + ['Total Indent (MT)'] + NEW[:4]
for i, t in enumerate(cols, 1):
    c = g.cell(1, i, t); c._style = copy.copy(hdr._style); c.alignment = Alignment(wrap_text=True, horizontal='center', vertical='center')
    g.column_dimensions[L(i)].width = 12 if i > 4 else 9
g.row_dimensions[1].height = 42
nd = len(dists); tcol = 5 + nd
r = 1
for reg in regions:
    keys = sorted({k for (d, k) in indent if DIST[d][1] == reg}, key=sortkey)
    for k in keys:
        r += 1
        sec, size, thk = k
        g.cell(r, 1, reg); g.cell(r, 2, sec); g.cell(r, 3, size + (' NB' if sec == 'CHS' else '')); g.cell(r, 4, thk)
        for j, d in enumerate(dists):
            if DIST[d][1] == reg and indent.get((d, k)): g.cell(r, 5 + j, indent[(d, k)])
        g.cell(r, tcol, f'=SUM({L(5)}{r}:{L(4 + nd)}{r})')
        o, p, dd_, cl = region_flow(reg, k)
        g.cell(r, tcol + 1, o); g.cell(r, tcol + 2, p); g.cell(r, tcol + 3, dd_); g.cell(r, tcol + 4, cl)
        for c in range(5, tcol + 5): g.cell(r, c).number_format = '0.00'
last = r; r += 1
g.cell(r, 1, 'Total')
for c in range(5, tcol + 5): g.cell(r, c, f'=SUM({L(c)}2:{L(c)}{last})').number_format = '0.00'
for c in range(1, tcol + 5): g.cell(r, c).font = Font(name=FONT, bold=True)
g.freeze_panes = 'E2'

# ── Size x Thickness tab: per region, Indent | Dispatch | Qty Left | Inventory, whole MT ──
R = lambda v: round(v) if v and round(v) != 0 else None
x = wb.create_sheet('Size x Thickness')
NUM = '0;[Red]-0;""'
data = {}
for reg in regions:
    ind = {}; dsp = {}
    for (d, k), q in indent.items():
        if DIST[d][1] != reg: continue
        ind[k] = ind.get(k, 0) + q
    for d in rdists[reg]:
        cust = DIST[d][0]
        for (c_, p, k), mt in cdisp.items():
            if c_ == cust: dsp[k] = dsp.get(k, 0) + mt     # any plant: received is received
    stock_keys = {k for (p, k) in flow if p in REGION_PLANTS[reg]}
    inv = {k: region_flow(reg, k)[3] for k in set(ind) | set(dsp) | stock_keys}   # ALL stock (user rule, Oct-26)
    data[reg] = (ind, dsp, inv)
used = {(reg, k) for reg in regions for k in set(data[reg][0]) | set(data[reg][1]) | set(data[reg][2])
        if R(data[reg][0].get(k)) or R(data[reg][1].get(k)) or R(data[reg][2].get(k))}
thks = sorted({k[2] for _, k in used})
n = len(thks) + 1
blocks = [('INDENT', 'FFC000'), (f'DISPATCH (1–{ASOF})', '9BC2E6'), ('QTY LEFT', 'A9D08E'), (f'INVENTORY ({ASOF})', 'F4B084')]
starts = [3 + b * (n + 1) for b in range(len(blocks))]
for s in starts:
    for c in range(s, s + n): x.column_dimensions[L(c)].width = 5.5 if c - s < len(thks) else 6.5
    x.column_dimensions[L(s + n)].width = 1.5
x.column_dimensions['A'].width = 7; x.column_dimensions['B'].width = 9
band = PatternFill('solid', fgColor='F2F2F2')
r = 1
for reg in regions:
    ind, dsp, inv = data[reg]
    plants = ' + '.join(PNAME[p] for p in REGION_PLANTS[reg])
    x.cell(r, 1, f'{reg.upper()} — {", ".join(label[d] for d in rdists[reg])}  ·  plants: {plants}').font = Font(name=FONT, bold=True, size=11)
    r += 1
    for (title, color), s in zip(blocks, starts):
        x.merge_cells(start_row=r, start_column=s, end_row=r, end_column=s + n - 1)
        style(x.cell(r, s, title), True, al=mid, size=10)
        for c in range(s, s + n):
            x.cell(r, c).fill = PatternFill('solid', fgColor=color); x.cell(r, c).border = box
            style(x.cell(r + 1, c, f'{thks[c - s]:g}' if c - s < len(thks) else 'Total'), True, PatternFill('solid', fgColor=color), al=mid)
    for c, h in ((1, 'Section'), (2, 'Size')):
        x.merge_cells(start_row=r, start_column=c, end_row=r + 1, end_column=c)
        style(x.cell(r, c, h), True, gray, al=mid); x.cell(r + 1, c).border = box
    r += 2
    rows = sorted({k[:2] for (g_, k) in used if g_ == reg}, key=lambda rk: (order.get(rk[0], 9), dims(rk[1])))
    first = r
    for sec, size in rows:
        x.cell(r, 1, sec); x.cell(r, 2, size + (' NB' if sec == 'CHS' else ''))
        for j, t in enumerate(thks):
            a, b = L(starts[0] + j), L(starts[1] + j)
            vals = [R(ind.get((sec, size, t))), R(dsp.get((sec, size, t))),
                    f'=IF(AND({a}{r}="",{b}{r}=""),"",N({a}{r})-N({b}{r}))', R(inv.get((sec, size, t)))]
            for s, v in zip(starts, vals):
                if v is not None: x.cell(r, s + j, v)
        for s in starts: x.cell(r, s + n - 1, f'=SUM({L(s)}{r}:{L(s + n - 2)}{r})')
        shade = band if order.get(sec) == 1 else None
        for c in [1, 2] + [s + k for s in starts for k in range(n)]:
            style(x.cell(r, c), x.cell(r, c).column in [s + n - 1 for s in starts], shade, NUM, mid if c > 2 else None)
        x.row_dimensions[r].height = 14
        r += 1
    x.cell(r, 2, f'{reg} total')
    for s in starts:
        for c in range(s, s + n): x.cell(r, c, f'=SUM({L(c)}{first}:{L(c)}{r - 1})')
    for c in [1, 2] + [s + k for s in starts for k in range(n)]: style(x.cell(r, c), True, gray, NUM, mid)
    r += 3
x.cell(r - 1, 1, 'All figures in MT, whole numbers; blank = 0, red = negative. CRFH counted as Black; 3 mm includes 3.2 mm.').font = Font(name=FONT, italic=True, size=9)
x.cell(r, 1, f"Dispatch = Oct invoices to that region's distributors, from any plant. Qty Left = Indent − Dispatch. Inventory = ALL closing stock of that region's plants on {ASOF}, each plant floored at 0.").font = Font(name=FONT, italic=True, size=9)
x.freeze_panes = 'C1'; x.sheet_view.zoomScale = 90

# ── Truck Plan: 20 MT trucks from stock on hand, each distributor served only by its region's plants ──
TRUCK, MINLINE = 20.0, 1.0
need = {k: max(0.0, q - dist_disp(k[0], k[1])) for k, q in indent.items()}
left = dict(need); alloc = {}                      # (dist, plant, key) -> MT
for reg in regions:
    for key in sorted({k for (d, k) in need if DIST[d][1] == reg}, key=sortkey):
        for p in sorted(REGION_PLANTS[reg], key=lambda p: -plant_stock(p, key)):   # fuller plant first
            avail = max(0.0, plant_stock(p, key))
            want = {d: left[(d, key)] for d in rdists[reg] if left.get((d, key), 0) > 0}
            tot = sum(want.values())
            if not tot or not avail: continue
            f = min(1.0, avail / tot)              # short of stock -> share pro rata to qty left
            fl2 = lambda v: math.floor(v * 100 + 1e-6) / 100     # floor to 0.01 MT; epsilon: 1.61*100 = 160.999…
            shares = {d: fl2(w * f) for d, w in want.items()}
            if f < 1 and any(v < MINLINE for v in shares.values()):
                # A pro-rata share under 1 MT would strand the lot (user rule, Oct-26): fill the largest
                # qty left first instead, so the stock still goes on a truck.
                shares, rest = {}, avail
                for d, w in sorted(want.items(), key=lambda dw: -dw[1]):
                    give = fl2(min(w, rest))
                    if give >= MINLINE: shares[d] = give; rest -= give
            for d, give in shares.items():
                if give >= MINLINE:
                    alloc[(d, p, key)] = alloc.get((d, p, key), 0) + give; left[(d, key)] -= give
plan = []
for reg in regions:
    for dist in rdists[reg]:
        for p in REGION_PLANTS[reg]:
            lines = sorted([(k, v) for (d, pp, k), v in alloc.items() if d == dist and pp == p], key=lambda kv: sortkey(kv[0]))
            truck, load = 1, 0.0
            for k, v in lines:
                while v > 0.05:
                    take = min(v, TRUCK - load)
                    if 0 < v - take < MINLINE: take = v - MINLINE    # never leave a sliver behind
                    if take < MINLINE:                                # room too small: close this truck
                        truck += 1; load = 0.0; continue
                    plan.append([dist, p, truck, k, round(take, 2)])
                    load += take; v -= take
                    if load >= TRUCK - 0.05: truck += 1; load = 0.0
trucks = {}; ids = {}
for row in plan:
    tid = ids.setdefault((row[0], row[1], row[2]), len(ids) + 1)
    trucks.setdefault(tid, []).append(row)

tp = wb.create_sheet('Truck Plan')
hfill = PatternFill('solid', fgColor='FFC000'); dfill = PatternFill('solid', fgColor='DDEBF7'); pfill = PatternFill('solid', fgColor='FCE4D6')
put = lambda r, c, v, bold=False, fill=None, fmt=None, al=None: style(tp.cell(r, c, v), bold, fill, fmt, al)
tp.cell(1, 1, f'TRUCK PLAN — 20 MT trucks from stock on hand ({ASOF}), against Qty Left = Indent − Dispatch').font = Font(name=FONT, bold=True, size=11)
r = 3
for i, h in enumerate(['Truck', 'Distributor', 'Region', 'Plant', 'Sizes', 'Load (MT)', 'Status'], 1): put(r, i, h, True, hfill, al=mid)
first = r + 1
for tid, rows_ in trucks.items():
    r += 1; tot = sum(x_[4] for x_ in rows_); full = tot >= TRUCK - MINLINE
    d0 = rows_[0][0]
    for c, v in enumerate([f'T{tid}', label[d0], DIST[d0][1], PNAME[rows_[0][1]], len(rows_), round(tot, 1), 'Full' if full else 'Part load'], 1):
        put(r, c, v, c == 1, None if full else pfill, '0.0' if c == 6 else None, mid if c != 2 else None)
    tp.row_dimensions[r].height = 15
r += 1
put(r, 1, 'Total', True, gray); put(r, 2, f'{len(trucks)} trucks', True, gray)
for c in (3, 4, 5): put(r, c, None, fill=gray)
put(r, 6, f'=SUM(F{first}:F{r - 1})', True, gray, '0.0', mid)
put(r, 7, f'=COUNTIF(G{first}:G{r - 1},"Full")&" full"', True, gray, al=mid)
r += 3
cols = ['Truck', 'Distributor', 'Plant', 'Section', 'Size', 'Thk', 'Indent (MT)', 'Dispatch (MT)', 'Qty Left (MT)', 'Load (MT)', 'Truck Total (MT)']
for i, h in enumerate(cols, 1): put(r, i, h, True, hfill, al=mid)
r += 1
for tid, rows_ in trucks.items():
    tot = sum(x_[4] for x_ in rows_); full = tot >= TRUCK - MINLINE
    fill = pfill if not full else (dfill if tid % 2 else None)
    start = r
    for dist, p, _, k, mt in rows_:
        sec, size, thk = k
        vals = [f'T{tid}' + ('' if full else ' (part)'), label[dist], PNAME[p], sec, size + (' NB' if sec == 'CHS' else ''), thk,
                indent.get((dist, k), 0), round(dist_disp(dist, k), 2), f'=G{r}-H{r}', mt]
        for c, v in enumerate(vals, 1): put(r, c, v, c == 1, fill, '0.0' if c >= 7 else None, mid if c != 2 else None)
        put(r, 11, None, fill=fill); tp.row_dimensions[r].height = 15; r += 1
    put(start, 11, round(tot, 1), True, fill, '0.0', mid)
    if r - start > 1: tp.merge_cells(start_row=start, start_column=11, end_row=r - 1, end_column=11)
r += 1
for line in ["Qty Left = Indent − Dispatch for that distributor and size; dispatch = Oct invoices to the distributor from ANY plant. Trucks load only from the distributor's own region (South: Hyderabad + Lepakshi, West: NPMD + Tapi).",
             'Load = what goes on this truck, capped by stock on hand. A size split across two trucks repeats Indent / Dispatch / Qty Left — add the Load column, not Qty Left.',
             'Short stock shared by distributors of a region is split in proportion to qty left; if a share would be under 1 MT, the lot goes to the largest qty left first. One plant per truck; no line under 1 MT. CRFH counted as Black; 3 mm includes 3.2 mm.']:
    tp.cell(r, 1, line).font = Font(name=FONT, italic=True, size=9); r += 1
for c, w in zip('ABCDEFGHIJK', (11, 24, 11, 10, 10, 10, 10, 11, 11, 10, 13)): tp.column_dimensions[c].width = w
tp.freeze_panes = 'A4'

# ── Checks tab: everything the numbers depend on that a person should look at ──
ck = wb.create_sheet('Checks')
ck.cell(1, 1, f'CHECKS — data the plan depends on ({ASOF})').font = Font(name=FONT, bold=True, size=11)
r = 3
def section(title, head, rows_):
    global r
    ck.cell(r, 1, title).font = Font(name=FONT, bold=True, size=10); r += 1
    for i, h in enumerate(head, 1): style(ck.cell(r, i, h), True, PatternFill('solid', fgColor='FFC000'), al=mid)
    r += 1
    if not rows_: ck.cell(r, 1, 'none').font = Font(name=FONT, italic=True, size=9); r += 1
    for row in rows_:
        for i, v in enumerate(row, 1): style(ck.cell(r, i, v), fmt='0.00' if isinstance(v, float) else None)
        r += 1
    r += 1
neg = []
for (p, k) in sorted(flow, key=lambda pk: (pk[0], sortkey(pk[1]))):
    o_, c_ = plant_open(p, k), plant_stock(p, k)
    if o_ < -0.005 or c_ < -0.005:
        neg.append((PNAME[p], k[0], k[1] + (' NB' if k[0] == 'CHS' else ''), k[2], round(o_, 2), round(c_, 2)))
section('1. Plant stock below zero — invoiced more than recorded production. Counted as 0; fix the production entries.',
        ['Plant', 'Section', 'Size', 'Thk', 'Opening raw', 'Closing raw'], neg)
never = sorted({(DIST[d][1],) + k for (d, k) in indent if indent[(d, k)] and not any(kk == k for (_, kk) in flow)})
section('2. Indented sizes never produced or invoiced at ANY plant — check the SKU master has them.',
        ['Region', 'Section', 'Size', 'Thk'], [(a, b, c + (' NB' if b == 'CHS' else ''), t) for a, b, c, t in never])
section('3. Indent typos corrected for the calculation (the indent cells are unchanged).', ['Correction'], [(f,) for f in fixes])
for c_, w in zip('ABCDEF', (40, 9, 10, 6, 12, 12)): ck.column_dimensions[c_].width = w
wb.save(out)

# ── checks ──
print('distributors', [(d, DIST[d][1]) for d in dists])
print('indent', round(sum(indent.values()), 2), {g_: round(sum(q for (d, k), q in indent.items() if DIST[d][1] == g_), 2) for g_ in regions})
print('trucks', len(trucks), 'planned', round(sum(x_[4] for x_ in plan), 2), 'alloc', round(sum(alloc.values()), 2))
miss = sorted({(DIST[d][1],) + k for (d, k) in indent if not any((p, k) in flow for p in REGION_PLANTS[DIST[d][1]])})
print('sizes with no data in their region:', len(miss))
print('\n'.join(fixes) or 'no typo fixes')
