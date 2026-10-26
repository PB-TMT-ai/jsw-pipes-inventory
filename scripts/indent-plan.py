# ── Indent plan: stock columns, size x thickness grids and a 25 MT truck plan for a distributor indent ──
#
# Reads a distributor indent workbook (Sheet1: S.No | Distributor | Material | Section | Size | Thickness
# | Qty in MT, header on row 3) and writes a copy with four extra tabs/columns:
#   Sheet1             + Opening / Production / Dispatch / Closing inventory and Region per row
#   Grid               one row per region + size, a column per distributor, then the four stock columns
#   Size x Thickness   per region: Indent | Dispatch | Qty Left | Inventory, whole MT
#   Truck Plan         25 MT trucks (--truck-mt) from stock on hand against Qty Left = Indent - Dispatch
# and, with --ageing + --combined, ONE more workbook (R17): Truck Load · No Stock · SKU Inventory (plant-wise,
# SKUs over 2 MT with FIFO age) · Ageing (per plant) — the same figures as the tabs above, never re-derived.
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

import sys, os, re, copy, json, math, argparse, openpyxl
from openpyxl.utils import get_column_letter as L
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# Pinned: the approved look (Oct 2026) is Cambria. An unnamed font would fall back to each app's
# own default, so the same file would look different in Excel and LibreOffice.
FONT = 'Cambria'

ap = argparse.ArgumentParser()
ap.add_argument('--indent', required=True); ap.add_argument('--flow', required=True)
ap.add_argument('--disp', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--asof', required=True, help='label for the data date, e.g. "20 Oct" (latest production)')
ap.add_argument('--truck-mt', type=float, default=25.0, help='truck capacity in MT (default 25; Full = 1 MT under it)')
ap.add_argument('--split', help='also write a two-tab workbook of Qty Left: sizes with stock available / with no stock')
ap.add_argument('--ageing', help='ageing bundle (query 5 of indent-plan.sql): per plant + size, FIFO age buckets of what is on hand')
ap.add_argument('--combined', help='write the combined workbook (needs --ageing): Truck Load, No Stock, SKU Inventory, Ageing')
ap.add_argument('--disp-asof', help='label for the latest invoice date if earlier, e.g. "19 Oct"')
ap.add_argument('--config', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'indent-plan-distributors.json'))
args = ap.parse_args()
if bool(args.ageing) != bool(args.combined): sys.exit('--ageing and --combined go together: the combined workbook needs the ageing bundle')
src, flow_txt, disp_txt, out, ASOF = args.indent, args.flow, args.disp, args.out, args.asof
DISP_ASOF = args.disp_asof or ASOF

cfg = json.load(open(args.config))
REGION_PLANTS = cfg['regionPlants']
PNAME = cfg['plantNames']
SIZE_FIXES = {k.upper(): v.upper() for k, v in cfg.get('sizeFixes', {}).items()}
nm = lambda s: re.sub(r'\s+', ' ', str(s)).strip().upper()     # 'KISAN PIPE &  STEEL ' = 'KISAN PIPE & STEEL'
DIST = {nm(k): (v['customer'], v['region']) for k, v in cfg['distributors'].items()}
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
    if 'NB' in s or (sec == 'CHS' and 'X' not in s):    # the size decides the section, not the Section cell (R3)
        sec2, s = 'CHS', s.replace('NB', '')
        if sec2 != sec: fixes.append(f'Row {row}: {dist.title()} {sec} {size} read as CHS')
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

# ── Ageing bundle (R17): per plant + size, FIFO by weight. Thickness stays the SKU master's own (3.2 is 3.2) ──
ageing = []                                        # [plant, (pt, size, thk), onhand, b0_30, b31_60, b61_90, b90plus, oldest, wavg]
if args.ageing:
    for rec in open(args.ageing).read().strip().split(';'):
        pt, size, thk, plant, on, b1, b2, b3, b4, old, wavg = rec.split('|')
        a_ = [plant, (pt, size, round(float(thk), 2)), float(on), float(b1), float(b2), float(b3), float(b4), int(old), float(wavg)]
        if abs(sum(a_[3:7]) - a_[2]) > 0.002:
            raise SystemExit(f'ageing bundle: {plant} {pt} {size} x {thk}: age bucket sums {sum(a_[3:7]):.3f} against on-hand {a_[2]:.3f} — rebuild query 5')
        ageing.append(a_)
    # The ageing on-hand must be the same stock the truck plan and Sheet1 use (each plant floored at 0, 3 and 3.2 one size).
    ag_stock = {}
    for plant, k, on, *_ in ageing:
        k2 = (k[0], k[1], T(k[2])); ag_stock[(plant, k2)] = ag_stock.get((plant, k2), 0) + on
    bad_ = [(pk, round(ag_stock.get(pk, 0), 3), round(max(0.0, plant_stock(*pk)), 3)) for pk in sorted(set(ag_stock) | set(flow))
            if abs(ag_stock.get(pk, 0) - max(0.0, plant_stock(*pk))) > 0.002]
    if bad_:
        raise SystemExit('ageing on-hand disagrees with plant stock (ageing, stock) — pull flow and ageing again, same moment:\n'
                         + '\n'.join(f'  {pk[0]} {pk[1]}: {a} vs {b}' for pk, a, b in bad_[:15]))

