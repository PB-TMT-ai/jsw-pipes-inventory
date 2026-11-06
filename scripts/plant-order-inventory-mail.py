# ── Plant Order & Inventory → Outlook-ready HTML mail body ──
# Renders the SAME summary JSON the verified Excel is built from (scripts/plant-order-inventory.mjs),
# so the mail cannot disagree with its attachment. Open the file in a browser, Ctrl+A, Ctrl+C, paste
# into a new Outlook mail, attach the Excel.
#
# Outlook-safe on purpose (as the Inventory Snapshot page, docs/inventory-dashboard-rules.md
# "Display"): tables and inline styles only, no CSS classes, no flex/grid, no images, no grey text.
#
# Usage: python3 -I scripts/plant-order-inventory-mail.py summary.json out.html --data-to "…" --attachment NAME.xlsx
import json, argparse, datetime, html

ap = argparse.ArgumentParser()
ap.add_argument('summary'); ap.add_argument('out')
ap.add_argument('--data-to', required=True); ap.add_argument('--attachment', required=True)
ap.add_argument('--top', type=int, default=10)
ap.add_argument('--table-only', action='store_true', help='one table + notes, no SKU lists (user, 6 Nov 2026)')
ap.add_argument('--preview', action='store_true', help='mark the page as a layout preview with unverified figures')
a = ap.parse_args()
s = json.load(open(a.summary))
asof = datetime.date.fromisoformat(s['date'])
month_label = asof.strftime('%b-%Y')
rows, t, sku = s['rows'], s['total'], s['skuRows']

NAVY, BORDER = '#213366', '#999999'
RED, AMBER, GREEN = '#B71C1C', '#F2B705', '#1B5E20'
FONT = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif"
esc = html.escape


def mt(v, nd=0):
    if v is None: return '?'
    # half away from zero (Excel's rounding), not Python's half-to-even
    q = 10 ** nd
    r = (int(abs(v) * q + 0.5 + 1e-9) / q) * (1 if v >= 0 else -1)
    if abs(r) < 0.5 * 10 ** -nd: r = 0
    txt = f'{abs(r):,.{nd}f}'
    return f'-{txt}' if r < 0 else txt


def days(v):
    return '-' if v is None else f'{round(v):,}'


def cover_band(inv, d):
    # Inventory Snapshot S6: Red < 7, Green 7–45, Amber > 45; stock with no sale = Amber.
    if d is None: return 'amber' if inv > 0.0005 else None
    if d < 7: return 'red'
    return 'amber' if d > 45 else 'green'


BAND = {'red': f'background:{RED};color:#FFFFFF;', 'amber': f'background:{AMBER};color:#000000;',
        'green': f'background:{GREEN};color:#FFFFFF;'}
TD = f'border:1px solid {BORDER};padding:4px 8px;font-family:{FONT};font-size:14px;font-weight:bold;color:#000000;'
TH = f'border:1px solid {BORDER};padding:4px 8px;font-family:{FONT};font-size:13px;font-weight:bold;color:#FFFFFF;background:{NAVY};text-align:center;'


def td(v, *, num=True, band=None, neg=False, extra='', rowspan=1, bg=None):
    style = TD + ('text-align:right;' if num else 'text-align:left;white-space:nowrap;') + extra
    if band: style += BAND[band]
    elif bg: style += f'background:{bg};'
    if neg and not band: style += f'color:{RED};'
    rs = f' rowspan="{rowspan}"' if rowspan > 1 else ''
    return f'<td{rs} style="{style}">{esc(str(v))}</td>'


def th(v, colspan=1, rowspan=1):
    cs = f' colspan="{colspan}"' if colspan > 1 else ''
    rs = f' rowspan="{rowspan}"' if rowspan > 1 else ''
    return f'<th{cs}{rs} style="{TH}">{esc(v)}</th>'


def table(inner):
    return f'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 14px 0;">{inner}</table>'


