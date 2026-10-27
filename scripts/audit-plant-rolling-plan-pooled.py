# Pooled feasibility: several planned lines draw the SAME coil pool, so line-by-line checks mislead.
exec(open('/tmp/claude-0/-home-user-jsw-pipes-inventory/12870ed7-5670-5b90-87c9-9f9fb6c3b045/scratchpad/build/audit_plant_plan.py').read().split("print('%-10s %-4s")[0])

# greedy, in the plan's own order: yard of matching spec first, then that plant's mother coil
rows=[]
for plant,sect,size,g,mt in PLAN:
    reg=REGION[plant]; bth,w,basis=spec(reg,sect,size,g); need=mt/0.96; got=0.0
    if w is not None:
        for k in sorted([k for k in pool if k[0]==plant and pool[k]>1e-9
                         and abs(k[1]-bth)<=TH_TOL and abs(k[2]-w)<=W_TOL],
                        key=lambda k:(abs(k[2]-w),-pool[k])):
            if need<=1e-9: break
            t=min(pool[k],need); pool[k]-=t; need-=t; got+=t
    for k in sorted([k for k in mpool if k[0]==plant and mpool[k]>1e-9 and abs(k[1]-bth)<=TH_TOL],
                    key=lambda k:abs(k[1]-bth)):
        if need<=1e-9: break
        t=min(mpool[k],need); mpool[k]-=t; need-=t; got+=t
    made=got*0.96
    rows.append((plant,sect,size,g,mt,made,'%g x %s'%(bth,('%g'%w) if w else '?')))

print('%-10s %-4s %-9s %-4s %6s %7s %7s  %s' % ('PLANT','SEC','SIZE','TH','PLAN','MAKEABLE','GAP','COIL SPEC'))
byp=defaultdict(lambda:[0.0,0.0])
for plant,sect,size,g,mt,made,sp in rows:
    byp[plant][0]+=mt; byp[plant][1]+=made
    print('%-10s %-4s %-9s %-4g %6.1f %7.1f %7.1f  %s%s' % (plant,sect,size,g,mt,made,mt-made,sp,
          '   <-- NO COIL' if made<0.05 else ('   <-- short' if mt-made>0.5 else '')))
print()
for p,(pl,md) in sorted(byp.items(), key=lambda kv:-kv[1][0]):
    print('  %-10s plan %6.1f   makeable %6.1f   gap %6.1f  (%.0f%% of its plan has no coil)' % (p,pl,md,pl-md,100*(pl-md)/pl))
T=sum(v[0] for v in byp.values()); M=sum(v[1] for v in byp.values())
print('  %-10s plan %6.1f   makeable %6.1f   gap %6.1f  (%.0f%%)' % ('ALL',T,M,T-M,100*(T-M)/T))

# what the no-stock back order wants that the plan does not touch
print('\nBIGGEST NO-STOCK CELLS THE PLAN DOES NOT TOUCH (MT still owed, nothing in stock):')
planned=set((REGION[p],s,key(s,z)[1],g) for p,s,z,g,_ in PLAN)
miss=[(v,k) for k,v in nostock.items() if k not in planned]
for v,k in sorted(miss, reverse=True)[:12]:
    print('   %-5s %-4s %-9s %-4g  %5.0f MT' % (k[0],k[1],k[2],k[3],v))
print('   ... %d cells, %.0f MT in total untouched by this plan' % (len(miss),sum(v for v,_ in miss)))