# ── Sheet1: the indent's columns are found by their header (row 3), so both layouts read: the original
#    S.No | Distributor | Material | Section | Size | Thickness | Qty in MT, and the Oct-26 one that adds
#    SM, Region, Billed Qty and Pending Qty around them (rule R14) ──
wb = openpyxl.load_workbook(src)
ws = wb['Sheet1']
H = {nm(ws.cell(3, c).value): c for c in range(1, ws.max_column + 1) if isinstance(ws.cell(3, c).value, str)}
def col(pred, what, need=True):
    hits = [c for h, c in H.items() if pred(h)]
    if need and not hits: raise SystemExit(f'Sheet1 row 3 has no {what} column — headers found: {list(H)}')
    return hits[0] if hits else None
C_DIST, C_MAT = col(lambda h: h == 'DISTRIBUTOR', 'Distributor'), col(lambda h: h == 'MATERIAL', 'Material')
C_SEC, C_SIZE = col(lambda h: h == 'SECTION', 'Section'), col(lambda h: h == 'SIZE', 'Size')
C_THK, C_QTY = col(lambda h: h == 'THICKNESS', 'Thickness'), col(lambda h: 'QTY IN MT' in h, 'Qty in MT')
C_BILL, C_PEND = col(lambda h: h.startswith('BILLED'), '', False), col(lambda h: h.startswith('PENDING'), '', False)
C_REG, C_SNO = col(lambda h: h == 'REGION', '', False), col(lambda h: h.replace(' ', '') in ('S.NO', 'S.NO.', 'SNO'), '', False)
LASTC = max(H.values()); hdr = ws.cell(3, C_QTY)
NEW = ['Opening Inventory (MT)', 'Production (MT)', 'Dispatch (MT)', 'Closing Inventory (MT)'] + ([] if C_REG else ['Region'])
NC = LASTC + 1                                     # first stock column, straight after the indent's own

# Anything to the right of the table (the Oct-26 file carries a merged note at P6:U8) moves right of the
# new columns rather than being written over.
right = [m for m in ws.merged_cells.ranges if m.min_col > LASTC]
for m in right: ws.unmerge_cells(str(m))
if ws.max_column > LASTC:
    OFF = len(NEW) + 1
    widths_ = {c: ws.column_dimensions[L(c)].width for c in range(LASTC + 1, ws.max_column + 1) if L(c) in ws.column_dimensions}
    ws.move_range(f'{L(LASTC + 1)}1:{L(ws.max_column)}{ws.max_row}', cols=OFF)
    for m in right: ws.merge_cells(start_row=m.min_row, end_row=m.max_row, start_column=m.min_col + OFF, end_column=m.max_col + OFF)
    for c, w in widths_.items(): ws.column_dimensions[L(c + OFF)].width = w
for i, t in enumerate(NEW):
    c = ws.cell(3, NC + i, t); c._style = copy.copy(hdr._style)
    c.alignment = copy.copy(c.alignment); c.alignment = Alignment(horizontal='left', vertical=c.alignment.vertical, wrap_text=c.alignment.wrap_text)
    ws.column_dimensions[L(NC + i)].width = 14 if i < 4 else 9

# Rows: a row carrying a thickness but no distributor (billing someone typed under the row above, Oct-26)
# belongs to the distributor above it, and takes its section and size when those are blank too (rule R15).
footer = next((r for r in range(4, ws.max_row + 1)
               if any(isinstance(ws.cell(r, c).value, str) and 'SUBTOTAL(' in ws.cell(r, c).value.upper() for c in range(1, LASTC + 1))),
              ws.max_row + 1)
recs = []                                          # one per data row: [row, dist, mat, sec, size, thk, qty, key]
prev = None
for r in range(4, footer):
    v = {k: ws.cell(r, c).value for k, c in (('d', C_DIST), ('m', C_MAT), ('s', C_SEC), ('z', C_SIZE), ('t', C_THK), ('q', C_QTY))}
    if v['t'] is None: continue
    if v['d'] is None:
        if prev is None or (v['s'] is not None and v['z'] is None): continue
        v['d'] = prev[1]; v['s'] = v['s'] or prev[3]; v['z'] = v['z'] or prev[4]; v['m'] = v['m'] or prev[2]
        fixes.append(f'Row {r}: no distributor — read as {nm(v["d"]).title()} {v["s"]} {v["z"]} {v["t"]:g} (the row above)')
    if v['s'] is None: continue
    dist = nm(v['d'])
    if dist not in DIST:
        raise SystemExit(f'Row {r}: distributor {v["d"]!r} is not in {args.config} — add its invoice name and region, then rerun')
    if C_REG and ws.cell(r, C_REG).value and nm(ws.cell(r, C_REG).value) != nm(DIST[dist][1]):
        raise SystemExit(f'Row {r}: {v["d"]!r} is {ws.cell(r, C_REG).value} in the file but {DIST[dist][1]} in {args.config} — ask the user which')
    rec = [r, dist, v['m'], v['s'], v['z'], v['t'], v['q'], norm(dist, v['s'], v['z'], v['t'], r)]
    recs.append(rec); prev = [r, v['d'], v['m'], v['s'], v['z']]