def p(text, *, bold=False, size=15, color='#000000', margin='0 0 10px 0'):
    return f'<p style="font-family:{FONT};font-size:{size}px;color:{color};margin:{margin};{"font-weight:bold;" if bold else ""}">{text}</p>'


def h(text):
    return p(esc(text), bold=True, size=17, color=NAVY, margin='18px 0 4px 0')


def sku_label(r):
    if not r['mapped']: return r['size']
    return f'{r["section"]} {r["size"]} × {r["thickness"]:g}'


short_name = lambda r: r['plant'].split(' (')[0]

# ── Highlights: every number below is read off the same rows the tables print ──
nc_short = sorted([r for r in rows if r['coilShort'] > 0.5], key=lambda r: -r['coilShort'])
aged = [r for r in rows if r['d90plus'] > 0.5]
worst_cover = max(rows, key=lambda r: -1 if r['daysCover'] is None else r['daysCover'])
bul = [
    f'<b>Order book:</b> {mt(t["orderInHand"])} MT in hand – {mt(t["confirmed"])} MT confirmed, {mt(t["nonConfirmed"])} MT non-confirmed.',
    f'<b>Non-confirmed orders vs stock:</b> only {mt(t["available"])} MT of the {mt(t["nonConfirmed"])} MT non-confirmed can be served '
    f'from finished stock today. A further {mt(t["coilShort"])} MT cannot be covered by stock or by coil of the right thickness at the plant'
    + (': ' + ', '.join(f'{short_name(r)} {mt(r["coilShort"])}' for r in nc_short) if nc_short else '') + '.',
    f'<b>Finished stock vs order book:</b> {mt(t["inventory"])} MT physical inventory ({days(t["daysCover"])} days of sales). '
    f'{short_name(worst_cover)} holds {mt(worst_cover["inventory"])} MT ({days(worst_cover["daysCover"])} days), yet only '
    f'{mt(worst_cover["available"])} MT of it matches its {mt(worst_cover["nonConfirmed"])} MT of non-confirmed orders.',
    f'<b>Ageing:</b> {mt(t["d90plus"])} MT of finished stock is older than 90 days'
    + (f', all at {short_name(aged[0])}.' if len(aged) == 1 else ': ' + ', '.join(f'{short_name(r)} {mt(r["d90plus"])}' for r in aged) + '.' if aged else '.'),
    f'<b>WIP (coil + slit):</b> {mt(t["wipAll"])} MT across plants; {mt(t["wip"])} MT of it is in thicknesses that can make a non-confirmed SKU.',
]
# BE: say how many estimates exist — "total 0" is not "none entered" (checker FAIL, 6 Nov 2026).
if s['beEntries'] == 0:
    bul.append(f'<b>BE</b> for {month_label} has not been entered yet, so the BE column reads 0.')
elif t['be'] < 0.0005:
    n = s['beEntries']
    bul.append(f'<b>BE</b> for {month_label}: only {n} estimate{"s" if n > 1 else ""} entered, totalling 0 MT, so the BE column reads 0.')

# ── Table 1: plant summary (same columns as the Excel Plant summary sheet) ──
COLS = [('orderInHand', 'Order in hand'), ('confirmed', 'Confirmed'), ('nonConfirmed', 'Non-confirmed'),
        ('available', 'Available*'), ('wip', 'Coil + Slit for non-confirmed*'), ('coilShort', 'Coil not available*'),
        ('ftl', 'FTL (25 MT trucks)'),
        ('opening', f'Opening ({datetime.date.fromisoformat(s["monthStart"]).strftime("%d %b")})'), ('inventory', 'Physical inventory')]
AGE = [('d0_30', '0–30'), ('d31_60', '31–60'), ('d61_90', '61–90'), ('d90plus', '90+')]
head = '<tr>' + th('Plant', rowspan=2) + th(f'BE {month_label} (region)', rowspan=2) + ''.join(th(l, rowspan=2) for _, l in COLS) \
       + th('Days of inventory', rowspan=2) + th('Ageing of inventory (days)', colspan=4) + '</tr>' \
       + '<tr>' + ''.join(th(l) for _, l in AGE) + '</tr>'
