# Audit the plant team's Tentative Rolling Plan 26-31 Oct against the 27 Oct 05:19 UTC coil
# position and the no-stock back order. Same rules of record as reports/rolling-plan-nostock-rules.md
import json
from collections import defaultdict
import openpyxl

REF='/tmp/claude-0/-home-user-jsw-pipes-inventory/12870ed7-5670-5b90-87c9-9f9fb6c3b045/scratchpad/ref/'
QTY='/tmp/claude-0/-home-user-jsw-pipes-inventory/12870ed7-5670-5b90-87c9-9f9fb6c3b045/scratchpad/in/c36e83a5-QtyLeft_Stock_vs_NoStock_Oct26.xlsx'
PI=3.141592653589793
REGION={'hyderabad':'SOUTH','lepakshi':'SOUTH','npmd':'WEST','tapi':'WEST'}
PLANTS={'SOUTH':['hyderabad','lepakshi'],'WEST':['npmd','tapi']}
TH_TOL,W_TOL=0.35,3.0

# the plan, transcribed from the workbook
PLAN=[('tapi','SHS','100x100',3,20),('tapi','SHS','100x100',4,20),('tapi','SHS','100x100',5,15),
      ('tapi','SHS','80x80',3,10),('tapi','SHS','80x80',4,10),('tapi','SHS','80x80',5,10),
      ('tapi','SHS','60x60',4,35),('tapi','SHS','60x60',5,25),
      ('tapi','RHS','145x82',3,30),('tapi','RHS','145x82',4,25),
      ('lepakshi','SHS','100x100',3,50),('lepakshi','SHS','100x100',4,40),
      ('lepakshi','SHS','40x40',3,30),
      ('lepakshi','SHS','72x72',2,25),('lepakshi','SHS','72x72',3,20),('lepakshi','SHS','72x72',4,15),
      ('lepakshi','RHS','96x48',3,20),('lepakshi','RHS','96x48',4,15),
      ('hyderabad','RHS','80x40',3,20),('hyderabad','SHS','50x50',2,20)]

def key(sect,size): return (sect,str(size).upper().replace(' ','').replace('.',''))
def sides(sz): return [float(x) for x in str(sz).upper().replace(' ','').split('X')]
def td_od(sect,sz,t):
    a,b=sides(sz); r=1.5*t
    return (2*((a-t)+(b-t))-8*r+2*PI*r)/PI + t

# coil spec ladder, same as the plan of record
reg_mode={};reg_sizes=defaultdict(list);co_mode={};co_sizes=defaultdict(list)
for reg,sect,sz,th,bth,w,n,tot in json.load(open(REF+'regmap_27.json')):
    k=key(sect,sz); reg_mode[(reg,k[0],k[1],float(th))]=(float(bth),float(w),n,tot)
    reg_sizes[(reg,k[0],k[1])].append((float(th),float(bth),float(w)))
for sect,sz,th,bth,w,n,tot in json.load(open(REF+'comap_27.json')):
    k=key(sect,sz); co_mode[(k[0],k[1],float(th))]=(float(bth),float(w),n,tot)
    co_sizes[(k[0],k[1])].append((float(th),float(bth),float(w)))
def spec(region,sect,size,g):
    s,sz=key(sect,size)
    h=reg_mode.get((region,s,sz,g))
    if h: return h[0],h[1],'region history'
    c=reg_sizes.get((region,s,sz))
    if c:
        g2,bth,w=min(c,key=lambda t:(abs(t[0]-g),t[0])); return g,w,'region, width from %gmm'%g2
    h=co_mode.get((s,sz,g))
    if h: return h[0],h[1],'company-wide'
    c=co_sizes.get((s,sz))
    if c:
        g2,bth,w=min(c,key=lambda t:(abs(t[0]-g),t[0])); return g,w,'company-wide, width from %gmm'%g2
    return g,None,'NEVER RUN ANYWHERE'