# Billed Qty (when the layout has it) = this month's invoices to the distributor, any plant — and every size
# invoiced with no indent row gets one, Indent 0, under its distributor (rule R14, the file's own note).
billed_changes, added = [], []
if C_BILL:
    have = {(rc[1], rc[7]) for rc in recs}
    for dist in dict.fromkeys(rc[1] for rc in recs):
        cust = DIST[dist][0]
        for k in sorted({k for (c_, p, k) in cdisp if c_ == cust and (dist, k) not in have}, key=sortkey):
            if dist_disp(dist, k) > 0.005: added.append((dist, k))
    # Rebuild the table body with the new rows after each distributor's last row; formulas are regenerated
    # below, because moving cells does not rewrite the references inside them.
    snap = {r: [(ws.cell(r, c).value, copy.copy(ws.cell(r, c)._style)) for c in range(1, LASTC + 1)] for r in range(4, ws.max_row + 1)}
    lastrow, named = {}, {}                        # last row of each distributor / its last row that names it
    for rc in recs:
        lastrow[rc[1]] = rc[0]
        if ws.cell(rc[0], C_DIST).value is not None: named[rc[1]] = rc[0]
    seq = []
    for r in range(4, footer):
        seq.append(('orig', r))
        for dist, k in added:
            if lastrow.get(dist) == r: seq.append(('add', dist, k))
    seq += [('orig', r) for r in range(footer, max(snap) + 1)]
    for r in range(4, 4 + len(seq) + 1):
        for c in range(1, LASTC + 1): ws.cell(r, c).value = None
    newrow, addfill, added_rows = {}, PatternFill('solid', fgColor='E2EFDA'), set()
    for i, item in enumerate(seq):
        r = 4 + i
        if item[0] == 'orig':
            for c, (val, st) in enumerate(snap[item[1]], 1): ws.cell(r, c).value = val; ws.cell(r, c)._style = st
            newrow[item[1]] = r
        else:
            _, dist, k = item; src_r = lastrow[dist]
            for c, (val, st) in enumerate(snap[src_r], 1): ws.cell(r, c)._style = copy.copy(st)
            sec, size, thk = k
            for c_, val in ((C_DIST, ws.cell(newrow[named[dist]], C_DIST).value), (C_MAT, 'Black'), (C_SEC, sec),
                            (C_SIZE, size + (' NB' if sec == 'CHS' else '')), (C_THK, thk), (C_QTY, 0)):
                ws.cell(r, c_).value = val
            for c_ in [c for c in range(1, LASTC + 1) if c not in (C_SNO, C_DIST, C_MAT, C_SEC, C_SIZE, C_THK, C_QTY, C_BILL, C_PEND)]:
                ws.cell(r, c_).value = ws.cell(newrow[named[dist]], c_).value  # SM, Region … as the distributor's own rows
            for c in range(2, LASTC + 1): ws.cell(r, c).fill = addfill
            recs.append([r, dist, 'Black', sec, size, thk, 0, k]); added_rows.add(r)
    for rc in recs[:len(recs) - len(added)]: rc[0] = newrow[rc[0]]     # originals first, added rows already placed
    nfooter = 4 + len([s for s in seq if not (s[0] == 'orig' and s[1] >= footer)])
    # S.No chain, Pending and SUBTOTAL formulas, rewritten for the new row numbers
    lastno = None
    for r in range(4, nfooter):
        if C_SNO:
            v_ = ws.cell(r, C_SNO).value
            if r in added_rows or (isinstance(v_, str) and v_.startswith('=')):
                ws.cell(r, C_SNO).value = f'={L(C_SNO)}{lastno}+1' if lastno else 1
            if ws.cell(r, C_SNO).value is not None: lastno = r
    if C_PEND:
        for rc in recs: ws.cell(rc[0], C_PEND).value = f'={L(C_QTY)}{rc[0]}-{L(C_BILL)}{rc[0]}'
    for r in range(nfooter, nfooter + (max(snap) + 1 - footer)):
        for c in range(1, LASTC + 1):
            v_ = ws.cell(r, c).value
            if isinstance(v_, str) and v_.startswith('='):
                ws.cell(r, c).value = re.sub(r'([A-Z]+)4:([A-Z]+)\d+', lambda m_: f'{m_.group(1)}4:{m_.group(2)}{nfooter - 1}', v_)
    # Billed values: the distributor's invoices for that size on its first row, 0 on any repeat row
    def asnum(v_):
        if v_ is None or v_ == '': return None
        if isinstance(v_, (int, float)): return float(v_)
        s_ = str(v_).lstrip('=')
        return float(eval(s_, {'__builtins__': {}})) if re.fullmatch(r'[\d.+\-*/ ()]+', s_) else s_
    done = set()
    orig_of = {v_: k_ for k_, v_ in newrow.items()}
    for rc in sorted(recs, key=lambda rc: rc[0]):
        dist, k, r = rc[1], rc[7], rc[0]
        val = 0.0 if (dist, k) in done else round(dist_disp(dist, k), 3); done.add((dist, k))   # exact: SUBTOTAL adds these
        typed = asnum(ws.cell(r, C_BILL).value)
        if r in orig_of and (typed is None and val or isinstance(typed, str) or (typed is not None and abs(typed - val) > 0.005)):
            billed_changes.append((orig_of[r], r, dist, k, typed, val))
        ws.cell(r, C_BILL).value = val; ws.cell(r, C_BILL).number_format = '0.00'