body, seen = '', {}
for r in rows:
    reg = r['region']
    span = sum(1 for x in rows if x['region'] == reg)
    be_cell = '' if reg in seen else td(mt(s['beByRegion'].get(reg, 0)), rowspan=span, extra='vertical-align:middle;text-align:center;')
    seen[reg] = True
    body += '<tr>' + td(r['plant'], num=False) + be_cell \
        + ''.join(td(mt(r[k]), neg=r[k] < -0.5) for k, _ in COLS) \
        + td(days(r['daysCover']), band=cover_band(r['inventory'], r['daysCover'])) \
        + ''.join(td(mt(r[k]), band='red' if k == 'd90plus' and r[k] > 0.5 else None) for k, _ in AGE) + '</tr>'
body += '<tr>' + td(t['plant'], num=False, bg='#F2F2F2') + td(mt(t['be']), bg='#F2F2F2') \
    + ''.join(td(mt(t[k]), bg='#F2F2F2', neg=t[k] < -0.5) for k, _ in COLS) \
    + td(days(t['daysCover']), band=cover_band(t['inventory'], t['daysCover'])) \
    + ''.join(td(mt(t[k]), bg='#F2F2F2', band='red' if k == 'd90plus' and t[k] > 0.5 else None) for k, _ in AGE) + '</tr>'
plant_table = table(head + body)

# ── Table 2: biggest coil shortfalls (SKU) ──
def topn(rows_, key):
    rows_ = sorted(rows_, key=lambda r: (-r[key], r['plant']))
    if len(rows_) <= a.top: return rows_
    cut = round(rows_[a.top - 1][key], 1)
    return [r for i, r in enumerate(rows_) if i < a.top or round(r[key], 1) == cut]   # ties at the cut all shown


short_rows = topn([r for r in sku if (r['coilShort'] or 0) > 0.05], 'coilShort')
t2 = '<tr>' + ''.join(th(x) for x in ['Plant', 'SKU', 'Order in hand', 'Non-confirmed', 'Physical inventory', 'WIP (usable thickness)', 'Coil not available']) + '</tr>'
for r in short_rows:
    t2 += '<tr>' + td(short_name(r), num=False) + td(sku_label(r), num=False) + td(mt(r['orderInHand'], 1)) + td(mt(r['nonConfirmed'], 1)) \
        + td(mt(r['inventory'], 1)) + td(mt(r['wip'], 1)) + td(mt(r['coilShort'], 1), band='red') + '</tr>'

# ── Table 3: non-confirmed that stock can serve now ──
avail_rows = topn([r for r in sku if r['available'] > 0.05], 'available')
t3 = '<tr>' + ''.join(th(x) for x in ['Plant', 'SKU', 'Non-confirmed', 'Physical inventory', 'Confirmed', 'Available now']) + '</tr>'
for r in avail_rows:
    t3 += '<tr>' + td(short_name(r), num=False) + td(sku_label(r), num=False) + td(mt(r['nonConfirmed'], 1)) + td(mt(r['inventory'], 1)) \
        + td(mt(r['confirmed'], 1)) + td(mt(r['available'], 1), band='green') + '</tr>'

# ── Table 4: stock older than 90 days ──
old_rows = topn([r for r in sku if r['d90plus'] > 0.05], 'd90plus')
t4 = '<tr>' + ''.join(th(x) for x in ['Plant', 'SKU', 'Physical inventory', 'Older than 90 days', 'Order in hand', 'Days of inventory']) + '</tr>'
for r in old_rows:
    t4 += '<tr>' + td(short_name(r), num=False) + td(sku_label(r), num=False) + td(mt(r['inventory'], 1)) + td(mt(r['d90plus'], 1), band='red') \
        + td(mt(r['orderInHand'], 1)) + td(days(r['daysCover']), band=cover_band(r['inventory'], r['daysCover'])) + '</tr>'

