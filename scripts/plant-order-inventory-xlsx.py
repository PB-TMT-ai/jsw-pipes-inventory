# ── Plant Order & Inventory summary → Excel (Plant summary + SKU wise) ──
# Renders the JSON from scripts/plant-order-inventory.mjs. Layout and rules: docs/plant-order-inventory-rules.md.
# Figures are written as numbers (formatted, not text) so the sheet can be summed and filtered.
#
# Usage: python3 -I scripts/plant-order-inventory-xlsx.py summary.json out.xlsx --data-to "invoices and orders to 5 Nov, production to 4 Nov"
import json, argparse, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ap = argparse.ArgumentParser()
ap.add_argument('summary'); ap.add_argument('out'); ap.add_argument('--data-to', required=True)
a = ap.parse_args()
s = json.load(open(a.summary))
asof = datetime.date.fromisoformat(s['date'])
month_label = asof.strftime('%b-%Y')
open_label = (datetime.date.fromisoformat(s['monthStart'])).strftime('%d %b')

NAVY = '213366'
thin = Side(style='thin', color='999999'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
hdr_font = Font(bold=True, color='FFFFFF'); hdr_fill = PatternFill('solid', fgColor=NAVY)
tot_fill = PatternFill('solid', fgColor='F2F2F2')
bold = Font(bold=True); center = Alignment(horizontal='center', vertical='center', wrap_text=True)
right = Alignment(horizontal='right')
MT, DAYS = '#,##0.0;[Red]-#,##0.0', '#,##0'
H1, H2 = 4, 5

# The columns after the identity columns, shared by both sheets. kind: mt | days.
BODY = [
    ('orderInHand', 'Order in hand', 'mt'), ('confirmed', 'Confirmed order', 'mt'),
    ('nonConfirmed', 'Non-confirmed order', 'mt'), ('available', 'Available inventory', 'mt'),
    ('wip', 'WIP (Coil + Slit)', 'mt'), ('coilShort', 'Coil not available', 'mt'),
    ('opening', f'Opening inventory ({open_label})', 'mt'), ('inventory', 'Physical inventory', 'mt'),
    ('daysCover', 'Days of inventory', 'days'),
    ('d0_30', '0–30 days', 'mt'), ('d31_60', '31–60 days', 'mt'), ('d61_90', '61–90 days', 'mt'), ('d90plus', '90+ days', 'mt'),
]
AGE_FROM = len(BODY) - 4       # index in BODY where the four ageing buckets start


def headers(ws, ident, relabel=None):
    relabel = relabel or {}
    cols = ident + [relabel.get(key, label) for key, label, _ in BODY]
    age_col = len(ident) + AGE_FROM + 1
    for c, name in enumerate(cols, 1):
        if c >= age_col:
            ws.cell(H2, c, name)
        else:
            ws.cell(H1, c, name); ws.merge_cells(start_row=H1, start_column=c, end_row=H2, end_column=c)
    ws.cell(H1, age_col, 'Ageing of inventory (FIFO, days since production)')
    ws.merge_cells(start_row=H1, start_column=age_col, end_row=H1, end_column=len(cols))
    for r in (H1, H2):
        for c in range(1, len(cols) + 1):
            cell = ws.cell(r, c); cell.font = hdr_font; cell.fill = hdr_fill; cell.alignment = center; cell.border = box
    ws.row_dimensions[H1].height = 32; ws.row_dimensions[H2].height = 32
    return len(cols)


def body(ws, r, c0, row, *, blank=(), unknown=(), font=None, fill=None):
    for i, (key, _, kind) in enumerate(BODY):
        c = c0 + i
        v = row.get(key)
        if key in blank: v = ''
        elif key in unknown and v is None: v = '?'
        elif kind == 'days': v = '-' if v is None else round(v)
        cell = ws.cell(r, c, v); cell.border = box
        if isinstance(v, (int, float)): cell.number_format = MT if kind == 'mt' else DAYS
        if kind == 'days' or isinstance(v, str): cell.alignment = right
        if font: cell.font = font
        if fill: cell.fill = fill


def title(ws, text, sub):
    ws['A1'] = text; ws['A1'].font = Font(bold=True, size=14, color=NAVY)
    ws['A2'] = sub; ws['A2'].font = Font(bold=True)


def notes(ws, start, lines):
    for i, line in enumerate(['Notes'] + lines):
        ws.cell(start + i, 1, line).font = Font(bold=(i == 0))


wb = Workbook()
# ── Sheet 1: Plant summary ──
ws = wb.active; ws.title = 'Plant summary'
title(ws, f'Plant order & inventory summary — as of {asof.strftime("%d %b %Y")}',
      f'Live data: {a.data_to}. All figures in MT unless marked days. Red = negative.')
NC = ' (SKUs with non-confirmed)'
ncols = headers(ws, ['Plant', f'BE {month_label} (region)'],
               {'available': 'Available inventory' + NC, 'wip': 'WIP (Coil + Slit)' + NC, 'coilShort': 'Coil not available' + NC})
be = s['beByRegion']
r = H2 + 1
span = {}
for row in s['rows']:
    ws.cell(r, 1, row['plant']).border = box
    body(ws, r, 3, row)
    reg = row['region']
    if reg not in span:
        span[reg] = [r, r]; cell = ws.cell(r, 2, be.get(reg, 0)); cell.number_format = MT
    else:
        span[reg][1] = r
    r += 1
for reg, (a0, a1) in span.items():   # BE printed once per region, across the plants serving it (P2)
    ws.cell(a0, 2).alignment = Alignment(horizontal='center', vertical='center')
    if a1 > a0: ws.merge_cells(start_row=a0, start_column=2, end_row=a1, end_column=2)
    for rr in range(a0, a1 + 1): ws.cell(rr, 2).border = box
t = s['total']
for c, v in ((1, t['plant']), (2, t['be'])):
    cell = ws.cell(r, c, v); cell.font = bold; cell.border = box; cell.fill = tot_fill
    if c == 2: cell.number_format = MT
body(ws, r, 3, t, font=bold, fill=tot_fill)

lines = [
    f'BE (region): the month\'s Best Estimates, each on its distributor\'s region, printed once across the plants serving that region '
    f'(South = Nippon + Lepakshi, West = NPMD + Tapi). {month_label}: {s["beEntries"]} estimate(s) entered, totalling {t["be"]:,.1f} MT.',
]
for reg, v in s['beOutsideServedRegions']:
    lines.append(f'BE of {v:,.1f} MT belongs to region "{reg}", which no plant serves; it is in All plants only.')
lines += [
    'Order in hand = Confirmed + Non-confirmed, the whole open order book (not this month only), by the order line\'s plant.',
    'Confirmed = released but not invoiced, netted against invoices already matched to the line. Lines with status Delivered are '
    'not open book and are left out, including any Non-confirmed still shown on them.',
    'Available inventory, WIP and Coil not available on this sheet count ONLY the SKUs that carry a Non-confirmed order: '
    + ', '.join(f'{r["plant"]} {r["ncSkus"]}' for r in s['rows']) + f' SKUs ({t["ncSkus"]} in all). The SKU wise sheet shows every SKU.',
    'Available inventory = Physical inventory − Confirmed order, summed over those SKUs. Negative (red) = more confirmed than is on the floor.',
    'WIP (Coil + Slit) = mother coil not yet slit + slit (baby) coil not yet used, in every coil gauge that can roll at least one of those SKUs '
    '(each coil counted once). All WIP at the plant, whatever its gauge: '
    + ', '.join(f'{r["plant"]} {r["wipAll"]:,.1f}' for r in s['rows']) + f' MT ({t["wipAll"]:,.1f} in all).',
    'Coil not available = order in hand that neither finished stock nor coil of a usable thickness at the plant can cover '
    '(mill RM→FG thickness sheet; coil width not matched; 1 MT coil = 1 MT pipe), summed over those SKUs. '
    'Coil is placed across all open orders first, confirmed included, so a confirmed-only SKU still takes its share of coil.',
    f'Opening inventory = finished stock at close of {(datetime.date.fromisoformat(s["monthStart"]) - datetime.timedelta(days=1)).strftime("%d %b")}: '
    'produced − invoiced before the 1st, floored at 0 per size.',
    'Physical inventory = produced − invoiced, per plant per size, floored at 0 per size. Weight = tubes × SKU weight per tube.',
    f'Days of inventory = physical inventory ÷ (MT invoiced in the 30 days to {asof.strftime("%d %b")} ÷ 30).',
    'Ageing: invoices drain the oldest production first (FIFO); what is left is aged from its production date. The four buckets add up to physical inventory.',
]
unk = sum(x['ncUnknownThk'] for x in s['extra'].values())
if unk > 0.0005:
    lines.append(f'WIP and Coil not available leave out {unk:,.1f} MT of Non-confirmed on SKUs not in the SKU master (thickness unknown, shown "?" on the SKU sheet).')
for pid, x in s['extra'].items():
    for g in x['noGauge']:
        lines.append(f'{pid}: {g["sku"]} has no coil gauge on the mill thickness sheet; its {g["need"]:,.1f} MT need is all "Coil not available".')
    for w in x['wipNoFg']:
        lines.append(f'{pid}: {w["mt"]:,.1f} MT of {w["gauge"]} mm coil is in WIP but rolls no pipe thickness on the mill sheet.')
if s.get('unattributedOrders'):
    lines.append(f'Unattributed orders (no plant): {s["unattributedOrders"]["pending"]:,.1f} MT order in hand, not in any row above.')
if s.get('unattributedStock'):
    lines.append(f'Unattributed stock (no plant): {s["unattributedStock"]["fgMt"]:,.1f} MT, not in any row above.')
if not s.get('unattributedOrders') and not s.get('unattributedStock'):
    lines.append('No order, stock or coil is unattributed: every row has a plant.')
lines.append('Rules of record: docs/plant-order-inventory-rules.md.')
notes(ws, r + 2, lines)
for i, w in enumerate([16, 14] + [12] * len(BODY), 1): ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = ws.cell(H2 + 1, 2)

# ── Sheet 2: SKU wise (P11–P17). No BE: a Best Estimate carries no SKU. ──
ws2 = wb.create_sheet('SKU wise')
title(ws2, f'SKU wise order & inventory — as of {asof.strftime("%d %b %Y")}',
      'SKU = section + size + thickness (two ERP codes for one tube count once). BE is on the Plant summary sheet only: it is set per distributor and has no SKU.')
ncols2 = headers(ws2, ['Plant', 'Section', 'Size', 'Thickness (mm)'])
r2 = H2 + 1
for row in s['skuRows']:
    vals = [row['plant'], row['section'] or '-', row['size'], '-' if row['thickness'] is None else row['thickness']]
    for c, v in enumerate(vals, 1):
        cell = ws2.cell(r2, c, v); cell.border = box
        if c == 4: cell.alignment = right; cell.number_format = '0.00' if isinstance(v, float) or isinstance(v, int) else 'General'
    body(ws2, r2, 5, row, unknown=('wip', 'coilShort'))
    r2 += 1
ws2.auto_filter.ref = f'A{H2}:{get_column_letter(ncols2)}{r2 - 1}'
for c in range(1, 5):
    cell = ws2.cell(r2 + 1, c, 'All plants (sum of rows)' if c == 1 else ''); cell.font = bold; cell.border = box; cell.fill = tot_fill
# The SKU sheet's bottom row is the sum of ITS OWN rows (P12) — never the plant sheet's All plants,
# whose Available / Coil not available count only SKUs with Non-confirmed (P18).
sku_tot = {k: sum(r[k] or 0 for r in s['skuRows']) for k, _, kind in BODY if kind == 'mt'}
sku_tot['daysCover'] = t['daysCover']
assert abs(sku_tot['inventory'] - t['inventory']) < 0.001 and abs(sku_tot['orderInHand'] - t['orderInHand']) < 0.001
body(ws2, r2 + 1, 5, sku_tot, blank=('wip',), font=bold, fill=tot_fill)
notes(ws2, r2 + 3, [
    'Each plant\'s rows add up exactly to its row on the Plant summary sheet, except three columns: there, Available inventory and Coil not available '
    'add only the rows with Non-confirmed above 0, and WIP does not add (see below). Use the filter on row 5 to pick a plant or section.',
    'WIP on a SKU row = the plant\'s coil (unslit mother + unused slit) in every gauge that can roll this SKU\'s thickness. '
    'The same coil repeats on every SKU of that thickness, so this column does not add up; the plant total is on the Plant summary sheet.',
    'Coil not available on a SKU row: per plant, thinnest pipe first, each thickness takes its own coil gauge first, then other usable gauges; '
    'what a thickness still lacks is shared across its SKUs by each SKU\'s need (order in hand − physical inventory).',
    'Days of inventory = this SKU\'s inventory ÷ (this SKU\'s MT invoiced from this plant in the last 30 days ÷ 30). "-" = no sale in 30 days.',
    'A SKU shown by its ERP description with Section "-" is an order code not on the SKU master; it counts in every total, '
    'but its thickness is unknown, so WIP and Coil not available read "?".',
    'Definitions of the other columns: see the Plant summary sheet notes.',
])
for i, w in enumerate([14, 9, 16, 11] + [12] * len(BODY), 1): ws2.column_dimensions[get_column_letter(i)].width = w
ws2.freeze_panes = ws2.cell(H2 + 1, 5)

wb.save(a.out)
print(f'wrote {a.out}')