indent = {}                                        # (dist, key) -> MT
dists = []
for rc in sorted(recs, key=lambda rc: rc[0]):
    r, dist, k, qty = rc[0], rc[1], rc[7], rc[6]
    if dist not in dists: dists.append(dist)
    reg = DIST[dist][1]
    indent[(dist, k)] = indent.get((dist, k), 0) + (qty if isinstance(qty, (int, float)) else 0)
    o, p, d, cl = region_flow(reg, k)
    body = ws.cell(r, C_QTY)
    for i in range(len(NEW)):                      # the indent's own body style, numbers centred (approved look)
        c = ws.cell(r, NC + i); c._style = copy.copy(body._style); c.alignment = Alignment(horizontal='center', vertical=c.alignment.vertical)
    for i, v_ in enumerate((o, p, d, cl)): ws.cell(r, NC + i, v_).number_format = '0.00'
    if not C_REG: ws.cell(r, NC + 4, reg)
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
    # Indented sizes PLUS every size the region holds stock of, ordered or not (user rule R9, Oct-26).
    stocked = {k for (p, k) in flow if p in REGION_PLANTS[reg] and region_flow(reg, k)[3] > 0.005}
    keys = sorted({k for (d, k) in indent if DIST[d][1] == reg} | stocked, key=sortkey)
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
    for (d, k), q in indent.items():
        if DIST[d][1] != reg: continue
        # Dispatched AGAINST the indent (user rule R12, Oct-26): each distributor's own invoices for that
        # size, from any plant, counted only up to its own indent. One distributor's surplus never cancels
        # another's need, and invoices for sizes it did not indent are not netted — both go on Checks.
        dsp[k] = dsp.get(k, 0) + min(q, dist_disp(d, k))
    stock_keys = {k for (p, k) in flow if p in REGION_PLANTS[reg]}
    inv = {k: region_flow(reg, k)[3] for k in set(ind) | set(dsp) | stock_keys}   # ALL stock (user rule, Oct-26)
    data[reg] = (ind, dsp, inv)
used = {(reg, k) for reg in regions for k in set(data[reg][0]) | set(data[reg][1]) | set(data[reg][2])
        if R(data[reg][0].get(k)) or R(data[reg][1].get(k)) or R(data[reg][2].get(k))}
thks = sorted({k[2] for _, k in used})
n = len(thks) + 1
blocks = [('INDENT', 'FFC000'), (f'DISPATCH (1–{DISP_ASOF})', '9BC2E6'), ('QTY LEFT', 'A9D08E'), (f'INVENTORY ({ASOF})', 'F4B084')]
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
x.cell(r, 1, f"Dispatch = each distributor's Oct invoices (any plant) up to its own indent. Qty Left = Indent − Dispatch = still owed, never below 0. Inventory = ALL closing stock of that region's plants on {ASOF}, each plant floored at 0.").font = Font(name=FONT, italic=True, size=9)
x.freeze_panes = 'C1'; x.sheet_view.zoomScale = 90

