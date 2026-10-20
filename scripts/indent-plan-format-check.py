# ── Format check for scripts/indent-plan.py output ──
#
# The indent workbook's LOOK is part of the deliverable (approved by the user, Oct 2026): fonts,
# font sizes, fills, borders, number formats, column widths and row heights. This compares an
# output against the approved snapshot in scripts/indent-plan-format.json, cell ROLE by cell ROLE
# (title, block header, thickness header, body, total, truck rows…), so it holds for any indent
# whatever its number of sizes.
#
# Usage:
#   python3 scripts/indent-plan-format-check.py OUT.xlsx              -> exit 1 on any difference
#   python3 scripts/indent-plan-format-check.py OUT.xlsx --snapshot   -> rewrite the approved snapshot
#                                                                       (only when the user approves a new look)
import sys, os, json, openpyxl

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'indent-plan-format.json')

def find_row(ws, col, pred, start=1):
    for r in range(start, ws.max_row + 1):
        if pred(ws.cell(r, col).value): return r
    raise SystemExit(f'{ws.title}: no row matches in column {col}')

def roles(wb):
    """role name -> (sheet, cell address); located by content so row counts can vary."""
    out = {}
    s1 = wb['Sheet1']
    out['sheet1.new_header'] = ('Sheet1', 'I3'); out['sheet1.region_header'] = ('Sheet1', 'M3')
    out['sheet1.new_body'] = ('Sheet1', 'I4')
    out['grid.header'] = ('Grid', 'A1'); out['grid.header_num'] = ('Grid', 'E1'); out['grid.body_num'] = ('Grid', 'E2')
    g = wb['Grid']; tr = find_row(g, 1, lambda v: v == 'Total')
    out['grid.total'] = ('Grid', f'A{tr}')
    x = wb['Size x Thickness']
    out['sxt.title'] = ('Size x Thickness', 'A1')
    out['sxt.corner'] = ('Size x Thickness', 'A2')
    out['sxt.block_header'] = ('Size x Thickness', 'C2')
    out['sxt.thk_header'] = ('Size x Thickness', 'C3')
    out['sxt.body_label'] = ('Size x Thickness', 'A4')
    out['sxt.body_num'] = ('Size x Thickness', 'C4')
    tcol = next(c for c in range(3, x.max_column + 1) if x.cell(3, c).value == 'Total')
    out['sxt.body_total'] = ('Size x Thickness', f'{openpyxl.utils.get_column_letter(tcol)}4')
    sr = find_row(x, 2, lambda v: isinstance(v, str) and v.endswith(' total'))
    out['sxt.region_total'] = ('Size x Thickness', f'C{sr}')
    t = wb['Truck Plan']
    out['truck.title'] = ('Truck Plan', 'A1'); out['truck.header'] = ('Truck Plan', 'A3')
    out['truck.row_id'] = ('Truck Plan', 'A4'); out['truck.row_name'] = ('Truck Plan', 'B4'); out['truck.row_load'] = ('Truck Plan', 'F4')
    dr = find_row(t, 1, lambda v: v == 'Truck', start=5)
    out['truck.detail_header'] = ('Truck Plan', f'A{dr}')
    out['truck.detail_num'] = ('Truck Plan', f'G{dr + 1}')
    return out

def sig(ws, addr):
    c = ws[addr]
    rgb = lambda col: (col.rgb[-6:] if col is not None and isinstance(col.rgb, str) else None)
    return {'font': c.font.name, 'size': c.font.sz, 'bold': bool(c.font.b), 'italic': bool(c.font.i),
            'fill': rgb(c.fill.fgColor) if c.fill.fill_type == 'solid' else None,
            'numfmt': c.number_format, 'halign': c.alignment.horizontal,
            'border': c.border.left.style, 'border_color': rgb(c.border.left.color),
            'row_height': ws.row_dimensions[c.row].height}

def widths(ws, upto):
    return {k: round(v.width, 2) for k, v in ws.column_dimensions.items()
            if openpyxl.utils.column_index_from_string(k) <= upto}

def snapshot(path):
    wb = openpyxl.load_workbook(path)
    cells = {role: sig(wb[sh], a) for role, (sh, a) in roles(wb).items()}
    w = {'Sheet1': widths(wb['Sheet1'], 13), 'Grid': widths(wb['Grid'], 4),
         'Size x Thickness': widths(wb['Size x Thickness'], 16), 'Truck Plan': widths(wb['Truck Plan'], 11)}
    views = {n: {'freeze': wb[n].freeze_panes, 'zoom': wb[n].sheet_view.zoomScale} for n in ('Grid', 'Size x Thickness', 'Truck Plan')}
    return {'cells': cells, 'widths': w, 'views': views}

if __name__ == '__main__':
    out, snap = sys.argv[1], '--snapshot' in sys.argv
    got = snapshot(out)
    if snap:
        json.dump(got, open(SPEC, 'w'), indent=1, sort_keys=True); print(f'snapshot written: {SPEC}'); sys.exit(0)
    want = json.load(open(SPEC)); diffs = []
    for role, w in want['cells'].items():
        for k, v in w.items():
            if got['cells'].get(role, {}).get(k) != v: diffs.append(f'{role}.{k}: want {v!r}, got {got["cells"].get(role, {}).get(k)!r}')
    for sh, cols in want['widths'].items():
        for col, v in cols.items():
            if got['widths'][sh].get(col) != v: diffs.append(f'{sh} column {col} width: want {v}, got {got["widths"][sh].get(col)}')
    for sh, v in want['views'].items():
        if got['views'][sh] != v: diffs.append(f'{sh} view: want {v}, got {got["views"][sh]}')
    print('\n'.join(diffs) if diffs else 'format OK — matches the approved snapshot')
    sys.exit(1 if diffs else 0)
