import json, openpyxl, collections, re
V='/home/user/jsw-pipes-inventory/reports/verifier-sku/'
mine=json.load(open(V+'mine_month_plant.json'))
o=json.load(open(V+'data/orders.json'))
desc={}
for r in o:
    if r['order_status']!='Delivered': desc.setdefault((r['plant'],r['mm_id']),set()).add(r['description'])
PN={'Nippon (S)':'hyderabad','Lepakshi (S)':'lepakshi','NPMD (W)':'npmd','Tapi (W)':'tapi'}
wb=openpyxl.load_workbook('/home/user/jsw-pipes-inventory/reports/Plant-Order-Inventory-SKU-2026-11-04.xlsx')
ws=wb['SKU wise']
out=[]; total=None
for row in ws.iter_rows(min_row=5, values_only=True):
    if row[0] in PN: out.append(row)
    elif row[0] and str(row[0]).startswith('All plants'): total=row
print('output rows',len(out), collections.Counter(r[0] for r in out))
# build my expected rows
exp={}
for k,v in mine.items():
    parts=k.split('|')
    pl=parts[0]
    if parts[1]=='~':
        ds=desc.get((pl,parts[2]),set())
        lab=('-', next(iter(ds)) if len(ds)==1 else 'AMBIG:'+parts[2], '-')
    else: lab=(parts[1],parts[2],round(float(parts[3]),2))
    if v['oih']>0.0005 or v['inv']>0.0005: exp[(pl,)+lab]=v
print('expected rows',len(exp), collections.Counter(k[0] for k in exp))
seen=set(); disc=[]
def days(v):
    if v['s30']<=0: return '-'
    return v['inv']/(v['s30']/30)
for i,r in enumerate(out):
    pl=PN[r[0]]; th=r[3] if r[3]=='-' else round(float(r[3]),2)
    k=(pl,r[1],r[2],th)
    if k in seen: disc.append(('DUP',k))
    seen.add(k)
    v=exp.get(k)
    if v is None: disc.append(('EXTRA',k,r)); continue
    cols=[('oih',4),('conf',5),('nc',6),('inv',7)]
    for name,c in cols:
        if abs((r[c] or 0)-v[name])>0.02: disc.append(('VAL',k,name,r[c],v[name]))
    for j in range(4):
        if abs((r[9+j] or 0)-v['b'][j])>0.02: disc.append(('AGE',k,j,r[9+j],v['b'][j]))
    dv=days(v)
    if dv=='-' or r[8]=='-':
        if dv!=r[8]: disc.append(('DAYS',k,r[8],dv))
    else:
        if r[8]!=round(dv) and abs(r[8]-dv)>0.5+1e-9: disc.append(('DAYS',k,r[8],dv))
        elif r[8]!=int(dv+0.5): disc.append(('DAYS-ROUND',k,r[8],dv))
    if abs(sum(r[9:13])-r[7])>0.001: disc.append(('AGESUM',k))
    if abs(r[4]-r[5]-r[6])>0.001: disc.append(('OIHSUM',k))
for k in exp:
    if k not in seen: disc.append(('MISSING',k,exp[k]))
print('discrepancies',len(disc))
for x in disc: print(x)
# ordering check
SEC={'SHS':0,'RHS':1,'CHS':2,'-':3}; PO=list(PN.values())
def sz(s):
    m=re.match(r'^(\d+(?:\.\d+)?)(?: NB|x(\d+(?:\.\d+)?))$',s)
    return (float(m.group(1)), float(m.group(2) or 0)) if m else (9e9,0)
keys=[(PO.index(PN[r[0]]),SEC[r[1]],sz(r[2]) if r[1]!='-' else (9e9,0), r[3] if r[3]!='-' else 0, r[2]) for r in out]
bad=[(i,keys[i-1],keys[i]) for i in range(1,len(keys)) if keys[i]<keys[i-1]]
print('order violations',bad[:10])
# sums: plant rows vs plant summary, bottom row
ps=wb['Plant summary']; prow={r[0]:r for r in ps.iter_rows(min_row=5,values_only=True) if r[0]}
for name in PN:
    sub=[r for r in out if r[0]==name]
    sums=[sum(r[c] for r in sub) for c in (4,5,6,7,9,10,11,12)]
    pr=prow[name]; tgt=[pr[2],pr[3],pr[4],pr[5],pr[7],pr[8],pr[9],pr[10]]
    print(name, 'max diff vs plant row', max(abs(a-b) for a,b in zip(sums,tgt)))
allr=prow['All plants']; sums=[sum(r[c] for r in out) for c in (4,5,6,7,9,10,11,12)]
print('bottom row diff', max(abs(a-b) for a,b in zip(sums,[total[c] for c in (4,5,6,7,9,10,11,12)])), 'bottom vs All plants', max(abs(a-b) for a,b in zip([total[c] for c in (4,5,6,7,9,10,11,12)],[allr[c] for c in (2,3,4,5,7,8,9,10)])), 'days', total[8], allr[6])
print('tiny rows', [(r[0],r[1],r[2],r[3],r[4],r[7]) for r in out if round(r[4],1)==0 and round(r[7],1)==0])