# ── --split: a separate, simple workbook of what is still owed (Qty Left = Indent − Dispatch, R12), split by
#    whether the region holds stock of that size (user, 26 Oct). Same figures as the Size x Thickness tab. ──
def owed_grid(xw, title, regs_rows, blk):
    """regs_rows: {region: {key: [values per block]}}; blk: [(title, colour)]. Same look as Size x Thickness."""
    keys_all = [k for g_ in regs_rows.values() for k in g_]
    th_ = sorted({k[2] for k in keys_all}) or [0]; n_ = len(th_) + 1
    st_ = [3 + b * (n_ + 1) for b in range(len(blk))]
    for s in st_:
        for c in range(s, s + n_): xw.column_dimensions[L(c)].width = 5.5 if c - s < len(th_) else 6.5
        xw.column_dimensions[L(s + n_)].width = 1.5
    xw.column_dimensions['A'].width = 7; xw.column_dimensions['B'].width = 9
    xw.cell(1, 1, title).font = Font(name=FONT, bold=True, size=11)
    r = 3
    for reg in regions:
        rows_ = regs_rows.get(reg, {})
        xw.cell(r, 1, f'{reg.upper()} — plants: {" + ".join(PNAME[p] for p in REGION_PLANTS[reg])}').font = Font(name=FONT, bold=True, size=11); r += 1
        if not rows_:
            xw.cell(r, 1, 'none').font = Font(name=FONT, italic=True, size=9); r += 3; continue
        for (t_, colr), s in zip(blk, st_):
            xw.merge_cells(start_row=r, start_column=s, end_row=r, end_column=s + n_ - 1)
            style(xw.cell(r, s, t_), True, al=mid, size=10)
            for c in range(s, s + n_):
                xw.cell(r, c).fill = PatternFill('solid', fgColor=colr); xw.cell(r, c).border = box
                style(xw.cell(r + 1, c, f'{th_[c - s]:g}' if c - s < len(th_) else 'Total'), True, PatternFill('solid', fgColor=colr), al=mid)
        for c, h in ((1, 'Section'), (2, 'Size')):
            xw.merge_cells(start_row=r, start_column=c, end_row=r + 1, end_column=c)
            style(xw.cell(r, c, h), True, gray, al=mid); xw.cell(r + 1, c).border = box
        r += 2; first_ = r
        for sec, size in sorted({k[:2] for k in rows_}, key=lambda rk: (order.get(rk[0], 9), dims(rk[1]))):
            xw.cell(r, 1, sec); xw.cell(r, 2, size + (' NB' if sec == 'CHS' else ''))
            for j, t in enumerate(th_):
                for b, s in enumerate(st_):
                    v_ = rows_.get((sec, size, t), [None] * len(blk))[b]
                    if v_: xw.cell(r, s + j, v_)
            for s in st_: xw.cell(r, s + n_ - 1, f'=SUM({L(s)}{r}:{L(s + n_ - 2)}{r})')
            for c in [1, 2] + [s + k for s in st_ for k in range(n_)]:
                style(xw.cell(r, c), xw.cell(r, c).column in [s + n_ - 1 for s in st_], band if order.get(sec) == 1 else None, NUM, mid if c > 2 else None)
            xw.row_dimensions[r].height = 14; r += 1
        xw.cell(r, 2, f'{reg} total')
        for s in st_:
            for c in range(s, s + n_): xw.cell(r, c, f'=SUM({L(c)}{first_}:{L(c)}{r - 1})')
        for c in [1, 2] + [s + k for s in st_ for k in range(n_)]: style(xw.cell(r, c), True, gray, NUM, mid)
        r += 3
    return r
have_, none_ = {}, {}                              # still owed (whole MT) in sizes the region holds / holds none of (R16)
for reg in regions:
    ind, dsp, inv = data[reg]
    for k in set(ind) | set(dsp):
        left_ = R(ind.get(k, 0) - dsp.get(k, 0))          # still owed, whole MT, as the Size x Thickness grid
        if not left_: continue
        stock_ = R(inv.get(k, 0))
        if stock_: have_.setdefault(reg, {})[k] = [left_, stock_, max(0, left_ - stock_) or None]
        else: none_.setdefault(reg, {})[k] = [left_]
def write_no_stock(b_):                            # shared by --split and --combined: the same tab, never re-derived
    r_ = owed_grid(b_, f'QTY LEFT WITH NO STOCK — still owed (Indent − Dispatch, 1–{DISP_ASOF}) in sizes the region does not hold on {ASOF}',
                   none_, [('QTY LEFT', 'A9D08E')])
    b_.cell(r_ - 1, 1, 'Whole MT; blank = 0. Nothing in stock at the region\'s plants for these sizes — they need production before they can ship.').font = Font(name=FONT, italic=True, size=9)
if args.split:
    sw = openpyxl.Workbook(); a_ = sw.active; a_.title = 'Stock Available'
    r_ = owed_grid(a_, f'QTY LEFT WITH STOCK AVAILABLE — still owed (Indent − Dispatch, 1–{DISP_ASOF}) in sizes the region holds on {ASOF}',
                   have_, [('QTY LEFT', 'A9D08E'), (f'INVENTORY ({ASOF})', 'F4B084'), ('SHORT', 'FF9999')])
    a_.cell(r_ - 1, 1, 'Whole MT; blank = 0. Qty Left = each distributor\'s indent less its own invoices (any plant), never below 0. Inventory = region plants\' closing stock, each plant floored at 0. Short = Qty Left − Inventory, where stock does not cover it.').font = Font(name=FONT, italic=True, size=9)
    b_ = sw.create_sheet('No Stock'); write_no_stock(b_)
    for w_ in (a_, b_): w_.freeze_panes = 'C1'; w_.sheet_view.zoomScale = 90
    sw.save(args.split)

