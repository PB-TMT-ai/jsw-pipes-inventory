// Monitoring prototype data (#274). Throwaway. Live snapshot 10-Nov-2026, NOT independently verified.
// Production for 1–8 Nov is window.COIL.made (coil.js) — the same rows, re-queried 10 Nov: nothing new entered.
window.MON = {
  today: 'Tue 10 Nov',
  // last production date entered per plant (productions.date_of_production)
  lastProd: {hyderabad:'2026-11-05', lepakshi:'2026-11-04', npmd:'2026-10-28', tapi:'2026-11-05'},
  // November invoices to date (Zoho register, 3–6 Nov), by shipping plant: [plant, section, size, thickness, T]
  inv: [["hyderabad","CHS","20NB",2,4.08],["hyderabad","CHS","25NB",2.8,3.45],["hyderabad","CHS","32NB",2.5,5.63],["hyderabad","CHS","50NB",2.5,5.5],["hyderabad","CHS","50NB",4,5.1],["hyderabad","CHS","80NB",2.5,5.6],["hyderabad","CHS","80NB",2.8,2.75],["hyderabad","RHS","60x40",2,9],["hyderabad","RHS","75x25",2,3.35],["hyderabad","RHS","75x25",2.8,5.9],["hyderabad","RHS","80x40",3,5.05],["hyderabad","RHS","80x40",2,4.7],["hyderabad","RHS","100x50",2,8.99],["hyderabad","RHS","100x50",2.5,8.25],["hyderabad","RHS","100x50",4,5.35],["hyderabad","SHS","25x25",2.5,5.2],["hyderabad","SHS","30x30",2.5,3.2],["hyderabad","SHS","50x50",3,7.8],["hyderabad","SHS","50x50",2,9.1],["hyderabad","SHS","50x50",2.5,11.14],["hyderabad","SHS","60x60",2.5,2.2],["hyderabad","SHS","60x60",4,2.6],["lepakshi","RHS","96x48",5,5.93],["lepakshi","RHS","122x61",5,6.2],["lepakshi","SHS","40x40",3,14.95],["lepakshi","SHS","72x72",5,8.6],["lepakshi","SHS","100x100",2.5,15.75],["lepakshi","SHS","100x100",4,5.2],["lepakshi","SHS","150x150",5,11.02],["tapi","RHS","80x40",5,5.09],["tapi","RHS","96x48",3,9.23],["tapi","RHS","96x48",5,1.64],["tapi","RHS","96x48",2.5,9.52],["tapi","RHS","96x48",4,7.12],["tapi","RHS","122x61",2,3.95],["tapi","RHS","122x61",4,4.64],["tapi","RHS","145x82",3,3.41],["tapi","RHS","145x82",4,8.17],["tapi","SHS","50x50",5,4.52],["tapi","SHS","60x60",5,5.77],["tapi","SHS","60x60",4,6.07],["tapi","SHS","80x80",5,5.2],["tapi","SHS","80x80",4,2.82],["tapi","SHS","100x100",3,10.56],["tapi","SHS","100x100",6,3.83],["tapi","SHS","132x132",4,3.44],["tapi","SHS","150x150",5,5.85],["tapi","SHS","150x150",2.5,4.27]],
};

