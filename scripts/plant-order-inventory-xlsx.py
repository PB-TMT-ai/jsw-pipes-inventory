# ── Plant Order & Inventory summary → Excel ──
# Renders the JSON from scripts/plant-order-inventory.mjs. Layout and rules: docs/plant-order-inventory-rules.md.
# Writes the figures as numbers (formatted, not text) so the sheet can be summed and filtered.
#
# Usage: python3 -I scripts/plant-order-inventory-xlsx.py summary.json out.xlsx --data-to YYYY-MM-DD
import sys, json, argparse, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

ap = argparse.ArgumentParser()
ap.add_argument('summary'); ap.add_argument('out'); ap.add_argument('--data-to', required=True)
a = ap.parse_args()
s = json.load(open(a.summary))
asof = datetime.date.fromisoformat(s['date'])
month_label = asof.strftime('%b-%Y')

wb = Workbook(); ws = wb.active; ws.title = 'Plant summary'
NAVY = '213366'
thin = Side(style='thin', color='999999'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
hdr_font = Font(bold=True, color='FFFFFF'); hdr_fill = PatternFill('solid', fgColor=NAVY)
bold = Font(bold=True); center = Alignment(horizontal='center', vertical='center', wrap_text=True)
MT, DAYS = '#,##0.0', '#,##0'

ws['A1'] = f'Plant order & inventory summary — as of {asof.strftime("%d %b %Y")}'
ws['A1'].font = Font(bold=True, size=14, color=NAVY)
ws['A2'] = f'Live data: invoices and orders to {datetime.date.fromisoformat(a.data_to).strftime("%d %b %Y")}. All figures in MT unless marked days.'
ws['A2'].font = Font(bold=True)

# Two header rows: the four ageing buckets sit under one "Ageing of inventory" banner.
cols = ['Plant', f'BE {month_label} (region)', 'Order in hand', 'Confirmed order', 'Non-confirmed order',
        'Physical inventory', 'Days of inventory', '0–30 days', '31–60 days', '61–90 days', '90+ days']
H1, H2 = 4, 5
for c, name in enumerate(cols, 1):
    if c >= 8:
        ws.cell(H2, c, name)
    else:
        ws.cell(H1, c, name); ws.merge_cells(start_row=H1, start_column=c, end_row=H2, end_column=c)
ws.cell(H1, 8, 'Ageing of inventory (FIFO, days since production)')
ws.merge_cells(start_row=H1, start_column=8, end_row=H1, end_column=11)
for r in (H1, H2):
    for c in range(1, 12):
        cell = ws.cell(r, c); cell.font = hdr_font; cell.fill = hdr_fill; cell.alignment = center; cell.border = box

be = s['beByRegion']
r = H2 + 1
first_of_region = {}
for row in s['rows']:
    vals = [row['plant'], None, row['orderInHand'], row['confirmed'], row['nonConfirmed'], row['inventory'],
            None if row['daysCover'] is None else round(row['daysCover']), row['d0_30'], row['d31_60'], row['d61_90'], row['d90plus']]
    for c, v in enumerate(vals, 1):
        cell = ws.cell(r, c, '-' if (c == 7 and v is None) else v); cell.border = box
        if c in (3, 4, 5, 6, 8, 9, 10, 11): cell.number_format = MT
        if c == 7: cell.number_format = DAYS; cell.alignment = Alignment(horizontal='right')
    reg = row['region']
    if reg not in first_of_region:
        first_of_region[reg] = [r, r]
        cell = ws.cell(r, 2, be.get(reg, 0)); cell.number_format = MT
    else:
        first_of_region[reg][1] = r
    r += 1
# BE printed once per region, across the plants that serve it (rules P2).
for reg, (a0, a1) in first_of_region.items():
    ws.cell(a0, 2).alignment = Alignment(horizontal='center', vertical='center')
    if a1 > a0: ws.merge_cells(start_row=a0, start_column=2, end_row=a1, end_column=2)
    for rr in range(a0, a1 + 1): ws.cell(rr, 2).border = box

t = s['total']
vals = [t['plant'], t['be'], t['orderInHand'], t['confirmed'], t['nonConfirmed'], t['inventory'],
        None if t['daysCover'] is None else round(t['daysCover']), t['d0_30'], t['d31_60'], t['d61_90'], t['d90plus']]
for c, v in enumerate(vals, 1):
    cell = ws.cell(r, c, '-' if (c == 7 and v is None) else v)
    cell.font = bold; cell.border = box; cell.fill = PatternFill('solid', fgColor='F2F2F2')
    if c in (2, 3, 4, 5, 6, 8, 9, 10, 11): cell.number_format = MT
    if c == 7: cell.number_format = DAYS; cell.alignment = Alignment(horizontal='right')
total_row = r

# ── Notes ──
notes = ['Notes']
n_est = s['beEntries']
notes.append(f'BE (region): the month\'s Best Estimates, each on its distributor\'s region, printed once across the plants serving that region '
             f'(South = Nippon + Lepakshi, West = NPMD + Tapi). {month_label}: {n_est} estimate(s) entered, totalling {t["be"]:,.1f} MT.')
for reg, v in s['beOutsideServedRegions']:
    notes.append(f'BE of {v:,.1f} MT belongs to region "{reg}", which no plant serves; it is in All plants only.')
notes.append('Order in hand = Confirmed + Non-confirmed, the whole open order book (not this month only), by the order line\'s plant.')
notes.append('Confirmed = released but not invoiced, netted against invoices already matched to the line. '
             'Lines with status Delivered are not open book and are left out, including any Non-confirmed still shown on them.')
notes.append('Physical inventory = produced − invoiced, per plant per size, floored at 0 per size. Weight = tubes × SKU weight per tube.')
notes.append(f'Days of inventory = physical inventory ÷ (MT invoiced in the 30 days to {asof.strftime("%d %b")} ÷ 30).')
notes.append('Ageing: invoices drain the oldest production first (FIFO); what is left is aged from its production date. The four buckets add up to physical inventory.')
if s.get('unattributedOrders'):
    u = s['unattributedOrders']
    notes.append(f'Unattributed orders (no plant): {u["pending"]:,.1f} MT order in hand, not in any row above.')
if s.get('unattributedStock'):
    notes.append(f'Unattributed stock (no plant): {s["unattributedStock"]["fgMt"]:,.1f} MT, not in any row above.')
if not s.get('unattributedOrders') and not s.get('unattributedStock'):
    notes.append('No order or stock is unattributed: every row has a plant.')
notes.append('Rules of record: docs/plant-order-inventory-rules.md.')
nr = total_row + 2
for i, line in enumerate(notes):
    cell = ws.cell(nr + i, 1, line); cell.font = Font(bold=(i == 0))

widths = [16, 15, 13, 13, 14, 14, 12, 11, 11, 11, 11]
for i, w in enumerate(widths, 1): ws.column_dimensions[chr(64 + i)].width = w
ws.row_dimensions[H1].height = 30; ws.row_dimensions[H2].height = 30
ws.freeze_panes = ws.cell(H2 + 1, 2)

# ── Sheet 2: SKU wise (rules P11–P13). No BE: a Best Estimate carries no SKU. ──
if s.get('skuRows'):
    ws2 = wb.create_sheet('SKU wise')
    ws2['A1'] = f'SKU wise order & inventory — as of {asof.strftime("%d %b %Y")}'
    ws2['A1'].font = Font(bold=True, size=14, color=NAVY)
    ws2['A2'] = ('SKU = section + size + thickness (two ERP codes for one tube count once). '
                 'BE is on the Plant summary sheet only: it is set per distributor and has no SKU.')
    ws2['A2'].font = Font(bold=True)
    cols2 = ['Plant', 'Section', 'Size', 'Thickness (mm)', 'Order in hand', 'Confirmed order', 'Non-confirmed order',
             'Physical inventory', 'Days of inventory', '0–30 days', '31–60 days', '61–90 days', '90+ days']
    for c, name in enumerate(cols2, 1):
        if c >= 10:
            ws2.cell(H2, c, name)
        else:
            ws2.cell(H1, c, name); ws2.merge_cells(start_row=H1, start_column=c, end_row=H2, end_column=c)
    ws2.cell(H1, 10, 'Ageing of inventory (FIFO, days since production)')
    ws2.merge_cells(start_row=H1, start_column=10, end_row=H1, end_column=13)
    for rr in (H1, H2):
        for c in range(1, 14):
            cell = ws2.cell(rr, c); cell.font = hdr_font; cell.fill = hdr_fill; cell.alignment = center; cell.border = box
    MTC = (5, 6, 7, 8, 10, 11, 12, 13)
    r2 = H2 + 1
    keys = ['orderInHand', 'confirmed', 'nonConfirmed', 'inventory', 'd0_30', 'd31_60', 'd61_90', 'd90plus']
    sums = {k: 0.0 for k in keys}
    for row in s['skuRows']:
        dc = None if row['daysCover'] is None else round(row['daysCover'])
        vals = [row['plant'], row['section'] or '-', row['size'], row['thickness'], row['orderInHand'], row['confirmed'],
                row['nonConfirmed'], row['inventory'], '-' if dc is None else dc,
                row['d0_30'], row['d31_60'], row['d61_90'], row['d90plus']]
        for c, v in enumerate(vals, 1):
            cell = ws2.cell(r2, c, '-' if (c == 4 and v is None) else v); cell.border = box
            if c in MTC: cell.number_format = MT
            if c == 4 and v is not None: cell.number_format = '0.00'
            if c in (4, 9): cell.alignment = Alignment(horizontal='right')
        for k in keys: sums[k] += row[k]
        r2 += 1
    ws2.auto_filter.ref = f'A{H2}:M{r2 - 1}'
    t2 = ['All plants (sum of rows)', '', '', '', sums['orderInHand'], sums['confirmed'], sums['nonConfirmed'], sums['inventory'],
          '-' if t['daysCover'] is None else round(t['daysCover']), sums['d0_30'], sums['d31_60'], sums['d61_90'], sums['d90plus']]
    for c, v in enumerate(t2, 1):
        cell = ws2.cell(r2 + 1, c, v); cell.font = bold; cell.border = box; cell.fill = PatternFill('solid', fgColor='F2F2F2')
        if c in MTC: cell.number_format = MT
        if c == 9: cell.alignment = Alignment(horizontal='right')
    nr2 = r2 + 3
    for i, line in enumerate([
        'Notes',
        'Each plant\'s rows add up exactly to its row on the Plant summary sheet. Use the filter on row 5 to pick a plant or section.',
        'Days of inventory = this SKU\'s inventory ÷ (this SKU\'s MT invoiced from this plant in the last 30 days ÷ 30). "-" = no sale in 30 days.',
        'A SKU shown by its ERP description with Section "-" is an order code not on the SKU master; it still counts in every total.',
        'Definitions of the other columns: see the Plant summary sheet notes.',
    ]):
        ws2.cell(nr2 + i, 1, line).font = Font(bold=(i == 0))
    for i, w in enumerate([14, 9, 16, 11, 12, 12, 13, 13, 11, 10, 10, 10, 10], 1):
        ws2.column_dimensions[chr(64 + i)].width = w
    ws2.row_dimensions[H1].height = 30; ws2.row_dimensions[H2].height = 30
    ws2.freeze_panes = ws2.cell(H2 + 1, 5)

wb.save(a.out)
print(f'wrote {a.out}')
