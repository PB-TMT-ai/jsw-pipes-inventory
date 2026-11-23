import json, datetime as dt, openpyxl, re, sys
D='/home/user/jsw-pipes-inventory/reports/verifier/'
AS=dt.date(2026,11,23)
prod=json.load(open(D+'prod4.json'))
P={}
for r in prod:
  if r['w']>0: P.setdefault((r['plant'],r['sz'],float(r['thk'])),[]).append((r['d'],r['w']))
# my own transcription of the images
tapi="""50x50 2 6 0;50x50 2.5 4 0;50x50 4 4 0;50x50 5 9 0;60x40 2 1 0;60x40 4 2 2;60x60 4 13 0;60x60 5 3 3;80x40 2 10 6;80x40 2.5 8 0;80x40 4 43 2;80x40 5 38 0;96x48 2 42 0;96x48 2.5 39 0;96x48 3 9 0;96x48 4 1 0;72x72 2 26 0;72x72 2.5 25 4;72x72 4 8 0;80x80 4 0.3 0;100x100 2 4 2;100x100 3 20 0;100x100 4 27 0;100x100 5 19 0;122x61 2 12 0;122x61 2.5 9 0;122x61 3 36 0;122x61 4 11 1;122x61 6 14 5;145x82 3 8 10;145x82 4 22 12;132x132 4 11 4;132x132 5 33 0;132x132 6 17 0;150x150 2.5 50 0;150x150 3 29 0;150x150 4 13 0;150x150 5 19 0"""
nip="""100X50X4 7.230;15NBX1.6 4.783;15NBX2 8.035;15NBX2.5 3.151;25.4ODX1.6 11.839;25.4ODX2 7.389;25.4ODX2.5 10.592;25.4ODX2.8 1.530;25.4ODX3 3.547;25NBX1.6 4.788;25X25X2 19.953;25X25X2.5 4.694;32NBX2 2.770;32NBX2.5 10.578;38X38X1.6 13.506;38X38X2 1.955;38X38X2.2 6.943;38X38X2.5 11.852;38X38X2.8 3.130;40NBX2 12.638;40NBX4 1.683;40X20X2.5 1.693;40X20X2.8 6.990;50NBX1.6 16.399;50NBX2 27.325;50NBX2.5 3.069;50NBX3 14.998;50NBX3.2 13.859;50X25X2 4.067;50X50X1.6 65.466;50X50X2 14.702;50X50X2.5 34.044;50X50X3 12.292;50X50X3.2 5.757;50X50X4 4.185;60X40X1.6 27.886;60X40X2.5 7.717;60X40X2.8 7.501;65NBX2 3.116;65NBX2.5 9.126;75X25X2.8 10.526;80NBX1.6 15.096;80NBX2 17.065;80NBX2.5 27.861;80X40X2 7.017;80X40X2.5 7.453;80X40X3 2.070"""
rows=[]
for x in tapi.split(';'):
    s,t,q,r=x.split(); rows.append(('tapi','Tapi Surat',f'{s.lower()}x{t}',s.lower(),float(t),float(q),float(r),0.0 if (s,t)==('80x80','4') else float(q)-float(r)))
for x in nip.split(';'):
    n,q=x.split()
    m=re.fullmatch(r'(\d+)NBX([\d.]+)',n) or None
    if m: sz,t=m.group(1),m.group(2)
    elif 'OD' in n: sz,t,n='20',n.split('X')[1],n+' (= CHS 20 NB)'
    else:
        h,b,t=n.split('X'); sz=f'{h}x{b}'
    rows.append(('hyderabad','Nippon (Hyderabad)',n,sz,float(t) if t else None,float(q),0.0,float(q)))
print('nippon visible sum',round(sum(r[5] for r in rows if r[0]=='hyderabad'),3),'tapi sum',round(sum(r[5] for r in rows if r[0]=='tapi'),3))
book=json.load(open(D+'book2.json'))  # {plant|sz|thk: book}
wb=openpyxl.load_workbook('/home/user/jsw-pipes-inventory/reports/SKU-Ageing-Actual-2026-11-23.xlsx',data_only=True)
bad=[];n=0
def cmp(tab,row,field,out,mine,tol=0.02):
    global n; n+=1
    if (out is None)!=(mine is None) or (mine is not None and (abs(float(out)-float(mine))>tol if isinstance(mine,(int,float)) else out!=mine)):
        bad.append((tab,row,field,out,mine))