// ---- the monitoring rules being proposed (nothing here is decided) ----
(function(){
const P = window.PP, C = window.COIL, M = window.MON, WEEKS = window.WK.WEEKS;
const BANDS = [1.2,1.6,2.0,2.5,3.0,4.0,5.0,6.0];
const band = x => BANDS.reduce((b,c)=>{ const d=Math.abs(c-x), e=Math.abs(b-x); return (d<e-1e-9 || (Math.abs(d-e)<1e-9 && c>b)) ? c : b }, BANDS[0]);   // #258
const CLOSED = 1;                                      // W1 closed; W2 (index 1) is running
const TOL = t => Math.max(1, 0.05*t);                  // "made" if within 1 T or 5 % of the target
const rowOf = (plant, sec, size, thk) => P.rows.find(r=>r.region===P.PLANTS[plant].region && r.section===sec && r.size===size && r.thk===band(thk));

// 1. Monday plan: the app's proposal as it stood when each week began (#273: size, then thin → thick, whole rows)
const plans = {};
Object.keys(P.PLANTS).forEach(pl=>{
  const x = window.WK.plan(pl,'size'), m = {};
  x.seq.forEach((s,i)=>{ const w=[0,0,0,0]; w[x.auto[i]]=s.t; m[s.r.id]={r:s.r, base:s.t, mon:w.slice(), w:w.slice(), seq:i} });
  plans[pl] = m;
});
// 2. EXAMPLE events after Finalise (made up for the prototype, not real):
const log = [];
const find = (pl,size,thk) => Object.values(plans[pl]).find(o=>o.r.size===size && o.r.thk===thk);
const e1 = find('hyderabad','50x50',1.6);              // Planned changed, reason required (#255)
if(e1){ e1.w[0] -= 20; e1.mon[0] -= 20; log.push({d:'Fri 6 Nov', what:`Hyderabad SHS 50x50 1.6 Planned 100 → 80`, why:'“buffer cut to 80 after review” (example)', kind:'plan'}) }
const e2 = find('hyderabad','38x38',2.0);              // Week move, logged automatically, no reason (#273)
if(e2){ e2.w[1] += e2.w[0]; e2.w[0] = 0; log.push({d:'Mon 9 Nov', what:'Hyderabad SHS 38x38 2.0: 40 T W1 → W2', why:'week move, no reason asked', kind:'move'}) }
const e3 = find('tapi','72x72',3.0);
if(e3){ e3.w[2] += 20; e3.w[0] -= 20; log.push({d:'Mon 9 Nov', what:'Tapi SHS 72x72 3.0: 20 of 50 T W1 → W3', why:'week move, no reason asked', kind:'move'}) }

// 3. Actuals by plant × row (W1 only so far: all entered production is dated 1–5 Nov)
const made = {}, unplanned = [];
C.made.forEach(([pl,sec,size,thk,t])=>{
  const r = rowOf(pl,sec,size,thk), o = r && plans[pl][r.id];
  if(o){ (made[pl] ||= {})[r.id] = ((made[pl]||{})[r.id]||0) + t; return }
  unplanned.push({pl, label:`${sec} ${size} ${thk}`, t, why: r ? 'row has no plan at this plant' : 'no master row (outside the plan)'});
});
const sold = {};                                       // region × row, invoiced this month
M.inv.forEach(([pl,sec,size,thk,t])=>{ const r=rowOf(pl,sec,size,thk); if(r) sold[r.id]=(sold[r.id]||0)+t });

// 4. Per plant-row measures. Latest plan is the target (#255); Monday's and the Baseline sit beside it.
function rowStat(pl, o){
  const plan = o.w.reduce((s,v)=>s+v,0), mk = (made[pl]||{})[o.r.id]||0;
  const dueClosed = o.w.slice(0,CLOSED).reduce((s,v)=>s+v,0);
  const monClosed = o.mon.slice(0,CLOSED).reduce((s,v)=>s+v,0);
  const credited = Math.min(mk, plan), over = Math.max(0, mk-plan);
  const missedRaw = Math.max(0, dueClosed - mk);
  const missed = missedRaw > TOL(dueClosed) ? missedRaw : 0;
  const left = plan - credited, toCome = left - missed;
  const movedOn = Math.max(0, monClosed - dueClosed);  // taken out of a closed week after its Monday
  const early = Math.max(0, Math.min(mk, plan) - dueClosed);
  let st, cls;
  if(missed>0){ st=`behind ${Math.round(missed)}`; cls='red' }
  else if(over>TOL(plan)){ st=`over plan +${Math.round(over)}`; cls='amber' }
  else if(plan>0 && left<=TOL(plan)){ st='done'; cls='green' }
  else if(movedOn>0){ st=`moved on ${Math.round(movedOn)}`; cls='amber' }
  else if(early>0.5){ st=`ahead ${Math.round(early)}`; cls='green' }
  else { st= dueClosed>0 ? 'on track' : 'not due yet'; cls='k' }
  return {o, r:o.r, plan, base:o.base, mk, credited, over, dueClosed, monClosed, missed, left, toCome, movedOn, early, st, cls,
          pct: plan>0 ? credited/plan*100 : null};
}
function plantStats(pl){ return Object.values(plans[pl]).sort((a,b)=>a.seq-b.seq).map(o=>rowStat(pl,o)) }
function sum(list,k){ return list.reduce((s,x)=>s+(typeof k==='function'?k(x):x[k]),0) }
function plantTotals(pl){
  const L = plantStats(pl), W=[0,1,2,3].map(j=>sum(L,x=>x.o.w[j])), Wm=[0,1,2,3].map(j=>sum(L,x=>x.o.mon[j]));
  const madeAll = sum(Object.values(made[pl]||{}),v=>v), un = sum(unplanned.filter(u=>u.pl===pl),'t');
  return {L, W, Wm, base:sum(L,'base'), plan:sum(L,'plan'), made:madeAll, credited:sum(L,'credited'), over:sum(L,'over'),
    missed:sum(L,'missed'), toCome:sum(L,'toCome'), movedOn:sum(L,'movedOn'), un, w1made:madeAll+un,
    nBehind:L.filter(x=>x.missed>0).length};
}
// Stock now = opening + made − invoiced, region pool (#252's Opening, same replay)
function stockNow(r){ return P.REGION_PLANTS[r.region].reduce((s,p)=>s+(r.byPlant[p]?.open||0)+((made[p]||{})[r.id]||0),0) - (sold[r.id]||0) }
const unentered = (pl) => M.lastProd[pl] < '2026-11-08';   // a closed week whose last day has no production entered

window.MS = {band, CLOSED, TOL, plans, made, sold, unplanned, log, rowStat, plantStats, plantTotals, stockNow, unentered, sum};
})();
