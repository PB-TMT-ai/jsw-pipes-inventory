# ── Regression tests for scripts/indent-plan.py ──
#
# Every rule in docs/indent-plan-rules.md has a case here, built on a tiny synthetic indent and data
# bundle so the expected answer can be worked out by hand. Every mistake the user ever catches gets a
# case here BEFORE it is fixed (R4 is the Oct-26 VVN/Tapi bug). Runs the real script end to end.
#
# Usage: python3 scripts/indent-plan-test.py      -> exit 1 if any case fails
import os, sys, json, subprocess, tempfile, openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'indent-plan.py')

CONFIG = {
    'regionPlants': {'South': ['hyderabad', 'lepakshi'], 'West': ['npmd', 'tapi']},
    'plantNames': {'hyderabad': 'Hyderabad', 'lepakshi': 'Lepakshi', 'npmd': 'NPMD', 'tapi': 'Tapi'},
    'sizeFixes': {'20X100': '200X100'},
    'distributors': {
        'SOUTH A': {'customer': 'SOUTH A PVT LTD', 'region': 'South'},
        'SOUTH B': {'customer': 'SOUTH B PVT LTD', 'region': 'South'},
        'WEST C': {'customer': 'WEST C PVT LTD', 'region': 'West'},
    },
}
# indent rows: distributor, material, section, size, thickness, qty
INDENT = [
    ('SOUTH A', 'Black', 'SHS', '150X150', 4, 6),      # R4: received 6.68 from Tapi -> nothing left
    ('SOUTH A', 'Black', 'SHS', '72X72', 5, 6),        # R5: stock only at Tapi (West) -> no truck
    ('SOUTH A', 'Black', 'SHS', '25X25', 2, 5),        # R6: Lepakshi -3.21, Hyderabad +1.61 -> closing 1.61
    ('SOUTH A', 'Black', 'RHS', '96X48', 2.5, 10),     # R7: 1.79 MT shared with B -> all to A
    ('SOUTH B', 'Black', 'RHS', '96X48', 2.5, 5),
    ('SOUTH B', 'CRFH', 'SHS', '50 x 50', 3, 4),       # R2: CRFH as Black; 3 matches stock held as 3.2
    ('SOUTH B', 'Black', 'SHS', '80X40', 2, 3),        # R3: SHS with unequal sides -> RHS 80x40
    ('SOUTH B', 'Black', 'RHS', '60*40', 1.5, 3),      # R3: '*' -> x, 1.5 -> 1.6
    ('SOUTH A', 'Black', 'RHS', '100X50', 2, 30),      # R8: 30 MT left -> trucks of 25 + 6.61, one plant
    ('WEST C', 'Black', 'SHS', '150X150', 4, 4),       # R5: West served from Tapi
]
# flow: section|size|thk|plant|prodBefore|dispBefore|prodMonth|dispMonth
FLOW = [
    'SHS|150x150|4|lepakshi|0|0|20|0', 'SHS|150x150|4|tapi|10|0|0|0',
    'SHS|72x72|5|tapi|30|0|0|0',
    'SHS|25x25|2|lepakshi|0|0|0|3.21', 'SHS|25x25|2|hyderabad|10|8.39|0|0',
    'RHS|96x48|2.5|lepakshi|1.79|0|0|0',
    'SHS|50x50|3.2|hyderabad|5|0|0|0',
    'RHS|80x40|2|hyderabad|2|0|1|0',
    'RHS|60x40|1.6|hyderabad|4|0|0|0',
    'RHS|100x50|2|hyderabad|50|10|5|5',
    'SHS|38x38|2|hyderabad|9|0|0|0',                    # R9: stock nobody ordered -> still in Inventory
]
# dispatch: section|size|thk|plant|customer|MT
DISP = ['SHS|150x150|4|tapi|SOUTH A PVT LTD|6.68',
        'SHS|72x72|5|tapi|SOUTH B PVT LTD|2.0']        # R12: South B invoiced a size it never indented