pool=defaultdict(float)
for p,th,w,mt,n in json.load(open(REF+'baby_27.json')): pool[(p,float(th),float(w))]+=mt
mpool=defaultdict(float)
for p,th,w,mt,n in json.load(open(REF+'mother_27.json')): mpool[(p,float(th))]+=mt
SKU=set((s,key(s,z)[1],float(t)) for s,z,t in json.load(open(REF+'sku_keys.json')) if t is not None)

# demand: both sheets of the Qty-Left workbook
def read(sheet):
    ws=openpyxl.load_workbook(QTY,data_only=True)[sheet]
    out=defaultdict(float); region=None; gauges=[]
    for r in ws.iter_rows(values_only=True):
        a=(str(r[0]) if r[0] is not None else '').strip()
        if a.startswith('SOUTH'): region='SOUTH'; continue
        if a.startswith('WEST'):  region='WEST';  continue
        if a=='Section': continue
        if a=='' and str(r[2]).strip()=='1.2':
            gauges=[]                      # the two sheets have different gauge counts; stop at 'Total'
            for x in r[2:]:
                if x is None: break
                try: gauges.append(float(str(x)))
                except ValueError: break
            continue
        if a in ('CHS','SHS','RHS') and region:
            for i,g in enumerate(gauges):
                v=r[2+i]
                if isinstance(v,(int,float)) and v: out[(region,a,key(a,str(r[1]).strip())[1],g)]+=float(v)
    return out
nostock=read('No Stock')
withstock=read('Stock Available')

print('%-10s %-4s %-9s %-4s %6s | %-16s %7s %7s | %6s %6s %6s | %s' % (
  'PLANT','SEC','SIZE','TH','PLAN','COIL SPEC','YARD','MOTHER','NOSTK','WSTOCK','T/D%','FLAGS'))
tot=0; flagged=[]
for plant,sect,size,g,mt in PLAN:
    reg=REGION[plant]; tot+=mt
    bth,w,basis=spec(reg,sect,size,g)
    yard = sum(v for k,v in pool.items() if k[0]==plant and abs(k[1]-bth)<=TH_TOL and w is not None and abs(k[2]-w)<=W_TOL)
    moth = sum(v for k,v in mpool.items() if k[0]==plant and abs(k[1]-bth)<=TH_TOL)
    need = mt/0.96
    ns = nostock.get((reg,sect,key(sect,size)[1],g),0.0)
    ws_ = withstock.get((reg,sect,key(sect,size)[1],g),0.0)
    td  = g/td_od(sect,size,g)*100
    f=[]
    if (sect,key(sect,size)[1],g) not in SKU: f.append('NO-SKU')
    if w is None: f.append('NO-WIDTH')
    if yard+moth < need - 0.01: f.append('COIL-SHORT(%.1f)'%(yard+moth))
    if basis!='region history': f.append(basis.upper().replace(' ','-'))
    if ns==0: f.append('NOT-OWED' if ws_==0 else 'HAS-STOCK')
    if not (3.0<=td<=8.0): f.append('BAND-EDGE')
    print('%-10s %-4s %-9s %-4g %6.1f | %-16s %7.1f %7.1f | %6.0f %6.0f %6.2f | %s' % (
      plant,sect,size,g,mt,('%g x %s'%(bth,('%g'%w) if w else '?')),yard,moth,ns,ws_,td,' '.join(f)))
    if f: flagged.append((plant,sect,size,g,mt,f))
print('\nPLAN TOTAL %.0f MT over 26-31 Oct' % tot)
print('flagged lines: %d of %d, %.0f MT of %.0f' % (len(flagged),len(PLAN),sum(x[4] for x in flagged),tot))
# plant-level coil feasibility, pooled across that plant's own lines
print('\nPER-PLANT COIL CHECK (plant total coil needed vs that plant holds, any spec):')
for p in ('tapi','lepakshi','hyderabad'):
    need=sum(mt for pl,_,_,_,mt in PLAN if pl==p)/0.96
    have=sum(v for k,v in pool.items() if k[0]==p)+sum(v for k,v in mpool.items() if k[0]==p)
    print('  %-10s needs %7.1f MT coil, holds %7.1f MT  -> %s' % (p,need,have,'OK' if have>=need else 'SHORT %.1f'%(need-have)))
