import openpyxl,json,re,collections
wb=openpyxl.load_workbook('/home/user/jsw-pipes-inventory/reports/SKU-Ageing-Actual-2026-11-23.xlsx',data_only=True)
inv=json.load(open('/home/user/jsw-pipes-inventory/reports/verifier/inv.json'))
SINCE={(r['plant'],r['sz'],float(r['thk'])):float(r['since'] or 0) for r in inv}
for x in open('/home/user/jsw-pipes-inventory/reports/verifier/sys_stock.txt').read().strip().split(';'):
    pl,sz,t,st,sn=x.split('|'); SINCE[(pl,sz,float(t))]=float(sn)
def key(plant,label):
    l=label.split(' (=')[0].upper()
    m=re.fullmatch(r'(\d+)NBX([\d.]+)',l)
    if m: return (plant,m.group(1),float(m.group(2)))
    if l.startswith('25.4ODX'): return (plant,'20',float(l[7:]))
    h,b,t=l.split('X'); return (plant,f'{h}x{b}',float(t))
def name(k):
    _,sz,t=k; ts=('%g'%t)
    if 'x' not in sz: return f'CHS {sz} NB x {ts}'
    h,b=sz.split('x'); return f"{'SHS' if h==b else 'RHS'} {sz} x {ts}"
SKU={}
for plant,tab in (('tapi','Tapi Surat'),('hyderabad','Nippon (Hyderabad)')):
    for r in wb[tab].iter_rows(min_row=3,values_only=True):
        if r[0] in (None,'Total'): continue
        k=key(plant,r[0]); SKU[k]=dict(b1=r[7],b2=r[8],b3=r[9],old=r[11])
for plant,tab in (('npmd','NPMD (system)'),('lepakshi','Lepakshi (system)')):
    for r in wb[tab].iter_rows(min_row=3,values_only=True):
        if r[0]=='Total': break
        h,b,t=r[0].split('x'); SKU[(plant,f'{h}x{b}',float(t))]=dict(b1=r[3],b2=r[4],b3=r[5],old=r[6])
last={'hyderabad':"CHS 50 NB x 2|27.3;CHS 80 NB x 2.5|23.6;CHS 32 NB x 2.5|19.4;CHS 80 NB x 2|17.1;CHS 80 NB x 1.6|15.1;CHS 20 NB x 1.6|11.8;RHS 75x25 x 3|10.5;CHS 65 NB x 2.5|9.1;RHS 60x40 x 2.5|11.7;SHS 100x100 x 2.5|5.8;CHS 40 NB x 2|16.6;SHS 38x38 x 3|13.2;RHS 60x40 x 3|12.2;RHS 40x20 x 3|11.0;CHS 20 NB x 2|7.4;RHS 100x50 x 4|7.2;RHS 80x40 x 2|7.0;SHS 50x50 x 1.6|5.7;CHS 20 NB x 2.5|5.5",
 'npmd':"RHS 80x40 x 2|47.8;RHS 80x40 x 3|29.6;RHS 60x40 x 3|17.4;RHS 60x40 x 1.6|94.0;SHS 50x50 x 2.5|52.6;RHS 60x40 x 2.5|42.0;SHS 50x50 x 2|40.3;SHS 50x50 x 1.6|37.9;RHS 60x40 x 2|35.6;RHS 96x48 x 2|32.0;RHS 96x48 x 1.6|14.0;RHS 96x48 x 3|13.4",
 'lepakshi':"RHS 122x61 x 4|29.2;SHS 72x72 x 5|28.0;RHS 122x61 x 2.5|16.9;SHS 150x150 x 3|9.0;RHS 122x61 x 5|8.7;RHS 96x48 x 5|6.9;RHS 96x48 x 4|5.8",
 'tapi':"SHS 150x150 x 2.5|50.0;RHS 80x40 x 4|43.0;RHS 96x48 x 2.5|41.0;SHS 150x150 x 3|40.0;RHS 80x40 x 5|38.0;RHS 122x61 x 3|25.2;RHS 122x61 x 2.5|16.0;RHS 80x40 x 2|14.0;SHS 50x50 x 2|13.0;RHS 80x40 x 2.5|13.0;RHS 122x61 x 2|12.0;SHS 100x100 x 2|10.0;SHS 50x50 x 2.5|7.0"}
LW={}
for pl,s in last.items():
    for x in s.split(';'):
        n,mt=x.split('|'); m=re.fullmatch(r'(CHS|SHS|RHS) (\S+?)( NB)? x ([\d.]+)',n)
        k=(pl,m.group(2),float(m.group(4)))
        if pl=='hyderabad' and k[2]==3.0 and k not in SKU and (pl,k[1],2.8) in SKU: print('map',n,'-> 2.8'); k=(pl,k[1],2.8)
        LW[k]=float(mt)
sold={k:min(SINCE.get(k,0),v) for k,v in LW.items()}
for pl in ('hyderabad','npmd','tapi','lepakshi'):
    print(pl,'invoiced since',round(sum(v for k,v in sold.items() if k[0]==pl),3), 'LW named sum',round(sum(v for k,v in LW.items() if k[0]==pl),1))
for k in LW:
    if k[2]==2.8: print('plausibility',name(k),LW[k],'-',round(SINCE.get(k,0),3),'=',round(LW[k]-SINCE.get(k,0),3),'today',SKU.get(k))
for k in LW:
    if k not in SKU: print('LW sku not in today count',k,LW[k],'sold',sold[k])
# section 3 expected
out=[]
for k,s in SKU.items():
    o30=s['b1']+s['b2']+s['b3']
    if o30<=1e-9: continue
    pr=1 if s['b3']>0 else 2 if s['b2']>0 else 3
    out.append((pr,k,o30,s,sold.get(k,'new')))
for pr in (1,2,3):
  for pl in ('hyderabad','npmd','tapi','lepakshi'):
    big=sorted([x for x in out if x[0]==pr and x[1][0]==pl and x[2]>=5],key=lambda x:-x[2])
    sm=[x for x in out if x[0]==pr and x[1][0]==pl and x[2]<5]
    for x in big: print(f"P{pr} {pl} {name(x[1])} | {x[2]:.1f} | {x[3]['b1']:.1f} {x[3]['b2']:.1f} {x[3]['b3']:.1f} | {x[3]['old']} | {x[4] if x[4]=='new' else round(x[4],2)}")
    if sm:
        nn=[x for x in sm if x[4]!='new']
        print(f"P{pr} {pl} + {len(sm)} smaller | {sum(x[2] for x in sm):.2f} | {sum(x[3]['b1'] for x in sm):.2f} {sum(x[3]['b2'] for x in sm):.2f} {sum(x[3]['b3'] for x in sm):.2f} | {max(x[3]['old'] for x in sm)} | sold {round(sum(x[4] for x in nn),3) if nn else 'new'} ::", [(name(x[1]),round(x[2],3),x[4]) for x in sm])
print('total aged',round(sum(x[2] for x in out),3))
print('not a tonne moved:',[ (name(x[1]),round(x[2],1)) for x in out if x[1] in LW and x[2]>=5 and round(sold[x[1]],1)==0])