def build(tmp, *extra):
    cfg = os.path.join(tmp, 'cfg.json'); json.dump(CONFIG, open(cfg, 'w'))
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Sheet1'
    for i, h in enumerate(['S.No', 'Distributor', 'Material', 'Section', 'Size', 'Thickness', 'Qty in MT'], 2): ws.cell(3, i, h)
    for r, row in enumerate(INDENT, 4):
        ws.cell(r, 2, r - 3)
        for i, v in enumerate(row, 3): ws.cell(r, i, v)
    ind = os.path.join(tmp, 'in.xlsx'); wb.save(ind)
    fl = os.path.join(tmp, 'flow.txt'); open(fl, 'w').write(';'.join(FLOW))
    ds = os.path.join(tmp, 'disp.txt'); open(ds, 'w').write(';'.join(DISP))
    out = os.path.join(tmp, 'out.xlsx')
    res = subprocess.run([sys.executable, '-I', SCRIPT, '--indent', ind, '--flow', fl, '--disp', ds, '--out', out,
                          '--asof', 'TEST', '--config', cfg, *extra], capture_output=True, text=True)
    if res.returncode: sys.exit('build failed:\n' + res.stderr)
    return openpyxl.load_workbook(out), res.stdout

def truck_summary(wb):                             # T1..Tn rows of the top table: (load, status)
    tr = list(wb['Truck Plan'].iter_rows(values_only=True))
    end = next(i for i, r in enumerate(tr) if r[0] == 'Total')
    return [(r[5], r[6]) for r in tr[3:end]]

def truck_lines(wb):
    tr = list(wb['Truck Plan'].iter_rows(values_only=True))
    h = next(i for i, r in enumerate(tr) if r[0] == 'Truck' and i > 3)
    out = []
    for r in tr[h + 1:]:
        if not (r[0] and str(r[0]).startswith('T')): break
        out.append({'truck': r[0].split()[0], 'dist': r[1], 'plant': r[2], 'sec': r[3], 'size': r[4], 'thk': r[5],
                    'indent': r[6], 'disp': r[7], 'load': r[9]})
    return out