layers={}
for ws in wb.worksheets[4:5]: pass
L=[r for r in wb['FIFO layers'].iter_rows(min_row=2,values_only=True)]
tot={}
for plant,tab,label,sz,t,q,res,free in rows:
    ws=wb[tab]
    wr=[r for r in ws.iter_rows(min_row=3,values_only=True) if r[0]==label]
    if len(wr)!=1: bad.append((tab,label,'row present',len(wr),1)); continue
    w=wr[0]
    lots=sorted(P.get((plant,sz,t),[]),reverse=True)
    left=q; sl=[]
    for d,mt in lots:
        if left<=1e-9: break
        take=min(mt,left); left-=take
        age=(AS-dt.date.fromisoformat(d)).days
        sl.append((d,age,mt,take))
    b=[0,0,0,0]
    for d,age,mt,take in sl:
        b[0 if age<=30 else 1 if age<=60 else 2 if age<=90 else 3]+=take
    aged=sum(x[3] for x in sl); unk=q-aged
    oldest=max((x[1] for x in sl),default=None)
    wavg=round(sum(x[1]*x[3] for x in sl)/aged,1) if aged>0 else None
    last=max((d for d,_ in lots),default=None)
    bk=book.get(f'{plant}|{sz}|{t}',0.0)
    mine=[q,res,free,bk,q-bk]+b+[unk]
    names=['Physical','Reserve','Free','Book','Adj','0-30','31-60','61-90','90+','Unknown']
    for i,nm in enumerate(names): cmp(tab,label,nm,w[1+i],round(mine[i],3))
    cmp(tab,label,'Oldest',w[11],oldest,0); cmp(tab,label,'WtdAvg',w[12],wavg,0.051); cmp(tab,label,'LastProd',w[13],last)
    for i in range(10): tot.setdefault(tab,[0]*10); tot[tab][i]+=mine[i]
    # FIFO layer sheet
    lname=tab
    out_sl=[r for r in L if r[0]==lname and r[1]==label.split(' (=')[0]]
    my_sl=[(lname,label.split(' (=')[0],d,age,round(mt,3),round(take,3)) for d,age,mt,take in sorted(sl)]
    if len(out_sl)!=len(my_sl): bad.append(('FIFO layers',label,'slice count',len(out_sl),len(my_sl)))
    for o,m in zip(sorted(out_sl,key=lambda r:r[2]),my_sl):
        for j,f in [(2,'date'),(3,'age'),(4,'produced'),(5,'in stock')]:
            cmp('FIFO layers',f'{label} {m[2]}',f,o[j],m[j],0 if j<4 else 0.02)
    n+=0
# totals
for tab in ('Tapi Surat','Nippon (Hyderabad)'):
    tw=[r for r in wb[tab].iter_rows(min_row=3,values_only=True) if r[0]=='Total'][0]
    for i in range(10): cmp(tab,'Total',f'col{i+1}',tw[1+i],round(tot[tab][i],3))
# ---- system plants
SYS={}
for x in open(D+'sys_stock.txt').read().strip().split(';'):
    pl,sz,t,st,since=x.split('|'); SYS[(pl,sz,float(t))]=float(st)
