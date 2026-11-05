import json, collections, datetime as dt, sys
D='/home/user/jsw-pipes-inventory/reports/verifier-sku/data/'
o=json.load(open(D+'orders.json')); p=json.load(open(D+'productions.json')); d=json.load(open(D+'dispatches.json'))
S={r['sku_code']:r for r in json.load(open(D+'skus.json'))}
ASOF=dt.date(2026,11,4); W30=ASOF-dt.timedelta(days=29); MSTART=dt.date(2026,11,1)
PLANTS=['hyderabad','lepakshi','npmd','tapi']
NET_MODE = sys.argv[1] if len(sys.argv)>1 else 'month_plant'
def f(x): return float(x) if x not in (None,'') else 0.0
def key(code):
    r=S.get(code)
    if not r: return ('~', code)          # off-master: own key
    t=r['product_type']
    if r['nominal_bore']: size=f"{r['nominal_bore']} NB"
    elif r['height'] and r['breadth']: size=f"{f(r['height']):g}x{f(r['breadth']):g}"
    else: raise Exception('size parse needed '+code)
    return (t, size, round(f(r['thickness']),2))
# productions
prod=collections.defaultdict(list)  # (plant,key) -> [(date, mt)]
for r in p:
    if r['deleted']: continue
    s=S[r['sku_code']]
    prod[(r['plant'],key(r['sku_code']))].append((dt.date.fromisoformat(r['date_of_production']), (r['tube_count'] or 0)*f(s['weight_per_tube'])/1000))
inv=collections.defaultdict(float); sold30=collections.defaultdict(float)
shipped=collections.defaultdict(float)
for r in d:
    if r['deleted']: continue
    dd=dt.date.fromisoformat(r['date_of_dispatch'])
    for e in r['entries'] or []:
        k=(e['plant'],key(e['skuCode'])); w=f(e['weight'])
        inv[k]+=w
        if W30<=dd<=ASOF: sold30[k]+=w
        lid=e.get('orderLineId')
        if lid:
            if NET_MODE.startswith('month') and not (MSTART<=dd<=ASOF): continue
            if NET_MODE=='all_upto' and dd>ASOF: continue
            pl = e['plant'] if NET_MODE.endswith('plant') else '*'
            shipped[(lid,pl)]+=w
# orders
conf=collections.defaultdict(float); nc=collections.defaultdict(float); label={}
rawconf=collections.defaultdict(float)
for r in o:
    if r['deleted'] or r['order_status']=='Delivered': continue
    pl=r['plant']; k=(pl,key(r['mm_id']))
    if k[1][0]=='~': label.setdefault(k, r['description'])
    sh=shipped.get((r['line_id'], pl if NET_MODE.endswith('plant') else '*'),0.0)
    surplus=max(0.0, sh-f(r['invoiced_qty']))
    conf[k]+=max(0.0, f(r['confirmed'])-surplus); rawconf[k]+=f(r['confirmed'])
    nc[k]+=f(r['non_confirmed'])
keys=set(prod)|set(inv)|set(conf)|set(nc)
rows={}
for k in keys:
    layers=sorted(prod.get(k,[]))
    produced=sum(m for _,m in layers); drain=inv.get(k,0.0)
    b=[0.0]*4
    for dte,m in layers:
        take=min(m,drain); drain-=take; left=m-take
        if left<=0: continue
        age=(ASOF-dte).days
        b[0 if age<=30 else 1 if age<=60 else 2 if age<=90 else 3]+=left
    onhand=max(0.0, produced-inv.get(k,0.0))
    c=conf.get(k,0.0); n=nc.get(k,0.0)
    s30=sold30.get(k,0.0)
    rows[k]=dict(conf=c,nc=n,oih=c+n,inv=onhand,s30=s30,b=b,produced=produced,invoiced=inv.get(k,0.0),rawconf=rawconf.get(k,0.0))
json.dump({'|'.join(map(str,(k[0],)+tuple(k[1]))):v for k,v in rows.items()}, open(D+f'../mine_{NET_MODE}.json','w'))
# plant rows
for pl in PLANTS+[None]:
    sub={k:v for k,v in rows.items() if k[0]==pl}
    t=lambda f_: sum(v[f_] for v in sub.values())
    print(pl, 'conf %.3f nc %.3f oih %.3f inv %.3f s30 %.3f'%(t('conf'),t('nc'),t('oih'),t('inv'),t('s30')), 'b',[round(sum(v['b'][i] for v in sub.values()),3) for i in range(4)], 'rawconf %.3f'%t('rawconf'))