# ── Truck Plan: 25 MT trucks (--truck-mt) from stock on hand, each distributor served only by its region's plants ──
TRUCK, MINLINE = args.truck_mt, 1.0
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
            # A share under 1 MT cannot go on a truck (R8). Drop the smallest such share and split the lot
            # pro rata again among the rest, until every share is a loadable line (user rule R7, 26 Oct —
            # it replaced "largest qty left takes it all", which gave SST 10 / Khan 3.01 instead of 8.67 / 4.33).
            act = dict(want)
            while act and any(v < MINLINE for v in shares.values()):
                del act[min(shares, key=lambda d: (shares[d], act[d]))]
                tot_ = sum(act.values()); f_ = min(1.0, avail / tot_) if tot_ else 0
                shares = {d: fl2(w * f_) for d, w in act.items()}
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

def write_truck_plan(tp):                         # one writer for the indent output and the combined workbook: same code, same figures
    hfill = PatternFill('solid', fgColor='FFC000'); dfill = PatternFill('solid', fgColor='DDEBF7'); pfill = PatternFill('solid', fgColor='FCE4D6')
    put = lambda r, c, v, bold=False, fill=None, fmt=None, al=None: style(tp.cell(r, c, v), bold, fill, fmt, al)
    tp.cell(1, 1, f'TRUCK PLAN — {TRUCK:g} MT trucks from stock on hand ({ASOF}), against Qty Left = Indent − Dispatch').font = Font(name=FONT, bold=True, size=11)
    r = 3
    for i, h in enumerate(['Truck', 'Distributor', 'Region', 'Plant', 'Sizes', 'Load (MT)', 'Status'], 1): put(r, i, h, True, hfill, al=mid)
    first = r + 1
    for tid, rows_ in trucks.items():
        r += 1; tot = sum(x_[4] for x_ in rows_); full = tot >= TRUCK - MINLINE
        d0 = rows_[0][0]
        for c, v in enumerate([f'T{tid}', label[d0], DIST[d0][1], PNAME[rows_[0][1]], len(rows_), round(tot, 2), 'Full' if full else 'Part load'], 1):
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
                    indent.get((dist, k), 0), round(dist_disp(dist, k), 3), f'=G{r}-H{r}', mt]
            for c, v in enumerate(vals, 1): put(r, c, v, c == 1, fill, '0.0' if c >= 7 else None, mid if c != 2 else None)
            put(r, 11, None, fill=fill); tp.row_dimensions[r].height = 15; r += 1
        put(start, 11, round(tot, 1), True, fill, '0.0', mid)
        if r - start > 1: tp.merge_cells(start_row=start, start_column=11, end_row=r - 1, end_column=11)
    r += 1
    for line in ["Qty Left = Indent − Dispatch for that distributor and size; dispatch = Oct invoices to the distributor from ANY plant. Trucks load only from the distributor's own region (South: Hyderabad + Lepakshi, West: NPMD + Tapi).",
                 'Load = what goes on this truck, capped by stock on hand. A size split across two trucks repeats Indent / Dispatch / Qty Left — add the Load column, not Qty Left.',
                 'Short stock shared by distributors of a region is split in proportion to qty left; a share under 1 MT is dropped and the rest re-split pro rata. One plant per truck; no line under 1 MT. CRFH counted as Black; 3 mm includes 3.2 mm.']:
        tp.cell(r, 1, line).font = Font(name=FONT, italic=True, size=9); r += 1
    for c, w in zip('ABCDEFGHIJK', (11, 24, 11, 10, 10, 10, 10, 11, 11, 10, 13)): tp.column_dimensions[c].width = w
    tp.freeze_panes = 'A4'

tp = wb.create_sheet('Truck Plan'); write_truck_plan(tp)

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
extra = []
for d in dists:
    cust = DIST[d][0]
    for k in sorted({k for (c_, p, k) in cdisp if c_ == cust}, key=sortkey):
        got, q = dist_disp(d, k), indent.get((d, k), 0)
        if got - q > 0.005:
            extra.append((label[d], k[0], k[1] + (' NB' if k[0] == 'CHS' else ''), k[2], float(q), round(got, 2), round(got - q, 2)))
section('4. Invoiced this month beyond the indent, or in sizes not indented — not netted against anyone else.',
        ['Distributor', 'Section', 'Size', 'Thk', 'Indent', 'Invoiced', 'Beyond indent'], extra)
if C_BILL:
    lab = lambda k: k[1] + (' NB' if k[0] == 'CHS' else '')
    section('5. Billed Qty set to this month\'s invoices (any plant) — every value that changed from the file.',
            ['Distributor', 'Section', 'Size', 'Thk', 'File row', 'Typed', 'Invoiced'],
            [(label[d], k[0], lab(k), k[2], f'{o_} → {n_}' if o_ != n_ else o_, t_ if isinstance(t_, str) else (None if t_ is None else round(t_, 2)), v_)
             for o_, n_, d, k, t_, v_ in billed_changes])
    section('6. Rows added (green) — invoiced this month with no indent row; Indent 0.',
            ['Distributor', 'Section', 'Size', 'Thk', 'Row', 'Invoiced'],
            [(label[d], k[0], lab(k), k[2], next(rc[0] for rc in recs if rc[1] == d and rc[7] == k), round(dist_disp(d, k), 2)) for d, k in added])