def lab(sz,t): return f"{sz}x{'%g'%t}"
for pl,tab,lname in (('npmd','NPMD (system)','NPMD'),('lepakshi','Lepakshi (system)','Lepakshi')):
    ws=wb[tab]; allr=list(ws.iter_rows(min_row=3,values_only=True))
    ti=[i for i,r in enumerate(allr) if r[0]=='Total'][0]
    body={r[0]:r for r in allr[:ti]}
    over={r[0]:r[1] for r in allr[ti+1:] if r[0] and r[1] is not None and not str(r[0]).startswith('Over')}
    pos={k:v for k,v in SYS.items() if k[0]==pl and v>1e-9}; neg={k:v for k,v in SYS.items() if k[0]==pl and v<=1e-9}
    if set(body)!={lab(k[1],k[2]) for k in pos}: bad.append((tab,'rowset',sorted(set(body)^{lab(k[1],k[2]) for k in pos}),None,None))
    if set(over)!={lab(k[1],k[2]) for k in neg}: bad.append((tab,'overset',sorted(set(over)^{lab(k[1],k[2]) for k in neg}),None,None))
    for k,v in neg.items():
        if lab(k[1],k[2]) in over: cmp(tab,lab(k[1],k[2]),'over-invoiced',over[lab(k[1],k[2])],round(v,3))
    T=[0]*5
    for k,q in pos.items():
        w=body.get(lab(k[1],k[2]))
        if not w: continue
        lots=sorted(P.get(k,[]),reverse=True); left=q; sl=[]
        for d,mt in lots:
            if left<=1e-9: break
            take=min(mt,left); left-=take; sl.append((d,(AS-dt.date.fromisoformat(d)).days,mt,take))
        if left>1e-6: bad.append((tab,lab(k[1],k[2]),'stock exceeds production?',left,0))
        bk=[0]*4
        for d,age,mt,take in sl: bk[0 if age<=30 else 1 if age<=60 else 2 if age<=90 else 3]+=take
        mine=[q]+bk
        for i,nm in enumerate(['Stock','0-30','31-60','61-90','90+']): cmp(tab,w[0],nm,w[1+i],round(mine[i],3)); T[i]+=mine[i]
        cmp(tab,w[0],'Oldest',w[6],max(x[1] for x in sl),0)
        cmp(tab,w[0],'WtdAvg',w[7],round(sum(x[1]*x[3] for x in sl)/q,1),0.051)
        cmp(tab,w[0],'LastProd',w[8],max(d for d,_ in lots))
        out_sl=sorted([r for r in L if r[0]==lname and r[1]==w[0]],key=lambda r:r[2])
        my=sorted(sl)
        if len(out_sl)!=len(my): bad.append(('FIFO layers',lname+' '+w[0],'slice count',len(out_sl),len(my)))
        for o,m in zip(out_sl,my):
            cmp('FIFO layers',f'{lname} {w[0]} {m[0]}','date',o[2],m[0]); cmp('FIFO layers',f'{lname} {w[0]} {m[0]}','age',o[3],m[1],0)
            cmp('FIFO layers',f'{lname} {w[0]} {m[0]}','produced',o[4],round(m[2],3)); cmp('FIFO layers',f'{lname} {w[0]} {m[0]}','in stock',o[5],round(m[3],3))
    tw=allr[ti]
    for i in range(5): cmp(tab,'Total',f'col{i+1}',tw[1+i],round(T[i],3))
    tot[tab]=T
# FIFO sheet: no rows beyond what I expect
print('FIFO plants rows',len(L))
sm=list(wb['Summary'].iter_rows(min_row=3,max_row=7,values_only=True))
idx=[0,5,6,7,8,9,3,4]
G=[0]*8
for r,tab in zip(sm[:4],['Tapi Surat','Nippon (Hyderabad)','NPMD (system)','Lepakshi (system)']):
    if tab in ('Tapi Surat','Nippon (Hyderabad)'): vals=[tot[tab][i] for i in idx]
    else: T=tot[tab]; vals=[T[0],T[1],T[2],T[3],T[4],0,T[0],None]
    for k,v in enumerate(vals):
        cmp('Summary',r[0],f'col{k+3}',r[2+k],None if v is None else round(v,3))
        if v is not None and k<7: G[k]+=v
for k in range(7): cmp('Summary','Total',f'col{k+3}',sm[4][2+k],round(G[k],3))
print('layer rows in sheet',len(L),'checks',n)
print('extra rows in sheets:',[(t,r[0]) for t in ('Tapi Surat','Nippon (Hyderabad)') for r in wb[t].iter_rows(min_row=3,values_only=True) if r[0] not in [x[2] for x in rows]+['Total']])
for b in bad: print('DISC',b)
print('discrepancies',len(bad))
print('free totals',{t:round(v[2],3) for t,v in tot.items()})
#print('FIFO rows I expect',sum(len(sorted(P.get((pl,sz,t),[]))) and 0 for pl,_,_,sz,t,*_ in rows))
