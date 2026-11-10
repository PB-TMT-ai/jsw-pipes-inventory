// Shared weekly-split rules for the #273 layout variants (throwaway prototype).
(function(){
const P = window.PP;
const T = n => Math.round(n).toLocaleString('en-IN');
// November 2026 starts on a Sunday. Defaults (NOT decided): Mon–Sun weeks, Sunday off,
// a part week with fewer than 3 working days joins its neighbour.
const WEEKS = [
  {k:'W1', dates:'1–8 Nov',   days:6, dayList:[2,3,4,5,6,7],       note:'Sun 1 Nov joined in'},
  {k:'W2', dates:'9–15 Nov',  days:6, dayList:[9,10,11,12,13,14]},
  {k:'W3', dates:'16–22 Nov', days:6, dayList:[16,17,18,19,20,21]},
  {k:'W4', dates:'23–30 Nov', days:7, dayList:[23,24,25,26,27,28,30], note:'Mon 30 Nov joined in'},
];
const DAYS = WEEKS.reduce((s,w)=>s+w.days,0);
// October production per plant, live productions table 5-Nov-2026, not independently verified.
const OCT_MADE = {hyderabad:835.1, lepakshi:588.6, npmd:691.5, tapi:1344.4};
const SEC = {SHS:0, RHS:1, CHS:2};

// Two-option rows: #253 says "last month's plant". No last month yet, so the plant that invoiced
// more in October stands in. A2's South 50x50 2.0 split (Hyd 50 / Lep 20) is kept.
P.rows.forEach(r=>{ if(r.plants.length===2 && !r.choice)
  r.choice = r.plants.slice().sort((a,b)=>(r.byPlant[b]?.oct||0)-(r.byPlant[a]?.oct||0))[0]; });

const campaign = plant => P.rows.map(r=>({r, t:P.share(r,plant)})).filter(x=>x.t>0);
function sorted(list, order){
  const key = x => { const k=P.sizeKey(x.r.size); return order==='thk'
      ? [x.r.thk, SEC[x.r.section], k[0], k[1], k[2]]
      : [SEC[x.r.section], k[0], k[1], k[2], x.r.thk] };
  return list.slice().sort((a,b)=>{ const A=key(a),B=key(b); for(let i=0;i<A.length;i++){ if(A[i]!==B[i]) return A[i]-B[i] } return 0 });
}
// The app's proposal: walk the run order; each whole row lands in the week where the middle of its
// tonnes falls, each week's share of the month set by its working days.
function propose(seq){
  const total = seq.reduce((s,x)=>s+x.t,0); const edges=[]; let c=0;
  WEEKS.forEach(w=>{ c+=w.days; edges.push(c/DAYS) });
  let cum=0;
  return seq.map(x=>{ const mid=(cum+x.t/2)/total; cum+=x.t; let w=edges.findIndex(e=>mid<=e+1e-9); return w<0?WEEKS.length-1:w });
}
const pins = {};   // pins[plant][rowId] = week index, set when the planner moves a row
function plan(plant, order){
  const seq = sorted(campaign(plant), order), auto = propose(seq), pp = pins[plant]||{};
  const wk = seq.map((x,i)=> pp[x.r.id]!=null ? pp[x.r.id] : auto[i]);
  const total = seq.reduce((s,x)=>s+x.t,0);
  const W = WEEKS.map(()=>({t:0, rows:0, changes:0, last:null}));
  seq.forEach((x,i)=>{ const w=W[wk[i]]; w.t+=x.t; w.rows++; if(w.last && w.last!==x.r.size) w.changes++; w.last=x.r.size });
  W.forEach((w,i)=>{ w.even = total*WEEKS[i].days/DAYS });
  return {seq, auto, wk, total, W, pinned:id=>pp[id]!=null, nPins:Object.keys(pp).length,
          changes:W.reduce((s,w)=>s+w.changes,0)};
}
function move(plant, id, w){ (pins[plant] ||= {})[id] = w }
function unpin(plant, id){ if(pins[plant]) delete pins[plant][id] }
function resetPins(plant){ pins[plant] = {} }

// The whole flow, shown on every variant. `here` = step numbers this screen covers.
function flowHtml(here){
  const S = [
    ['Planning master','rows, ticks, buffer','done','#249'],
    ['Monthly Indent','typed per region','done','#254'],
    ['Suggested → Planned','formula, ↑ to 10','done','#252'],
    ['Plant assigned / Split','one row, one plant','done','#253'],
    ['Finalise → Baseline','admin, per region','done','#255'],
    ['Weeks proposed, moved, split','app proposes · planner adjusts','done','#273'],
    ['Coil vs plan','slit + HR, week order','done','#276'],
    ['Week ends','leftover stays red till moved','done','#273'],
    ['Monitoring','latest plan vs actual','wait','#274'],
  ];
  return `<ol class="flow8">${S.map((s,i)=>`<li class="${s[2]}${here.includes(i+1)?' here':''}"><span class="sn">${i+1}</span><span><b>${s[0]}</b><br><span class="sub">${s[1]} · ${s[3]}</span></span></li>`).join('')}</ol>`;
}
const exampleNote = (pname,total,plant) => `<b>Example data.</b> Monthly Indents are October sales rounded up to 10, so ${pname}'s ${T(total)} T plan is ${T(total/OCT_MADE[plant]*100)}% of what it made in October (${T(OCT_MADE[plant])} T). No capacity check is made (#272 is out of scope). Live snapshot 4–5 Nov 2026, not independently verified.`;
const defaultsNote = `<b>My defaults, not decided:</b> Mon–Sun weeks; Sunday off; a part week under 3 working days joins its neighbour (Sun 1 Nov → W1, Mon 30 Nov → W4). Each whole row goes to the week where the middle of its tonnes falls, and each week gets a share of the month equal to its working days (6 / 6 / 6 / 7 of 25). "Size changes" = a change of size between back-to-back rows, a rough stand-in for roll changes.`;

window.WK = {P,T,WEEKS,DAYS,OCT_MADE,plan,move,unpin,resetPins,flowHtml,exampleNote,defaultsNote};
})();
// Shared top controls: plant and run order. Variants call WK.controls(st) inside their render.
window.WK.controls = function(st, opts={}){
  const P = window.PP;
  const plants = (opts.plants || Object.keys(P.PLANTS));
  const pl = opts.noPlant ? '' : `<div class="seg" aria-label="Plant">${plants.map(p=>`<button data-plant="${p}" aria-pressed="${p===st.plant}">${P.PLANTS[p].name}</button>`).join('')}</div>`;
  return `${pl}<span class="lbl">Run order</span><div class="seg" aria-label="Run order">
    <button data-order="size" aria-pressed="${st.order==='size'}">Size, then thin → thick</button>
    <button data-order="thk" aria-pressed="${st.order==='thk'}">Thin → thick, all sizes</button></div>`;
};
window.WK.wire = function(st, render){
  document.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    if(b.dataset.plant){ st.plant=b.dataset.plant; render(); }
    else if(b.dataset.order){ st.order=b.dataset.order; render(); }
    else if(b.dataset.reset!=null){ WK.resetPins(st.plant); render(); }
    else if(b.dataset.unpin!=null){ WK.unpin(st.plant, b.dataset.unpin); render(); }
  });
};