for c_, w in zip('ABCDEFG', (40, 9, 10, 6, 12, 12, 13)): ck.column_dimensions[c_].width = w
wb.save(out)

# ── --combined (R17): one workbook — Truck Load · No Stock · SKU Inventory (plant-wise) · Ageing ──
# Truck Load and No Stock come from the SAME writers as the indent output and the --split workbook, so their
# figures cannot drift. SKU Inventory is the PB MTD sheet "SKUs WITH ON-HAND INVENTORY > 2 MT", split per plant;
# every plant block closes with an "Other SKUs (≤ 2 MT)" line so it adds up to that plant's whole on-hand, and
# the Ageing tab is those plant totals. Exact values are stored; the number format does the rounding (26 Oct).
if args.combined:
    MIN_ONHAND = 2.0
    plants_all = [p_ for reg in regions for p_ in REGION_PLANTS[reg]]
    cw = openpyxl.Workbook(); cw.active.title = 'Truck Load'; write_truck_plan(cw['Truck Load'])
    ns_ = cw.create_sheet('No Stock'); write_no_stock(ns_); ns_.freeze_panes = 'C1'; ns_.sheet_view.zoomScale = 90
    MT1, D0, PCT = '[<0.05]"-";#,##0.0', '[<0.5]"-";#,##0', '0%'
    sku_label = lambda k: (k[1] + (' NB' if k[0] == 'CHS' else '')) + f' x {k[2]:g}'
    def agg(rs):                                   # on-hand, four buckets, oldest, on-hand weighted average age
        on = round(sum(a[2] for a in rs), 6)
        return {'on': on, 'b': [round(sum(a[3 + i] for a in rs), 6) for i in range(4)], 'old': max((a[7] for a in rs), default=None),
                'avg': (sum(a[2] * a[8] for a in rs) / on) if on else None}
    byp = {p_: sorted([a for a in ageing if a[0] == p_], key=lambda a: (-a[2], sortkey(a[1]))) for p_ in plants_all}
    si = cw.create_sheet('SKU Inventory')
    for c_, w_ in zip('ABCDEFGH', (24, 12, 10, 10, 10, 10, 11, 15)): si.column_dimensions[c_].width = w_
    si.cell(1, 1, f'JSW One Pipes & Tubes — SKUs WITH ON-HAND INVENTORY > {MIN_ONHAND:g} MT, plant-wise ({ASOF}), FIFO age in days').font = Font(name=FONT, bold=True, size=11)
    heads = ['SKU', 'On-hand MT', '0–30 d', '31–60 d', '61–90 d', '90+ d', 'Oldest (d)', 'Wtd Avg Age (d)']
    def sirow(r_, label_, g, bold=False, fill=None):
        vals = [label_, g['on'], *g['b'], g['old'], g['avg']]
        for c_, v_ in enumerate(vals, 1):
            style(si.cell(r_, c_, v_), bold, fill, MT1 if c_ in (2, 3, 4, 5, 6, 8) else (D0 if c_ == 7 else None), mid if c_ > 1 else None)
    r_ = 3; plant_tot = {}
    for p_ in plants_all:
        big = [a for a in byp[p_] if a[2] > MIN_ONHAND]; small = [a for a in byp[p_] if a[2] <= MIN_ONHAND]
        for c_ in range(1, 9): style(si.cell(r_, c_, PNAME[p_] if c_ == 1 else None), True, gray)
        r_ += 1
        for c_, h_ in enumerate(heads, 1): style(si.cell(r_, c_, h_), True, PatternFill('solid', fgColor='FFC000'), al=mid)
        r_ += 1
        for a in big: sirow(r_, sku_label(a[1]), {'on': a[2], 'b': a[3:7], 'old': a[7], 'avg': a[8]}); r_ += 1
        if not big:
            si.cell(r_, 1, f'No SKU over {MIN_ONHAND:g} MT on hand').font = Font(name=FONT, italic=True, size=9); r_ += 1
        sirow(r_, f'Subtotal (> {MIN_ONHAND:g} MT)', agg(big), True, gray); r_ += 1
        sirow(r_, f'Other SKUs (≤ {MIN_ONHAND:g} MT)', agg(small)); r_ += 1
        plant_tot[p_] = agg(byp[p_]); sirow(r_, f'{PNAME[p_]} total on-hand', plant_tot[p_], True, gray); r_ += 3
    for line in [f'Positive on-hand stock per plant, FIFO by weight (oldest production leaves first), aged to {ASOF}. A SKU is listed when it holds more than {MIN_ONHAND:g} MT at that plant; the rest sit in "Other SKUs".',
                 'Weights as in the truck plan: production = tubes × the SKU master\'s weight per tube (never density), dispatch = the invoiced weight. The PB MTD workbook uses the recorded total weight, so a plant can differ from it by a few MT — do not reconcile the two.',
                 'Thickness is the SKU master\'s own (3.2 stays 3.2). Tonnage and ages are stored exact and displayed to one decimal; "-" is below the display precision. Wtd Avg Age is weighted by on-hand MT.']:
        si.cell(r_, 1, line).font = Font(name=FONT, italic=True, size=9); r_ += 1
    si.sheet_view.zoomScale = 90
    ag_t = cw.create_sheet('Ageing')
    for c_, w_ in zip('ABCDEFGHIJKL', (14, 12, 10, 10, 10, 10, 9, 9, 9, 9, 11, 15)): ag_t.column_dimensions[c_].width = w_
    ag_t.cell(1, 1, f'AGEING BY PLANT — all SKUs on hand ({ASOF}), FIFO age in days').font = Font(name=FONT, bold=True, size=11)
    for c_, h_ in enumerate(['Plant', 'On-hand MT', '0–30 d', '31–60 d', '61–90 d', '90+ d', '% 0–30 d', '% 31–60 d', '% 61–90 d', '% 90+ d', 'Oldest (d)', 'Wtd Avg Age (d)'], 1):
        style(ag_t.cell(3, c_, h_), True, PatternFill('solid', fgColor='FFC000'), al=mid)
    def agrow(r_, label_, g, bold=False, fill=None):
        vals = [label_, g['on'], *g['b'], *[(b_ / g['on']) if g['on'] else None for b_ in g['b']], g['old'], g['avg']]
        for c_, v_ in enumerate(vals, 1):
            style(ag_t.cell(r_, c_, v_), bold, fill, MT1 if c_ in (2, 3, 4, 5, 6, 12) else (PCT if c_ in (7, 8, 9, 10) else (D0 if c_ == 11 else None)), mid if c_ > 1 else None)
    for i_, p_ in enumerate(plants_all): agrow(4 + i_, PNAME[p_], plant_tot[p_])
    agrow(4 + len(plants_all), 'Total', agg(ageing), True, gray)
    r_ = 6 + len(plants_all)
    for line in ['Every SKU on hand at the plant, not only those over 2 MT — each plant row equals the "total on-hand" line of its block on the SKU Inventory tab.',
                 'FIFO by weight: the oldest production leaves first, so what is on hand is the newest. Wtd Avg Age is weighted by on-hand MT; the % columns are shares of the plant\'s on-hand.']:
        ag_t.cell(r_, 1, line).font = Font(name=FONT, italic=True, size=9); r_ += 1
    cw.save(args.combined)
    # the figures the covering mail quotes — printed here so the mail cannot be written from anything else
    print('── combined workbook (R17) ──')
    treg = {g_: [x_ for x_ in plan if DIST[x_[0]][1] == g_] for g_ in regions}
    for g_ in regions:
        ids_ = {ids[(x_[0], x_[1], x_[2])] for x_ in treg[g_]}
        full_ = sum(1 for t_ in ids_ if sum(x_[4] for x_ in trucks[t_]) >= TRUCK - MINLINE)
        print(f'trucks {g_}: {len(ids_)} ({full_} full), {sum(x_[4] for x_ in treg[g_]):.2f} MT')
    print('trucks total:', len(trucks), f'{sum(x_[4] for x_ in plan):.2f} MT')
    for g_ in regions: print(f'no stock {g_}: {sum(v_[0] for v_ in none_.get(g_, {}).values())} MT (whole-MT cells), {len(none_.get(g_, {}))} sizes')
    for p_ in plants_all:
        t_p = plant_tot[p_]; big_ = [a for a in byp[p_] if a[2] > MIN_ONHAND]
        print(f'{PNAME[p_]}: on-hand {t_p["on"]:.3f} MT, {len(big_)} SKUs > {MIN_ONHAND:g} MT ({sum(a[2] for a in big_):.3f} MT)' + (
              f', oldest {t_p["old"]} d, wtd avg {t_p["avg"]:.1f} d, 90+ d {t_p["b"][3]:.3f} MT ({100 * t_p["b"][3] / t_p["on"]:.0f}%)' if t_p['on'] else ', nothing on hand'))
    print('ageing total', f'{agg(ageing)["on"]:.3f} MT')

# ── checks ──
print('distributors', [(d, DIST[d][1]) for d in dists])
print('indent', round(sum(indent.values()), 2), {g_: round(sum(q for (d, k), q in indent.items() if DIST[d][1] == g_), 2) for g_ in regions})
print('trucks', len(trucks), 'planned', round(sum(x_[4] for x_ in plan), 2), 'alloc', round(sum(alloc.values()), 2))
miss = sorted({(DIST[d][1],) + k for (d, k) in indent if not any((p, k) in flow for p in REGION_PLANTS[DIST[d][1]])})
print('sizes with no data in their region:', len(miss))
print('\n'.join(fixes) or 'no typo fixes')
if C_BILL: print(f'billed: {len(billed_changes)} values changed, {len(added)} rows added ({round(sum(dist_disp(d, k) for d, k in added), 2)} MT)')