def main():
    fails = []
    def check(case, cond, msg):
        print(('PASS ' if cond else 'FAIL ') + f'{case}: {msg}')
        if not cond: fails.append(case)
    with tempfile.TemporaryDirectory() as tmp:
        wb, stdout = build(tmp)
        s1 = wb['Sheet1']; lines = truck_lines(wb)
        L = lambda **kw: [l for l in lines if all(l[k] == v for k, v in kw.items())]
        row = {r: [s1.cell(r, c).value for c in range(9, 14)] for r in range(4, 4 + len(INDENT))}

        check('R4 dispatch counts from any plant', not L(dist='SOUTH A', size='150x150', thk=4),
              'South A got 6.68 of 150x150 4 from Tapi -> no truck line')
        check('R5 trucks load only in-region', not L(dist='SOUTH A', size='72x72'),
              '72x72 5 exists only at Tapi -> South A gets no truck')
        check('R5 trucks load only in-region', all(l['plant'] in ('Hyderabad', 'Lepakshi') for l in lines if l['dist'] != 'WEST C')
              and all(l['plant'] in ('NPMD', 'Tapi') for l in L(dist='WEST C')), 'every line loads from its region')
        check('R5 West served from Tapi', sum(l['load'] for l in L(dist='WEST C', size='150x150')) == 4,
              'West C 150x150 4: 4 MT from Tapi (South A did not consume it)')
        check('R6 plant stock floored at 0', abs(row[6][3] - 1.61) < 0.005,
              f'25x25 2 South closing = 1.61 (Hyderabad), not -1.60; got {row[6][3]}')
        neg = [r for r in wb['Checks'].iter_rows(values_only=True) if r[0] == 'Lepakshi' and r[2] == '25x25']
        check('R6 negative listed on Checks', bool(neg), 'Lepakshi 25x25 2 (-3.21) listed as a data gap')
        a = sum(l['load'] for l in L(dist='SOUTH A', size='96x48')); b = sum(l['load'] for l in L(dist='SOUTH B', size='96x48'))
        check('R7 small lot not stranded', abs(a - 1.79) < 0.005 and b == 0,
              f'1.79 MT goes whole to A (largest qty left); got A={a}, B={b}')
        check('R2 CRFH as Black, 3 = 3.2', abs(row[9][3] - 5) < 0.005 and sum(l['load'] for l in L(dist='SOUTH B', size='50x50')) == 4,
              f'CRFH 50x50 3 sees the 5 MT held as 3.2 and loads 4; closing {row[9][3]}')
        check('R3 section from dimensions', abs(row[10][3] - 3) < 0.005, f'"SHS 80X40" read as RHS 80x40 (closing 3); got {row[10][3]}')
        check('R3 typo * and 1.5', abs(row[11][3] - 4) < 0.005, f'"60*40" 1.5 read as RHS 60x40 1.6 (closing 4); got {row[11][3]}')
        t = {}
        for l in L(dist='SOUTH A', plant='Hyderabad'): t[l['truck']] = t.get(l['truck'], 0) + l['load']
        check('R8 25 MT cap', sorted(round(v, 2) for v in t.values()) == [6.61, 25],
              f'South A at Hyderabad: 1.61 (25x25) + 30 (100x50) = 31.61 -> trucks of 25 + 6.61; got {t}')
        tot = {}
        for l in lines: tot[l['truck']] = tot.get(l['truck'], 0) + l['load']
        check('R8 25 MT cap', max(tot.values()) <= 25.0001, f'no truck over 25 MT; max {max(tot.values())}')
        summ = truck_summary(wb)
        check('R8 Full = 24 MT or more', all((st == 'Full') == (ld >= 24) for ld, st in summ),
              f'the 25 MT truck is Full, the 6.61 MT truck is a Part load; got {summ}')
        per = [round(tot[f'T{i}'], 2) for i in range(1, len(summ) + 1)]
        check('R8 truck Load is exact', [ld for ld, _ in summ] == per,
              f'each truck\'s Load cell = its lines to the 0.01 MT, so the Total row adds real loads '
              f'(Oct-26: cells rounded to 0.1 summed to 628.9 against 628.82); want {per}, got {[ld for ld, _ in summ]}')
        wb20, _ = build(tmp, '--truck-mt', '20')
        t20 = {}
        for l in truck_lines(wb20):
            if l['dist'] == 'SOUTH A' and l['plant'] == 'Hyderabad': t20[l['truck']] = t20.get(l['truck'], 0) + l['load']
        check('R8 --truck-mt override', sorted(round(v, 2) for v in t20.values()) == [11.61, 20],
              f'--truck-mt 20: the same 31.61 MT -> trucks of 20 + 11.61; got {t20}')
        check('R1 opening/production/dispatch/closing', row[12][:4] == [40, 5, 5, 40], f'100x50 2: 40 / 5 / 5 / 40; got {row[12][:4]}')
        inv = [r for r in wb['Size x Thickness'].iter_rows(values_only=True) if r[1] == '38x38']
        check('R9 inventory shows all stock', bool(inv), '38x38 2 (9 MT, nobody ordered it) appears in the Inventory grid')
        g = [r for r in wb['Grid'].iter_rows(values_only=True) if r[2] == '38x38' and r[3] == 2]
        check('R9 Grid tab shows all stock', len(g) == 1 and abs((g[0][-1] or 0) - 9) < 0.005 and all(v is None for v in g[0][4:-5]),
              f'Grid has a 38x38 2 row: no indent, closing 9; got {g}')
        # R12: grid Dispatch = own invoices up to own indent; Qty Left never negative; extras on Checks
        x = list(wb['Size x Thickness'].iter_rows(values_only=True))
        hdr = x[2]; blocks = [i for i, v in enumerate(hdr) if v == '4']        # the 4 mm column of each grid
        r150 = next(r for r in x if r[1] == '150x150')                        # first = South section
        check('R12 dispatch capped at own indent', r150[blocks[1]] == 6, f'South 150x150 4: Dispatch 6 (6.68 capped at the 6 indented); got {r150[blocks[1]]}')
        five = [i for i, v in enumerate(hdr) if v == '5']                     # the 5 mm column of each grid
        r72 = next(r for r in x if r[1] == '72x72')                           # South: A indented 6, B invoiced 2 un-indented
        check('R12 off-indent invoice not netted', r72[five[0]] == 6 and r72[five[1]] in (None, ''),
              f'South 72x72 5: Indent 6, Dispatch blank (B\'s 2.0 was never indented) -> Qty Left 6; got {r72[five[0]]} / {r72[five[1]]}')
        ckr = list(wb['Checks'].iter_rows(values_only=True))
        check('R12 extras listed on Checks', any(r[0] == 'SOUTH A' and r[2] == '150x150' and abs((r[6] or 0) - 0.68) < 0.005 for r in ckr)
              and any(r[0] == 'SOUTH B' and r[2] == '72x72' and abs((r[6] or 0) - 2.0) < 0.005 for r in ckr),
              'South A 0.68 beyond indent and South B 2.0 in an un-indented size are listed')
        check('R10 typo fixes reported', '80X40 read as RHS' in stdout and '1.5 mm read as 1.6' in stdout, 'stdout lists every correction')
    print(f'\n{len(fails)} failed' if fails else '\nall cases pass')
    sys.exit(1 if fails else 0)

main()