n_short = sum(1 for r in sku if (r['coilShort'] or 0) > 0.05)
n_avail = sum(1 for r in sku if r['available'] > 0.05)
n_old = sum(1 for r in sku if r['d90plus'] > 0.05)
of = lambda n, shown: (f' (top {shown} of {n}' + (', ties at the cut included' if shown > a.top else '') + ')') if n > shown else ''

unk = sum(x['ncUnknownThk'] for x in s['extra'].values())
notes = [
    '* Available, WIP and Coil not available are counted only for SKUs that have a non-confirmed order. '
    'Available = stock left after confirmed orders, capped at the SKU\'s non-confirmed order.',
    'Coil not available = order in hand that neither finished stock nor coil of a usable thickness at the plant can cover '
    '(mill coil-to-pipe thickness sheet; coil width not matched; 1 MT coil = 1 MT pipe).',
    'Days of inventory: Red under 7 days, Green 7 to 45, Amber over 45 or no sale in 30 days.',
]
if unk > 0.0005:
    notes.append(f'{mt(unk)} MT of non-confirmed orders are on item codes not yet in the SKU master; their coil check is shown as "?".')
notes.append(f'Full detail, size by size, is in the attached file {esc(a.attachment)} (sheet "SKU wise").')

doc = f'''<!doctype html>
<html><head><meta charset="utf-8"><title>P&amp;T Order &amp; Inventory – {asof.strftime("%d %b %Y")}</title></head>
<body style="margin:16px;background:#FFFFFF;">
<div style="max-width:1300px;">
{p("<b>Subject:</b> P&amp;T Plant-wise Order &amp; Inventory Status – as of " + asof.strftime("%d %b %Y"), size=14, margin="0 0 16px 0")}
{p("Dear Sir / Team,")}
{p("Please find below and attached the plant-wise and SKU-wise order and inventory status for Pipes &amp; Tubes, as of close of "
   + asof.strftime("%d %b %Y") + " (" + esc(a.data_to) + ").")}
{h("Key highlights (MT)")}
<ol style="font-family:{FONT};font-size:15px;color:#000000;margin:0 0 10px 0;padding-left:22px;">
{"".join(f'<li style="margin:0 0 6px 0;">{x}</li>' for x in bul)}
</ol>
{h("1. Plant summary (MT)")}
{plant_table}
{h("2. SKUs short of coil" + of(n_short, len(short_rows)))}
{table(t2)}
{h("3. Non-confirmed orders stock can serve now" + of(n_avail, len(avail_rows)))}
{table(t3)}
{h("4. Finished stock older than 90 days" + of(n_old, len(old_rows)))}
{table(t4)}
{"".join(p(esc(x), size=13, margin="0 0 4px 0") for x in notes)}
{p("Regards,<br>[Your name]", margin="18px 0 0 0")}
</div></body></html>
'''
if a.table_only:
    COLS1 = [('inventory', 'Physical inventory'), ('orderInHand', 'Order in hand'), ('confirmed', 'Confirmed'), ('nonConfirmed', 'Non-confirmed'),
             ('available', 'Available*'), ('wip', 'Coil + Slit for non-confirmed*'), ('coilShort', 'Coil not available*'),
             ('ftl', 'FTL (25 MT trucks)'), ('opening', f'Opening ({datetime.date.fromisoformat(s["monthStart"]).strftime("%d %b")})')]
    head1 = '<tr>' + th('Plant', rowspan=2) + ''.join(th(l, rowspan=2) for _, l in COLS1) \
        + th('Days of inventory', rowspan=2) + th('Ageing of inventory (days)', colspan=4) + '</tr>' \
        + '<tr>' + ''.join(th(l) for _, l in AGE) + '</tr>'
    def row1(r, total=False):
        bg = '#F2F2F2' if total else None
        return '<tr>' + td(r['plant'], num=False, bg=bg) \
            + ''.join(td(mt(r[k]), neg=r[k] < -0.5, bg=bg) for k, _ in COLS1) \
            + td(days(r['daysCover']), band=cover_band(r['inventory'], r['daysCover'])) \
            + ''.join(td(mt(r[k]), bg=bg, band='red' if k == 'd90plus' and r[k] > 0.5 else None) for k, _ in AGE) + '</tr>'
    plant_table = table(head1 + ''.join(row1(r) for r in rows) + row1(t, total=True))
    near = [(short_name(r), d) for r in rows for d in s['extra'][r['plantId']]['ftl']['byDist'] if d['trucks'] == 0 and d['mt'] >= 15]
    per_plant_unk = [(short_name(r), s['extra'][r['plantId']]['ncUnknownThk']) for r in rows if s['extra'][r['plantId']]['ncUnknownThk'] > 0.0005]
    tnotes = [
        'Order in hand = Confirmed + Non-confirmed, the whole open order book by the order line\'s plant; lines with status Delivered are left out. '
        'Confirmed = released, not yet invoiced (net of invoices already matched to the line).',
        '* Counted for SKUs with a non-confirmed order. For each plant: Non-confirmed = Available + Coil + Slit for non-confirmed + Coil not available'
        + (', plus orders on item codes not yet in the SKU master (' + ', '.join(f'{n} {mt(v)} MT' for n, v in per_plant_unk) + '), whose coil cannot be checked.'
           if per_plant_unk else '.') + ' Figures are rounded, so a row can differ by 1.',
        'Available = finished stock left after confirmed orders, capped at the non-confirmed order. '
        'Coil + Slit for non-confirmed = unslit and slit coil of a usable thickness that would make the rest. Coil not available = the part that needs fresh coil.',
        'FTL = full 25 MT trucks loadable today from finished stock against open orders (confirmed and non-confirmed), one distributor per truck; 24 MT or more counts as full.',
    ]
    if near:
        tnotes.append('Near-full loads (15 MT or more, not yet a full truck): ' + '; '.join(f'{pl} – {d["name"]} {d["mt"]:.1f} MT' for pl, d in near) + '.')
    tnotes.append(f'Opening = finished stock at close of {(datetime.date.fromisoformat(s["monthStart"]) - datetime.timedelta(days=1)).strftime("%d %b")}. '
                  'Physical inventory = produced − invoiced, per size, never below 0. Ageing = days since production, oldest stock assumed shipped first.')
    tnotes.append(f'Days of inventory = physical inventory ÷ average daily invoicing over the last 30 days. Red under 7 days, Green 7 to 45, Amber over 45 or no sale in 30 days. '
                  'Ageing over 90 days in red.')
    if not s.get('unattributedOrders') and not s.get('unattributedStock'):
        tnotes.append('Every order, stock and coil row has a plant: nothing is unattributed.')
    banner = (p('LAYOUT PREVIEW – figures not yet independently verified', bold=True, size=14, color='#B71C1C', margin='0 0 12px 0') if a.preview else '')
    doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>P&amp;T Order &amp; Inventory – {asof.strftime("%d %b %Y")}</title></head>
<body style="margin:16px;background:#FFFFFF;">
<div style="max-width:1400px;">
{banner}
{h("P&T plant-wise order & inventory – as of " + asof.strftime("%d %b %Y") + " (MT)")}
{p("Data: " + esc(a.data_to) + ".", size=13, margin="0 0 4px 0")}
{plant_table}
{"".join(p(esc(x), size=13, margin="0 0 4px 0") for x in tnotes)}
</div></body></html>
"""
open(a.out, 'w').write(doc)
print(f'wrote {a.out}: {n_short} short SKUs, {n_avail} servable SKUs, {n_old} aged SKUs')
