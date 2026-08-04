<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>P&amp;T Command Centre — seven views, one flow</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  button, select { font: inherit; }

  :root {
    --ground:#F6F8F9; --surface:#FFFFFF; --sunken:#EDF1F3; --sunken-2:#E3E9ED;
    --ink-1:#12171B; --ink-2:#45505A; --ink-3:#59646E;
    --rule:#DDE3E7; --rule-2:#C6D0D6;
    --accent:#1B5E8A; --accent-w:#E4EFF6;
    --ok:#0E6B54; --ok-w:#E1F1EC;
    --watch:#8A5D00; --watch-w:#F7EEDA;
    --act:#A8351B; --act-w:#F8E7E2;
    --ai:#5B4B8A; --ai-w:#EDE9F6;
    --shadow:0 1px 2px rgba(18,23,27,.06), 0 8px 24px rgba(18,23,27,.07);
    --ui:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;
    --display:"Segoe UI Variable Display","Segoe UI Semibold","Segoe UI",system-ui,sans-serif;
    --mono:ui-monospace,"Cascadia Mono",Consolas,"SF Mono",Menlo,monospace;
  }
  :root[data-theme="dark"] {
    --ground:#0D1114; --surface:#151A1F; --sunken:#1D242A; --sunken-2:#232C33;
    --ink-1:#E9EDF0; --ink-2:#AEB9C2; --ink-3:#8E9AA4;
    --rule:#262F36; --rule-2:#36424B;
    --accent:#5FADE0; --accent-w:#12303F;
    --ok:#45C49B; --ok-w:#0F2E27;
    --watch:#E2AC45; --watch-w:#33270F;
    --act:#F2795A; --act-w:#3A1B14;
    --ai:#B3A3E0; --ai-w:#231C38;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.45);
  }

  body { background:var(--ground); color:var(--ink-1); font-family:var(--ui); font-size:14px; line-height:1.45; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1380px; margin:0 auto; padding:0 20px 80px; }

  .top { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:14px 0 12px; border-bottom:1px solid var(--rule); }
  .top h1 { font-family:var(--display); font-size:16px; font-weight:650; letter-spacing:-.01em; margin:0 auto 0 0; }
  .chip { font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; font-weight:700; padding:3px 8px; border-radius:3px; white-space:nowrap; }
  .chip.warn { background:var(--watch-w); color:var(--watch); }
  .chip.q { background:var(--sunken); color:var(--ink-2); }
  #theme { border:1px solid var(--rule-2); background:var(--surface); color:var(--ink-2); font-size:10.5px; font-weight:700;
           letter-spacing:.06em; text-transform:uppercase; padding:4px 10px; border-radius:4px; cursor:pointer; }
  #theme:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }

  .views { display:flex; gap:2px; overflow-x:auto; padding-top:10px; }
  .views button { background:none; border:0; border-bottom:2px solid transparent; color:var(--ink-3); font-size:13px; font-weight:600;
                  padding:8px 13px 9px; cursor:pointer; white-space:nowrap; }
  .views button:hover { color:var(--ink-1); }
  .views button[aria-selected="true"] { color:var(--accent); border-bottom-color:var(--accent); }
  .views button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  .seg { display:inline-flex; border:1px solid var(--rule-2); border-radius:5px; overflow:hidden; margin-bottom:14px; }
  .seg button { background:var(--surface); border:0; border-right:1px solid var(--rule-2); color:var(--ink-2);
                font-size:12.5px; font-weight:600; padding:5px 14px; cursor:pointer; }
  .seg button:last-child { border-right:0; }
  .seg button[aria-pressed="true"] { background:var(--accent); color:#fff; }
  .seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  .timebar { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; padding:12px 0 0; }
  .timebar .seg { margin-bottom:0; }
  .tb-nav { display:inline-flex; align-items:center; gap:8px; }
  .tb-nav button { border:1px solid var(--rule-2); background:var(--surface); color:var(--ink-2); width:24px; height:24px;
                   border-radius:4px; font-size:14px; line-height:1; cursor:pointer; }
  .tb-nav button:disabled { opacity:.4; cursor:not-allowed; }
  .tb-nav button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .tb-label { font-family:var(--display); font-size:15px; font-weight:650; min-width:215px; text-align:center; }
  .tb-state { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; letter-spacing:.05em;
              text-transform:uppercase; color:var(--ink-2); }
  .tb-state::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--watch); }
  .tb-sub { font-size:12.5px; color:var(--ink-3); margin:7px 0 0; max-width:96ch; }
  .tb-sub b { color:var(--ink-2); font-weight:650; }

  .filters { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:11px 0 13px; border-bottom:1px solid var(--rule); }
  .filters label { display:flex; align-items:center; gap:6px; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); font-weight:700; }
  .filters select { background:var(--surface); border:1px solid var(--rule-2); color:var(--ink-1); border-radius:4px;
                    padding:4px 7px; font-size:12.5px; font-family:var(--ui); cursor:pointer; max-width:200px; }
  .filters select:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .filters .spacer { margin-left:auto; }
  .filters .reset { background:none; border:1px solid var(--rule-2); color:var(--ink-2); border-radius:4px; padding:4px 10px; font-size:12px; cursor:pointer; }

  .read { display:flex; gap:10px; align-items:flex-start; margin:14px 0 16px; padding:10px 13px;
          background:var(--ai-w); border-left:2px solid var(--ai); border-radius:0 5px 5px 0; }
  .read .tag { font-size:9.5px; letter-spacing:.09em; text-transform:uppercase; font-weight:800; color:var(--ai); white-space:nowrap; padding-top:2px; }
  .read p { margin:0; font-size:13.5px; color:var(--ink-2); max-width:84ch; }
  .read p b { color:var(--ink-1); font-weight:650; }

  .b { font-family:var(--mono); font-variant-numeric:tabular-nums; border:0; background:none; padding:0; color:inherit;
       font-size:inherit; font-weight:inherit; border-bottom:1px dotted var(--rule-2); cursor:pointer; line-height:1.2; }
  .b:hover { border-bottom:2px solid var(--accent); }
  .b:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:2px; }
  .b[aria-expanded="true"] { border-bottom:2px solid var(--accent); }

  .st { font-size:10px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; padding:2px 6px; border-radius:3px;
        white-space:nowrap; display:inline-flex; align-items:center; gap:4px; font-family:var(--ui); }
  .st::before { content:""; width:6px; height:6px; flex:none; }
  .st-act{background:var(--act-w);color:var(--act)}      .st-act::before{background:var(--act);clip-path:polygon(50% 0,100% 100%,0 100%)}
  .st-watch{background:var(--watch-w);color:var(--watch)} .st-watch::before{background:var(--watch);border-radius:50%}
  .st-ok{background:var(--ok-w);color:var(--ok)}          .st-ok::before{background:var(--ok)}
  .st-q{background:var(--sunken-2);color:var(--ink-2)}    .st-q::before{background:var(--ink-3);clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}

  .lbl { font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-3); font-weight:700; }

  .pane { background:var(--surface); border:1px solid var(--rule); border-radius:6px; box-shadow:var(--shadow); margin-bottom:14px; overflow:hidden; }
  .pane > h3 { font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-2); font-weight:800; margin:0;
               padding:8px 13px; background:var(--sunken); display:flex; gap:10px; align-items:center; border-bottom:1px solid var(--rule); }
  .pane > h3 em { font-style:normal; text-transform:none; letter-spacing:.01em; font-weight:600; font-size:11.5px; color:var(--ink-3); font-family:var(--mono); }
  .tw { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:12.5px; }
  th { font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); font-weight:700; text-align:right;
       padding:6px 12px 5px; border-bottom:1px solid var(--rule); white-space:nowrap; background:var(--surface); }
  th:first-child, td:first-child { text-align:left; }
  th.l, td.l { text-align:left; }
  td { padding:5px 12px; border-bottom:1px solid var(--rule); text-align:right; white-space:nowrap;
       font-family:var(--mono); font-variant-numeric:tabular-nums; }
  td.l { font-family:var(--ui); }
  td.m { font-family:var(--mono); }
  tbody tr:hover td { background:var(--sunken); }
  tr.tot td { font-weight:700; background:var(--sunken); border-top:1px solid var(--rule-2); border-bottom:0; }
  tr.tot:hover td { background:var(--sunken); }
  tr.sec td { background:var(--sunken-2); font-weight:700; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase;
              color:var(--ink-2); border-top:1px solid var(--rule-2); }
  tr.sec:hover td { background:var(--sunken-2); }
  tr.sec .b { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; }
  tr.off { display:none; }
  .neg { color:var(--act); }
  .pos { color:var(--ok); }
  .sub { display:block; font-size:9.5px; color:var(--ink-3); font-family:var(--ui); }
  .dim { color:var(--ink-3); }

  .spark { display:inline-flex; align-items:flex-end; gap:2px; height:16px; vertical-align:middle; }
  .spark i { display:block; width:6px; background:var(--rule-2); border-radius:1px 1px 0 0; }
  .spark i.last { background:var(--accent); }

  .flow { display:flex; align-items:stretch; overflow-x:auto; padding:18px 13px 6px; }
  .node { flex:1 0 146px; background:var(--sunken); border:1px solid var(--rule-2); border-radius:5px; padding:11px 12px; }
  .node .lbl { display:block; margin-bottom:5px; }
  .node .v { font-family:var(--mono); font-size:21px; font-weight:650; letter-spacing:-.02em; }
  .node .u { font-size:10.5px; color:var(--ink-3); font-family:var(--mono); }
  .node.term { background:var(--accent-w); border-color:var(--accent); }
  .link { flex:0 0 82px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:0 4px; text-align:center; }
  .link .arrow { color:var(--rule-2); font-family:var(--mono); font-size:15px; line-height:1; }
  .link .drop { font-family:var(--mono); font-size:11.5px; font-weight:700; }
  .link .why { font-size:9.5px; color:var(--ink-3); line-height:1.25; }
  .stockrow { display:flex; align-items:stretch; padding:0 13px 16px; overflow-x:auto; }

  .cap { padding:12px 13px 14px; display:flex; flex-direction:column; gap:7px; }
  .cap .track { height:20px; background:var(--sunken); border:1px solid var(--rule-2); border-radius:4px; display:flex; overflow:hidden; }
  .cap .track i { display:block; height:100%; }
  .cap .track i.used { background:var(--accent); }
  .cap .track i.idle { background:repeating-linear-gradient(45deg,var(--sunken-2) 0 6px,var(--surface) 6px 12px); }
  .cap .key { display:flex; gap:16px; font-size:11.5px; color:var(--ink-2); flex-wrap:wrap; }
  .cap .key span::before { content:""; display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; }
  .cap .key .k1::before { background:var(--accent); }
  .cap .key .k2::before { background:var(--sunken-2); border:1px solid var(--rule-2); }

  .rail { position:fixed; top:0; right:0; height:100%; width:min(420px,92vw); background:var(--surface);
          border-left:1px solid var(--rule-2); box-shadow:var(--shadow); display:flex; flex-direction:column; z-index:40;
          transform:translateX(101%); transition:transform .22s cubic-bezier(.4,0,.2,1); visibility:hidden; }
  .rail.open { transform:none; visibility:visible; }
  @media (prefers-reduced-motion:reduce){ .rail{transition:none} }
  .rail header { display:flex; align-items:flex-start; gap:12px; padding:14px 15px 12px; border-bottom:1px solid var(--rule); }
  .rail header div { margin-right:auto; }
  .rail header h4 { font-family:var(--display); font-size:14.5px; font-weight:650; margin:2px 0 0; }
  .rail header button { border:1px solid var(--rule-2); background:var(--surface); color:var(--ink-2); width:25px; height:25px;
                        border-radius:5px; cursor:pointer; font-size:14px; line-height:1; flex:none; }
  .rail header button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .rail .body { overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:18px; }
  .rail .body > div > .lbl { display:block; margin-bottom:7px; }
  .rail .body p { margin:0; }
  .fx { display:grid; grid-auto-flow:column; gap:0 8px; overflow-x:auto; padding-bottom:5px; }
  .fx > div { display:grid; grid-template-rows:subgrid; grid-row:span 3; justify-items:center; text-align:center; gap:4px; }
  .fx .term { font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); font-weight:700; }
  .fx .val { font-family:var(--mono); font-size:15px; font-weight:650; font-variant-numeric:tabular-nums; }
  .fx .src { font-size:9.5px; color:var(--ink-3); line-height:1.3; }
  .fx .op .val { color:var(--ink-3); font-weight:400; }
  .fx .op .term, .fx .op .src { visibility:hidden; }
  .band .track { height:6px; border-radius:3px; background:linear-gradient(to right,var(--act) 0 42%,var(--watch) 42% 58%,var(--ok) 58% 100%); position:relative; }
  .band .track i { position:absolute; top:-4px; width:2px; height:14px; background:var(--ink-1); }
  .contrib { display:flex; flex-direction:column; gap:6px; }
  .contrib div { display:grid; grid-template-columns:1fr auto; gap:10px; font-size:12px; align-items:center; }
  .contrib .cb { grid-column:1/-1; height:5px; background:var(--sunken); border-radius:3px; overflow:hidden; }
  .contrib .cb i { display:block; height:100%; background:var(--act); }
  .cf { background:var(--sunken); border-left:2px solid var(--accent); padding:9px 11px; font-size:12.5px; color:var(--ink-2); border-radius:0 5px 5px 0; }
  .cf b { color:var(--ink-1); font-weight:650; }
  .rule-txt { font-size:12px; color:var(--ink-2); }
  .meta { font-size:10.5px; color:var(--ink-3); font-family:var(--mono); border-top:1px solid var(--rule); padding-top:11px; line-height:1.65; }
  .scrim { position:fixed; inset:0; background:rgba(10,14,17,.32); z-index:30; opacity:0; pointer-events:none; transition:opacity .22s; }
  .scrim.open { opacity:1; pointer-events:auto; }

  .view[hidden] { display:none; }
  .note { font-size:11.5px; color:var(--ink-3); padding:9px 13px; border-top:1px solid var(--rule); background:var(--sunken); }
  .asks { margin-top:34px; border-top:2px solid var(--ink-1); padding-top:18px; }
  .asks h2 { font-family:var(--display); font-size:16px; margin:0 0 14px; }
  .asks ol { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:10px; max-width:78ch; }
  .asks li { font-size:13.5px; color:var(--ink-2); }
  .asks li b { color:var(--ink-1); font-weight:650; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
  @media (max-width:760px){ .grid2{grid-template-columns:1fr} }
</style>
</head>
<body>

<div class="wrap">
  <div class="top">
    <h1>P&amp;T Command Centre</h1>
    <span class="chip warn">Sample data — invented, internally consistent</span>
    <span class="chip q">Today · Tue 28 Jul 2026</span>
    <button id="theme">Dark</button>
  </div>

  <nav class="views" role="tablist" aria-label="View">
    <button role="tab" id="t-flow"  aria-controls="v-flow"  aria-selected="true">Flow</button>
    <button role="tab" id="t-sales" aria-controls="v-sales" aria-selected="false">Sales &amp; chase</button>
    <button role="tab" id="t-dist"  aria-controls="v-dist"  aria-selected="false">Distributors</button>
    <button role="tab" id="t-plan"  aria-controls="v-plan"  aria-selected="false">Campaign planning</button>
    <button role="tab" id="t-coil"  aria-controls="v-coil"  aria-selected="false">Coils to order</button>
    <button role="tab" id="t-mon"   aria-controls="v-mon"   aria-selected="false">Campaign monitoring</button>
    <button role="tab" id="t-inv"   aria-controls="v-inv"   aria-selected="false">Inventory vs orders</button>
    <button role="tab" id="t-ord"   aria-controls="v-ord"   aria-selected="false">Orders &amp; invoices</button>
  </nav>

  <div class="timebar">
    <div class="seg" role="group" aria-label="Period length">
      <button id="g-week" aria-pressed="false">Week</button>
      <button id="g-month" aria-pressed="true">Month</button>
      <button id="g-year" aria-pressed="false" disabled title="Not built in this sample">Year</button>
    </div>
    <div class="tb-nav">
      <button id="p-prev" aria-label="Previous period" disabled title="Sample data covers July 2026 only">&lsaquo;</button>
      <span class="tb-label" id="p-label">July 2026</span>
      <button id="p-next" aria-label="Next period" disabled title="Sample data covers July 2026 only">&rsaquo;</button>
    </div>
    <span class="tb-state" id="p-state">Running · day 28 of 31</span>
  </div>
  <p class="tb-sub" id="p-sub">One control, whole cockpit. Every view below is <b>July 2026</b>. <b>Campaign planning</b> and <b>Coils to order</b> look one month ahead to August, because planning is forward-looking — their headings say so.</p>

  <div class="filters">
    <label>Plant <select id="f-plant"><option value="">All plants</option><option value="A">Raipur</option><option value="B">Bhiwadi</option><option value="C">Hosur</option></select></label>
    <label>Mill <select id="f-mill"><option value="">All mills</option><option>Mill 1</option><option>Mill 2</option><option>Mill 3</option><option>Mill 4</option><option>Mill 5</option><option>Mill 6</option></select></label>
    <label>Family <select id="f-fam"><option value="">All families</option><option>40 NB Round</option><option>50 NB Round</option><option>80 NB Round</option><option>100 NB Round</option><option>25×25 SHS</option><option>40×40 SHS</option><option>60×40 RHS</option></select></label>
    <label>Thickness <select id="f-thk"><option value="">All</option><option>2.0</option><option>2.6</option><option>3.2</option></select></label>
    <label>Distributor <select id="f-dist"><option value="">All distributors</option><option>Metro Steel Syndicate</option><option>Shree Balaji Steel</option><option>Deepak Tubes &amp; Pipes</option><option>Kisan Agencies</option><option>Anand Steel Traders</option><option>Sunrise Steel Co</option><option>Bharat Pipe House</option><option>Ganesh Steel Traders</option></select></label>
    <label>Status <select id="f-status"><option value="">Any status</option><option>Awaiting payment</option><option>Paid — not scheduled</option><option>In production</option><option>Produced — awaiting dispatch</option><option>Part-dispatched</option><option>Invoiced</option></select></label>
    <span class="spacer"></span>
    <button class="reset" id="f-reset">Clear filters</button>
  </div>

  <!-- ═══════════ FLOW ═══════════ -->
  <div class="view" id="v-flow" role="tabpanel" aria-labelledby="t-flow">
    <div class="read"><span class="tag">Read</span><p>Written by the system from the figures below. <b>530 MT is ordered but unpaid</b> and has not entered production — the largest break in the chain, and the only one you can act on today. <b>190 MT sits produced but undispatched</b>, and stock has climbed to 1,080 MT against 832 MT of open orders. That looks comfortable and is not: <b>158 MT of open orders are in sizes you do not hold</b>.</p></div>

    <div class="pane">
      <h3>The month so far <em>July 2026 · month-to-date · all plants</em></h3>
      <div class="flow">
        <div class="node"><span class="lbl">Ordered</span><div class="v"><button class="b" data-basis="ordered">2,622</button></div><span class="u">MT · 34 distributors</span></div>
        <div class="link"><span class="drop neg">−530</span><span class="arrow">→</span><span class="why">not paid for</span></div>
        <div class="node"><span class="lbl">Paid</span><div class="v"><button class="b" data-basis="paid">2,092</button></div><span class="u">MT · 79.8%</span></div>
        <div class="link"><span class="drop neg">−112</span><span class="arrow">→</span><span class="why">not yet scheduled</span></div>
        <div class="node"><span class="lbl">Produced</span><div class="v"><button class="b" data-basis="produced">1,980</button></div><span class="u">MT · of 2,480 plan</span></div>
        <div class="link"><span class="drop neg">−190</span><span class="arrow">→</span><span class="why">made, not sent</span></div>
        <div class="node"><span class="lbl">Dispatched</span><div class="v">1,790</div><span class="u">MT</span></div>
        <div class="link"><span class="drop pos">0</span><span class="arrow">→</span><span class="why">invoice on dispatch</span></div>
        <div class="node term"><span class="lbl">Invoiced</span><div class="v">1,790</div><span class="u">MT · ₹104.5 cr</span></div>
      </div>
      <div class="stockrow">
        <div class="node"><span class="lbl">Opening stock 1 Jul</span><div class="v">890</div><span class="u">MT</span></div>
        <div class="link"><span class="drop pos">+1,980</span><span class="arrow">→</span><span class="why">produced</span></div>
        <div class="node"><span class="lbl">Less dispatched</span><div class="v">−1,790</div><span class="u">MT</span></div>
        <div class="link"><span class="arrow">=</span></div>
        <div class="node term"><span class="lbl">Stock today</span><div class="v"><button class="b" data-basis="stock">1,080</button></div><span class="u">MT · 9 SKUs</span></div>
        <div class="link"><span class="arrow">vs</span></div>
        <div class="node"><span class="lbl">Open orders</span><div class="v">832</div><span class="u">MT · not dispatched</span></div>
      </div>
      <div class="note">Every figure above reconciles with the view it belongs to. The flow is deliberately whole-business — filters bite from the next view onward.</div>
    </div>

    <div class="grid2">
      <div class="pane">
        <h3>Where it is stuck <em>4 breaks · 2 actionable</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Break</th><th>MT</th><th>Value</th><th class="l">Owner</th><th>State</th></tr></thead>
          <tbody>
            <tr><td class="l">Ordered, not paid</td><td>530</td><td>₹3.10 cr</td><td class="l">You → sales mgr</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td class="l">Paid, not scheduled</td><td>112</td><td>₹0.65 cr</td><td class="l">Planning</td><td><span class="st st-watch">Watch</span></td></tr>
            <tr><td class="l">Produced, not dispatched</td><td>190</td><td>₹1.11 cr</td><td class="l">Despatch</td><td><span class="st st-watch">Watch</span></td></tr>
            <tr><td class="l">Orders in sizes not held</td><td>158</td><td>₹0.92 cr</td><td class="l">Planning</td><td><span class="st st-act">Act</span></td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="pane">
        <h3>Month against plan <em>day 28 of 31</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Measure</th><th>Plan</th><th>Actual</th><th>Gap</th><th>State</th></tr></thead>
          <tbody>
            <tr><td class="l">Production</td><td>2,480</td><td>1,980</td><td class="neg">−500</td><td><span class="st st-watch">Watch</span></td></tr>
            <tr><td class="l">Dispatch</td><td>2,400</td><td>1,790</td><td class="neg">−610</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td class="l">Order intake</td><td>2,500</td><td>2,622</td><td class="pos">+122</td><td><span class="st st-ok">Met</span></td></tr>
            <tr><td class="l">Closing stock</td><td>970</td><td>1,080</td><td class="neg">+110</td><td><span class="st st-watch">Watch</span></td></tr>
          </tbody>
        </table></div>
        <div class="note">500 MT of production is still scheduled inside the month — behind, not lost. Three days left to make it.</div>
      </div>
    </div>
  </div>

  <!-- ═══════════ SALES & CHASE ═══════════ -->
  <div class="view" id="v-sales" role="tabpanel" aria-labelledby="t-sales" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. <b>Five distributors have open estimates this cycle; four have not paid in full.</b> Metro Steel is both the largest and the oldest at 240 MT and 15 days — alone it is 45% of the gap. Clearing Metro and Balaji recovers <b>420 of the 530 MT</b>.</p></div>

    <div class="pane">
      <h3>Chase list <em>530 MT unpaid · ₹3.10 cr · sorted by value at risk</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Distributor</th><th class="l">City</th><th class="l">Region</th><th>Expected</th><th>Paid</th><th>Unpaid</th><th>Value</th><th>Days open</th><th>State</th></tr></thead>
        <tbody>
          <tr data-dist="Metro Steel Syndicate"><td class="l">Metro Steel Syndicate</td><td class="l">Ludhiana</td><td class="l">North</td><td data-sum>240</td><td data-sum>0</td><td data-sum><button class="b" data-basis="metro">240</button></td><td>₹140.2 L</td><td>15</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-dist="Shree Balaji Steel"><td class="l">Shree Balaji Steel</td><td class="l">Nagpur</td><td class="l">West</td><td data-sum>180</td><td data-sum>0</td><td data-sum>180</td><td>₹105.1 L</td><td>9</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-dist="Deepak Tubes &amp; Pipes"><td class="l">Deepak Tubes &amp; Pipes</td><td class="l">Indore</td><td class="l">West</td><td data-sum>145</td><td data-sum>60</td><td data-sum>85</td><td>₹49.6 L</td><td>12</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-dist="Kisan Agencies"><td class="l">Kisan Agencies</td><td class="l">Rajkot</td><td class="l">West</td><td data-sum>120</td><td data-sum>95</td><td data-sum>25</td><td>₹14.6 L</td><td>4</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-dist="Anand Steel Traders"><td class="l">Anand Steel Traders</td><td class="l">Surat</td><td class="l">West</td><td data-sum>90</td><td data-sum>90</td><td data-sum>0</td><td>—</td><td>—</td><td><span class="st st-ok">Clear</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td data-tot>775</td><td data-tot>245</td><td data-tot>530</td><td>₹309.5 L</td><td>—</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">"Paid" means money received against the expected quantity — not that a purchase order exists. Age runs from the day the estimate locked.</div>
    </div>

    <div class="grid2">
      <div class="pane">
        <h3>Order funnel <em>July · month-to-date</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Stage</th><th>MT</th><th>of intake</th><th>Held here</th></tr></thead>
          <tbody>
            <tr><td class="l">Order received</td><td>2,622</td><td>100.0%</td><td>—</td></tr>
            <tr><td class="l">Payment received</td><td>2,092</td><td>79.8%</td><td class="neg">530</td></tr>
            <tr><td class="l">Scheduled into a campaign</td><td>1,980</td><td>75.5%</td><td class="neg">112</td></tr>
            <tr><td class="l">Produced</td><td>1,980</td><td>75.5%</td><td>0</td></tr>
            <tr><td class="l">Dispatched</td><td>1,790</td><td>68.3%</td><td class="neg">190</td></tr>
            <tr class="tot"><td class="l">Invoiced</td><td>1,790</td><td>68.3%</td><td>—</td></tr>
          </tbody>
        </table></div>
        <div class="note">Stage names are provisional — the real ERP states are still being gathered.</div>
      </div>
      <div class="pane">
        <h3>Intake by family <em>July · orders received</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Family</th><th>MT</th><th>vs June</th><th>Share</th></tr></thead>
          <tbody>
            <tr data-fam="40 NB Round"><td class="l">40 NB Round</td><td data-sum>842</td><td class="pos">+6.2%</td><td>32.1%</td></tr>
            <tr data-fam="50 NB Round"><td class="l">50 NB Round</td><td data-sum>701</td><td class="pos">+2.1%</td><td>26.7%</td></tr>
            <tr data-fam="25×25 SHS"><td class="l">25×25 SHS</td><td data-sum>445</td><td class="neg">−8.4%</td><td>17.0%</td></tr>
            <tr data-fam="60×40 RHS"><td class="l">60×40 RHS</td><td data-sum>298</td><td class="pos">+11.3%</td><td>11.4%</td></tr>
            <tr data-fam="40×40 SHS"><td class="l">40×40 SHS</td><td data-sum>194</td><td class="neg">−15.7%</td><td>7.4%</td></tr>
            <tr data-fam="80 NB Round"><td class="l">80 NB Round</td><td data-sum>142</td><td class="neg">−22.4%</td><td>5.4%</td></tr>
          </tbody>
          <tfoot><tr class="tot"><td class="l">Total</td><td data-tot>2,622</td><td class="pos">+2.8%</td><td>100%</td></tr></tfoot>
        </table></div>
      </div>
    </div>

    <div class="pane">
      <h3>Intake by SKU <em>July · 9 SKUs · size × thickness</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Plant</th><th class="l">Mill</th><th>Ordered</th><th>Unpaid</th><th>Unpaid %</th><th>vs June</th><th>Share</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>486</td><td class="neg" data-sum>206</td><td>42.4%</td><td class="pos">+14.2%</td><td>18.5%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>388</td><td class="neg" data-sum>180</td><td>46.4%</td><td class="pos">+5.8%</td><td>14.8%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>356</td><td class="neg" data-sum>84</td><td>23.6%</td><td class="neg">−3.5%</td><td>13.6%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>313</td><td data-sum>0</td><td>—</td><td class="neg">−2.2%</td><td>11.9%</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS</td><td class="l">3.2</td><td class="l">Hosur</td><td class="l">Mill 5</td><td data-sum>298</td><td class="neg" data-sum>35</td><td>11.7%</td><td class="pos">+11.3%</td><td>11.4%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>262</td><td class="neg" data-sum>25</td><td>9.5%</td><td class="neg">−12.4%</td><td>10.0%</td><td><span class="st st-watch">Falling</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS" data-thk="2.6"><td class="l">40×40 SHS</td><td class="l">2.6</td><td class="l">Bhiwadi</td><td class="l">Mill 4</td><td data-sum>194</td><td data-sum>0</td><td>—</td><td class="neg">−15.7%</td><td>7.4%</td><td><span class="st st-watch">Falling</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS</td><td class="l">3.2</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>183</td><td data-sum>0</td><td>—</td><td class="neg">−2.1%</td><td>7.0%</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round" data-thk="3.2"><td class="l">80 NB Round</td><td class="l">3.2</td><td class="l">Hosur</td><td class="l">Mill 6</td><td data-sum>142</td><td data-sum>0</td><td>—</td><td class="neg">−22.4%</td><td>5.4%</td><td><span class="st st-act">Falling hard</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>2,622</td><td class="neg" data-tot>530</td><td>20.2%</td><td class="pos">+2.8%</td><td>100%</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">The unpaid money is not spread evenly — it sits almost entirely in the two 2.6 mm SKUs, which carry 386 of the 530 MT between them. 80 NB is down 22% and has nothing unpaid, because almost nobody is ordering it.</div>
    </div>
  </div>

  <!-- ═══════════ ORDERS & INVOICES ═══════════ -->
  <div class="view" id="v-ord" role="tabpanel" aria-labelledby="t-ord" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. <b>Seven order lines are awaiting payment and none has moved in over four days.</b> Two lines — SO-7401 and SO-7404, 190 MT together — have been <b>produced and sitting undispatched since the 10th and 11th</b>; that is finished stock the customer has already paid for. One line, SO-7390, is <b>part-dispatched with 46 MT still open</b>.</p></div>

    <div class="pane">
      <h3>Status summary <em>July · 1,052 order lines · 2,622 MT</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Status</th><th>Lines</th><th>MT</th><th>Value</th><th>Oldest</th><th>State</th></tr></thead>
        <tbody>
          <tr><td class="l">Awaiting payment</td><td>7</td><td>530</td><td>₹3.10 cr</td><td>15 days</td><td><span class="st st-act">Act</span></td></tr>
          <tr><td class="l">Paid — not scheduled</td><td>2</td><td>112</td><td>₹0.65 cr</td><td>5 days</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr><td class="l">In production</td><td>0</td><td>0</td><td>—</td><td>—</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr><td class="l">Produced — awaiting dispatch</td><td>2</td><td>190</td><td>₹1.11 cr</td><td>18 days</td><td><span class="st st-act">Act</span></td></tr>
          <tr><td class="l">Part-dispatched</td><td>1</td><td>46</td><td>₹0.27 cr</td><td>19 days</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr><td class="l">Invoiced</td><td>1,040</td><td>1,744</td><td>₹101.8 cr</td><td>—</td><td><span class="st st-ok">Closed</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td>1,052</td><td>2,622</td><td>₹153.1 cr</td><td>—</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
    </div>

    <div class="pane">
      <h3>Order lines <em>showing 16 of 1,052 · every filter above applies</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Order</th><th class="l">Date</th><th class="l">Distributor</th><th class="l">Family</th><th class="l">Thk</th><th>Qty</th><th class="l">Plant</th><th class="l">Mill</th><th class="l">Status</th><th class="l">Invoice</th><th>Value</th><th>Age</th></tr></thead>
        <tbody>
          <tr data-dist="Metro Steel Syndicate" data-fam="40 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 2" data-status="Awaiting payment"><td class="l m">SO-7412</td><td class="l">13 Jul</td><td class="l">Metro Steel Syndicate</td><td class="l">40 NB Round</td><td class="l">2.6</td><td data-sum>121</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-act">Awaiting payment</span></td><td class="l dim">—</td><td>₹70.7 L</td><td>15</td></tr>
          <tr data-dist="Metro Steel Syndicate" data-fam="50 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 1" data-status="Awaiting payment"><td class="l m">SO-7413</td><td class="l">13 Jul</td><td class="l">Metro Steel Syndicate</td><td class="l">50 NB Round</td><td class="l">2.6</td><td data-sum>84</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l"><span class="st st-act">Awaiting payment</span></td><td class="l dim">—</td><td>₹49.1 L</td><td>15</td></tr>
          <tr data-dist="Metro Steel Syndicate" data-fam="60×40 RHS" data-thk="3.2" data-plant="C" data-mill="Mill 5" data-status="Awaiting payment"><td class="l m">SO-7414</td><td class="l">13 Jul</td><td class="l">Metro Steel Syndicate</td><td class="l">60×40 RHS</td><td class="l">3.2</td><td data-sum>35</td><td class="l">Hosur</td><td class="l">Mill 5</td><td class="l"><span class="st st-act">Awaiting payment</span></td><td class="l dim">—</td><td>₹20.4 L</td><td>15</td></tr>
          <tr data-dist="Shree Balaji Steel" data-fam="50 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 1" data-status="Awaiting payment"><td class="l m">SO-7428</td><td class="l">16 Jul</td><td class="l">Shree Balaji Steel</td><td class="l">50 NB Round</td><td class="l">2.6</td><td data-sum>96</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l"><span class="st st-act">Awaiting payment</span></td><td class="l dim">—</td><td>₹56.1 L</td><td>12</td></tr>
          <tr data-dist="Shree Balaji Steel" data-fam="40 NB Round" data-thk="3.2" data-plant="A" data-mill="Mill 2" data-status="Awaiting payment"><td class="l m">SO-7429</td><td class="l">16 Jul</td><td class="l">Shree Balaji Steel</td><td class="l">40 NB Round</td><td class="l">3.2</td><td data-sum>84</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-act">Awaiting payment</span></td><td class="l dim">—</td><td>₹49.1 L</td><td>12</td></tr>
          <tr data-dist="Deepak Tubes &amp; Pipes" data-fam="40 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 2" data-status="Awaiting payment"><td class="l m">SO-7441</td><td class="l">18 Jul</td><td class="l">Deepak Tubes &amp; Pipes</td><td class="l">40 NB Round</td><td class="l">2.6</td><td data-sum>85</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-watch">Awaiting payment</span></td><td class="l dim">—</td><td>₹49.6 L</td><td>10</td></tr>
          <tr data-dist="Kisan Agencies" data-fam="25×25 SHS" data-thk="2.0" data-plant="B" data-mill="Mill 3" data-status="Awaiting payment"><td class="l m">SO-7455</td><td class="l">22 Jul</td><td class="l">Kisan Agencies</td><td class="l">25×25 SHS</td><td class="l">2.0</td><td data-sum>25</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td class="l"><span class="st st-watch">Awaiting payment</span></td><td class="l dim">—</td><td>₹14.6 L</td><td>6</td></tr>
          <tr data-dist="Sunrise Steel Co" data-fam="60×40 RHS" data-thk="3.2" data-plant="C" data-mill="Mill 5" data-status="Paid — not scheduled"><td class="l m">SO-7460</td><td class="l">23 Jul</td><td class="l">Sunrise Steel Co</td><td class="l">60×40 RHS</td><td class="l">3.2</td><td data-sum>62</td><td class="l">Hosur</td><td class="l">Mill 5</td><td class="l"><span class="st st-watch">Paid — not scheduled</span></td><td class="l dim">—</td><td>₹36.2 L</td><td>5</td></tr>
          <tr data-dist="Ganesh Steel Traders" data-fam="25×25 SHS" data-thk="3.2" data-plant="B" data-mill="Mill 3" data-status="Paid — not scheduled"><td class="l m">SO-7462</td><td class="l">23 Jul</td><td class="l">Ganesh Steel Traders</td><td class="l">25×25 SHS</td><td class="l">3.2</td><td data-sum>50</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td class="l"><span class="st st-watch">Paid — not scheduled</span></td><td class="l dim">—</td><td>₹29.2 L</td><td>5</td></tr>
          <tr data-dist="Anand Steel Traders" data-fam="40 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 2" data-status="Produced — awaiting dispatch"><td class="l m">SO-7401</td><td class="l">10 Jul</td><td class="l">Anand Steel Traders</td><td class="l">40 NB Round</td><td class="l">2.6</td><td data-sum>96</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-act">Produced — awaiting dispatch</span></td><td class="l dim">—</td><td>₹56.1 L</td><td>18</td></tr>
          <tr data-dist="Bharat Pipe House" data-fam="50 NB Round" data-thk="3.2" data-plant="A" data-mill="Mill 1" data-status="Produced — awaiting dispatch"><td class="l m">SO-7404</td><td class="l">11 Jul</td><td class="l">Bharat Pipe House</td><td class="l">50 NB Round</td><td class="l">3.2</td><td data-sum>94</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l"><span class="st st-act">Produced — awaiting dispatch</span></td><td class="l dim">—</td><td>₹54.9 L</td><td>17</td></tr>
          <tr data-dist="Shree Balaji Steel" data-fam="50 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 1" data-status="Part-dispatched"><td class="l m">SO-7390</td><td class="l">9 Jul</td><td class="l">Shree Balaji Steel</td><td class="l">50 NB Round</td><td class="l">2.6</td><td data-sum>138</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l"><span class="st st-watch">Part-dispatched</span><span class="sub">92 sent · 46 open</span></td><td class="l m">INV-20480</td><td>₹80.6 L</td><td>19</td></tr>
          <tr data-dist="Sunrise Steel Co" data-fam="60×40 RHS" data-thk="3.2" data-plant="C" data-mill="Mill 5" data-status="Invoiced"><td class="l m">SO-7385</td><td class="l">9 Jul</td><td class="l">Sunrise Steel Co</td><td class="l">60×40 RHS</td><td class="l">3.2</td><td data-sum>134</td><td class="l">Hosur</td><td class="l">Mill 5</td><td class="l"><span class="st st-ok">Invoiced</span></td><td class="l m">INV-20471</td><td>₹78.3 L</td><td>—</td></tr>
          <tr data-dist="Anand Steel Traders" data-fam="40 NB Round" data-thk="3.2" data-plant="A" data-mill="Mill 2" data-status="Invoiced"><td class="l m">SO-7372</td><td class="l">7 Jul</td><td class="l">Anand Steel Traders</td><td class="l">40 NB Round</td><td class="l">3.2</td><td data-sum>122</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-ok">Invoiced</span></td><td class="l m">INV-20455</td><td>₹71.2 L</td><td>—</td></tr>
          <tr data-dist="Deepak Tubes &amp; Pipes" data-fam="40 NB Round" data-thk="2.6" data-plant="A" data-mill="Mill 2" data-status="Invoiced"><td class="l m">SO-7361</td><td class="l">5 Jul</td><td class="l">Deepak Tubes &amp; Pipes</td><td class="l">40 NB Round</td><td class="l">2.6</td><td data-sum>142</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l"><span class="st st-ok">Invoiced</span></td><td class="l m">INV-20437</td><td>₹82.9 L</td><td>—</td></tr>
          <tr data-dist="Kisan Agencies" data-fam="25×25 SHS" data-thk="2.0" data-plant="B" data-mill="Mill 3" data-status="Invoiced"><td class="l m">SO-7350</td><td class="l">3 Jul</td><td class="l">Kisan Agencies</td><td class="l">25×25 SHS</td><td class="l">2.0</td><td data-sum>118</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td class="l"><span class="st st-ok">Invoiced</span></td><td class="l m">INV-20418</td><td>₹68.9 L</td><td>—</td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Shown</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>1,486</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td>₹867.9 L</td><td>—</td></tr></tfoot>
      </table></div>
      <div class="note">Mill is the mill the order is allocated to, not necessarily where it was made. Status names are provisional until the real ERP states are confirmed.</div>
    </div>
  </div>

  <!-- ═══════════ DISTRIBUTORS ═══════════ -->
  <div class="view" id="v-dist" role="tabpanel" aria-labelledby="t-dist" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. <b>The top 8 distributors are 74% of July intake.</b> Two are moving hard in opposite directions: <b>Ganesh Steel is up 19.4%</b> and <b>Bharat Pipe House is down 11.2%</b> — neither has been chased, because neither owes money. Metro Steel is growing overall while its <b>25×25 buying has fallen a third since May</b>. Underneath them, <b>five sizes carry 68.8% of intake</b> — and every one is made at Raipur or Bhiwadi, none at Hosur.</p></div>

    <div class="pane">
      <h3>Distributors this month <em>July · ordered, dispatched, unpaid</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Distributor</th><th class="l">Region</th><th>Ordered</th><th>Dispatched</th><th>Unpaid</th><th>vs June</th><th class="l">Largest family</th><th>State</th></tr></thead>
        <tbody>
          <tr data-dist="Metro Steel Syndicate"><td class="l">Metro Steel Syndicate</td><td class="l">North</td><td data-sum>342</td><td data-sum>102</td><td data-sum>240</td><td class="pos">+8.4%</td><td class="l">40 NB Round</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-dist="Shree Balaji Steel"><td class="l">Shree Balaji Steel</td><td class="l">West</td><td data-sum>318</td><td data-sum>138</td><td data-sum>180</td><td class="neg">−3.1%</td><td class="l">50 NB Round</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-dist="Deepak Tubes &amp; Pipes"><td class="l">Deepak Tubes &amp; Pipes</td><td class="l">West</td><td data-sum>286</td><td data-sum>201</td><td data-sum>85</td><td class="pos">+12.6%</td><td class="l">40 NB Round</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-dist="Kisan Agencies"><td class="l">Kisan Agencies</td><td class="l">West</td><td data-sum>244</td><td data-sum>219</td><td data-sum>25</td><td class="pos">+5.2%</td><td class="l">25×25 SHS</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-dist="Anand Steel Traders"><td class="l">Anand Steel Traders</td><td class="l">West</td><td data-sum>218</td><td data-sum>218</td><td data-sum>0</td><td class="neg">−7.8%</td><td class="l">40 NB Round</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-dist="Sunrise Steel Co"><td class="l">Sunrise Steel Co</td><td class="l">South</td><td data-sum>196</td><td data-sum>196</td><td data-sum>0</td><td class="pos">+3.3%</td><td class="l">60×40 RHS</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-dist="Bharat Pipe House"><td class="l">Bharat Pipe House</td><td class="l">North</td><td data-sum>174</td><td data-sum>174</td><td data-sum>0</td><td class="neg">−11.2%</td><td class="l">50 NB Round</td><td><span class="st st-watch">Falling</span></td></tr>
          <tr data-dist="Ganesh Steel Traders"><td class="l">Ganesh Steel Traders</td><td class="l">East</td><td data-sum>152</td><td data-sum>152</td><td data-sum>0</td><td class="pos">+19.4%</td><td class="l">25×25 SHS</td><td><span class="st st-ok">Rising</span></td></tr>
          <tr><td class="l">Other 26 distributors</td><td class="l">—</td><td data-sum>692</td><td data-sum>390</td><td data-sum>0</td><td class="pos">+1.7%</td><td class="l">mixed</td><td><span class="st st-ok">Clear</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total · 34 distributors</td><td class="l">—</td><td data-tot>2,622</td><td data-tot>1,790</td><td data-tot>530</td><td class="pos">+2.8%</td><td class="l">40 NB Round</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
    </div>

    <div class="pane">
      <h3>How fast each size moves <em id="fm-cap">July · across all 34 distributors · size × thickness</em> <span class="st st-watch" style="margin-left:auto">Watch</span></h3>
      <div id="fm-dist" hidden></div>
      <div id="fm-chan">
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Mill</th><th>Jul MT</th><th>Share</th><th>Buyers</th><th>Lines</th><th>Avg line</th><th class="l">Bought in</th><th>vs June</th><th>Direction</th></tr></thead>
        <tbody>
          <tr class="sec"><td class="l" colspan="3"><button class="b" data-basis="fastmove">Fast-moving</button> — bought widely, bought every month</td><td data-secsum>1,805</td><td>—</td><td>—</td><td data-secsum>791</td><td>—</td><td class="l"><span data-seccount>5</span> sizes</td><td>—</td><td>—</td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td class="l">Mill 2</td><td data-sum>486</td><td>18.5%</td><td>29</td><td data-sum>214</td><td>2.27</td><td class="l">3 of 3 months</td><td class="pos">+14.2%</td><td><span class="st st-ok">Rising</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td class="l">Mill 1</td><td data-sum>388</td><td>14.8%</td><td>26</td><td data-sum>176</td><td>2.20</td><td class="l">3 of 3 months</td><td class="pos">+5.8%</td><td><span class="st st-ok">Rising</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td class="l">Mill 2</td><td data-sum>356</td><td>13.6%</td><td>24</td><td data-sum>141</td><td>2.52</td><td class="l">3 of 3 months</td><td class="neg">−3.5%</td><td><span class="st st-q">Flat</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round</td><td class="l">3.2</td><td class="l">Mill 1</td><td data-sum>313</td><td>11.9%</td><td>21</td><td data-sum>128</td><td>2.45</td><td class="l">3 of 3 months</td><td class="neg">−2.2%</td><td><span class="st st-q">Flat</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td class="l">Mill 3</td><td data-sum>262</td><td>10.0%</td><td>19</td><td data-sum>132</td><td>1.98</td><td class="l">3 of 3 months</td><td class="neg">−12.4%</td><td><span class="st st-watch">Falling</span></td></tr>

          <tr class="sec"><td class="l" colspan="3">Steady — bought every month, but by few</td><td data-secsum>675</td><td>—</td><td>—</td><td data-secsum>234</td><td>—</td><td class="l"><span data-seccount>3</span> sizes</td><td>—</td><td>—</td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS</td><td class="l">3.2</td><td class="l">Mill 5</td><td data-sum>298</td><td>11.4%</td><td><button class="b" data-basis="concentration">11</button></td><td data-sum>62</td><td>4.81</td><td class="l">3 of 3 months</td><td class="pos">+11.3%</td><td><span class="st st-ok">Rising</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS" data-thk="2.6"><td class="l">40×40 SHS</td><td class="l">2.6</td><td class="l">Mill 4</td><td data-sum>194</td><td>7.4%</td><td>9</td><td data-sum>88</td><td>2.20</td><td class="l">3 of 3 months</td><td class="neg">−15.7%</td><td><span class="st st-act">Falling hard</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS</td><td class="l">3.2</td><td class="l">Mill 3</td><td data-sum>183</td><td>7.0%</td><td>14</td><td data-sum>84</td><td>2.18</td><td class="l">3 of 3 months</td><td class="neg">−2.1%</td><td><span class="st st-q">Flat</span></td></tr>

          <tr class="sec"><td class="l" colspan="3">Slow-moving — narrow and not every month</td><td data-secsum>142</td><td>—</td><td>—</td><td data-secsum>27</td><td>—</td><td class="l"><span data-seccount>1</span> size</td><td>—</td><td>—</td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round" data-thk="3.2"><td class="l">80 NB Round</td><td class="l">3.2</td><td class="l">Mill 6</td><td data-sum>142</td><td>5.4%</td><td>5</td><td data-sum>27</td><td>5.26</td><td class="l neg">2 of 3 months</td><td class="neg">−22.4%</td><td><span class="st st-act">Falling hard</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">All sizes</td><td class="l">—</td><td class="l">—</td><td data-tot>2,622</td><td>100%</td><td class="l">34 buyers</td><td data-tot>1,052</td><td>2.49</td><td class="l">—</td><td class="l">—</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="note">Fast-moving is about how many buy it, not how much sells. The five fast-movers are <b>1,805 MT — 68.8% of July intake</b>, and every one of them runs on Raipur or Bhiwadi: <b>Hosur makes nothing that qualifies</b>. 60×40 RHS is the fifth-largest size but only 11 distributors buy it, so it sits in Steady, not Fast. <b>Pick a distributor in the filter bar and this becomes their own mix.</b></div>
      </div>
    </div>

    <div class="pane">
      <h3>Metro Steel Syndicate — what they buy <em>by size and thickness · last 3 months</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th>May</th><th>Jun</th><th>Jul</th><th class="l">Shape</th><th>Change</th><th class="l">Reading</th></tr></thead>
        <tbody>
          <tr data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td data-sum>98</td><td data-sum>108</td><td data-sum>121</td><td class="l"><span class="spark"><i style="height:11px"></i><i style="height:13px"></i><i class="last" style="height:16px"></i></span></td><td class="pos">+23.5%</td><td class="l">Rising steadily</td></tr>
          <tr data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td data-sum>72</td><td data-sum>66</td><td data-sum>58</td><td class="l"><span class="spark"><i style="height:16px"></i><i style="height:14px"></i><i class="last" style="height:12px"></i></span></td><td class="neg">−19.4%</td><td class="l">Shifting to thinner</td></tr>
          <tr data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td data-sum>81</td><td data-sum>86</td><td data-sum>84</td><td class="l"><span class="spark"><i style="height:14px"></i><i style="height:15px"></i><i class="last" style="height:15px"></i></span></td><td>+3.7%</td><td class="l">Flat</td></tr>
          <tr data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td data-sum>54</td><td data-sum>48</td><td data-sum>38</td><td class="l"><span class="spark"><i style="height:16px"></i><i style="height:14px"></i><i class="last" style="height:11px"></i></span></td><td class="neg">−29.6%</td><td class="l">Falling fast</td></tr>
          <tr data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS</td><td class="l">3.2</td><td data-sum>31</td><td data-sum>34</td><td data-sum>41</td><td class="l"><span class="spark"><i style="height:11px"></i><i style="height:12px"></i><i class="last" style="height:16px"></i></span></td><td class="pos">+32.3%</td><td class="l">Rising</td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td data-tot>336</td><td data-tot>342</td><td data-tot>342</td><td class="l">—</td><td>+1.8%</td><td class="l">Flat overall</td></tr></tfoot>
      </table></div>
      <div class="note">Flat overall, but the mix is moving underneath: 40 NB is shifting from 3.2 to 2.6 mm, and 25×25 has fallen almost a third. A total alone would show none of this.</div>
    </div>
  </div>

  <!-- ═══════════ CAMPAIGN PLANNING ═══════════ -->
  <div class="view" id="v-plan" role="tabpanel" aria-labelledby="t-plan" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. August demand is <b>2,490 MT against 2,600 MT of capacity</b> — you are not short of capacity. Two families fall under their minimum campaign size, so 233 MT of demand is deferred while 280 MT of mill time idles. Both deferred families run on <b>Mill 6 at Hosur, which now has nothing scheduled in August at all</b>.</p></div>

    <div class="pane">
      <h3>August demand basis <em>orders on hand + estimates</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Source</th><th>MT</th><th>Share</th><th class="l">Confidence</th></tr></thead>
        <tbody>
          <tr><td class="l">Confirmed orders (paid)</td><td>1,020</td><td>41.0%</td><td class="l">Firm</td></tr>
          <tr><td class="l">Distributor estimates</td><td>1,560</td><td>62.7%</td><td class="l">Taken at face value</td></tr>
          <tr><td class="l">Overlap removed</td><td class="neg">−90</td><td>−3.7%</td><td class="l">Estimate already ordered</td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">August demand</td><td><button class="b" data-basis="demand">2,490</button></td><td>100%</td><td class="l">Not confident</td></tr></tfoot>
      </table></div>
      <div class="note">Estimates enter at face value — no reliability adjustment, by decision. If a distributor inflates, this number inherits it.</div>
    </div>

    <div class="pane">
      <h3>Campaign decisions <em>7 families · 5 run · 2 deferred</em> <span class="st st-watch" style="margin-left:auto">Watch</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Plant</th><th class="l">Mill</th><th>Demand</th><th>Min campaign</th><th>Planned</th><th class="l">Decision</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round"><td class="l">40 NB Round</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>780</td><td>250</td><td data-sum>800</td><td class="l">Run — 2 campaigns</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round"><td class="l">50 NB Round</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>620</td><td>250</td><td data-sum>630</td><td class="l">Run</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS"><td class="l">25×25 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>385</td><td>150</td><td data-sum>400</td><td class="l">Run</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS"><td class="l">60×40 RHS</td><td class="l">Hosur</td><td class="l">Mill 5</td><td data-sum>300</td><td>150</td><td data-sum>310</td><td class="l">Run</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS"><td class="l">40×40 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 4</td><td data-sum>172</td><td>150</td><td data-sum>180</td><td class="l">Run — clears min by 22</td><td><span class="st st-watch">Tight</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="100 NB Round"><td class="l">100 NB Round</td><td class="l">Hosur</td><td class="l">Mill 6</td><td data-sum>145</td><td>220</td><td data-sum>0</td><td class="l"><button class="b" data-basis="defer">Deferred to Sept</button></td><td><span class="st st-act">Defer</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round"><td class="l">80 NB Round</td><td class="l">Hosur</td><td class="l">Mill 6</td><td data-sum>88</td><td>200</td><td data-sum>0</td><td class="l">Deferred to Sept</td><td><span class="st st-act">Defer</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td data-tot>2,490</td><td>—</td><td data-tot>2,320</td><td class="l">233 MT deferred</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="note">Run-or-defer is decided per family because the minimum campaign size is a <em>size</em>-changeover cost — changing rolls between 40 NB and 50 NB is the expensive move. Thickness changes inside a run are comparatively cheap, so thickness is planned within the campaign, below.</div>
    </div>

    <div class="pane">
      <h3>What each campaign actually runs <em>August · thickness ladder inside each campaign</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Mill</th><th class="l">Window</th><th class="l">Order</th><th>Demand</th><th>Planned</th><th>Over/under</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td class="l">Mill 2</td><td class="l">4–8 Aug</td><td class="l">1st</td><td data-sum>455</td><td data-sum>470</td><td class="pos" data-sum>+15</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td class="l">Mill 2</td><td class="l">4–8 Aug</td><td class="l">2nd</td><td data-sum>325</td><td data-sum>330</td><td class="pos" data-sum>+5</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td class="l">Mill 1</td><td class="l">11–15 Aug</td><td class="l">1st</td><td data-sum>340</td><td data-sum>345</td><td class="pos" data-sum>+5</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round</td><td class="l">3.2</td><td class="l">Mill 1</td><td class="l">11–15 Aug</td><td class="l">2nd</td><td data-sum>280</td><td data-sum>285</td><td class="pos" data-sum>+5</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td class="l">Mill 3</td><td class="l">6–9 Aug</td><td class="l">1st</td><td data-sum>225</td><td data-sum>235</td><td class="pos" data-sum>+10</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS</td><td class="l">3.2</td><td class="l">Mill 3</td><td class="l">6–9 Aug</td><td class="l">2nd</td><td data-sum>160</td><td data-sum>165</td><td class="pos" data-sum>+5</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS</td><td class="l">3.2</td><td class="l">Mill 5</td><td class="l">13–16 Aug</td><td class="l">only</td><td data-sum>300</td><td data-sum>310</td><td class="pos" data-sum>+10</td><td><span class="st st-ok">Run</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS" data-thk="2.6"><td class="l">40×40 SHS</td><td class="l">2.6</td><td class="l">Mill 4</td><td class="l">19–21 Aug</td><td class="l">only</td><td data-sum>172</td><td data-sum>180</td><td class="pos" data-sum>+8</td><td><span class="st st-watch">Tight</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="100 NB Round" data-thk="3.2"><td class="l">100 NB Round</td><td class="l">3.2</td><td class="l">Mill 6</td><td class="l dim">not scheduled</td><td class="l dim">—</td><td data-sum>145</td><td data-sum>0</td><td class="neg" data-sum>−145</td><td><span class="st st-act">Defer</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round" data-thk="3.2"><td class="l">80 NB Round</td><td class="l">3.2</td><td class="l">Mill 6</td><td class="l dim">not scheduled</td><td class="l dim">—</td><td data-sum>88</td><td data-sum>0</td><td class="neg" data-sum>−88</td><td><span class="st st-act">Defer</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>2,490</td><td data-tot>2,320</td><td class="neg" data-tot>−170</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="note">Order is the thickness ladder — thin first, then step up, so the mill adjusts once in one direction rather than back and forth. Every running SKU is planned slightly above its demand to absorb yield loss; the deferred ones sit at zero against real demand.</div>
    </div>

    <div class="pane">
      <h3>August capacity by plant <em>2,320 of 2,600 MT committed</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Plant</th><th class="l">Mills</th><th>Capacity</th><th>Committed</th><th>Idle</th><th>Used</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A"><td class="l">Raipur</td><td class="l">Mill 1, Mill 2</td><td data-sum>1,500</td><td data-sum>1,430</td><td data-sum>70</td><td>95.3%</td><td><span class="st st-ok">Full</span></td></tr>
          <tr data-plant="B"><td class="l">Bhiwadi</td><td class="l">Mill 3, Mill 4</td><td data-sum>700</td><td data-sum>580</td><td data-sum>120</td><td>82.9%</td><td><span class="st st-watch">Slack</span></td></tr>
          <tr data-plant="C"><td class="l">Hosur</td><td class="l">Mill 5, Mill 6</td><td data-sum>400</td><td data-sum>310</td><td data-sum>90</td><td>77.5%</td><td><span class="st st-act">Mill 6 empty</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">6 mills</td><td data-tot>2,600</td><td data-tot>2,320</td><td data-tot>280</td><td>89.2%</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="cap">
        <div class="track"><i class="used" style="width:89.2%"></i><i class="idle" style="width:10.8%"></i></div>
        <div class="key">
          <span class="k1">Committed — 2,320 MT (89.2%)</span>
          <span class="k2">Idle — 280 MT (10.8%)</span>
        </div>
      </div>
      <div class="note">Raipur is effectively full at 95%. The idle time is at Bhiwadi and Hosur — and the 233 MT of deferred demand is exactly the work that would have filled Mill 6.</div>
    </div>
  </div>

  <!-- ═══════════ COILS ═══════════ -->
  <div class="view" id="v-coil" role="tabpanel" aria-labelledby="t-coil" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. The August plan needs <b>2,418 MT of coil and 2,160 MT is on hand or on order</b> — a gap of 258 MT. But that total understates it: because a coil of one width cannot make another size, the real shortfall is <b>281 MT across six specifications</b>. Worse, <b>two of those orders are already past their placing date</b> — 40 NB and 25×25 both run in the first week of August and their coil needed ordering on the 21st and 23rd of July.</p></div>

    <div class="pane">
      <h3>Coil required for the August plan <em>2,320 MT of tube · 96% yield · 2,418 MT of coil</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">For SKU</th><th class="l">Coil spec</th><th class="l">Mill</th><th>Tube planned</th><th>Coil needed</th><th>In yard</th><th>On order</th><th>Short</th><th class="l">Order by</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round · 2.6</td><td class="l">145 × 2.6 · E250</td><td class="l">Mill 2</td><td data-sum>470</td><td data-sum>490</td><td data-sum>180</td><td data-sum>200</td><td class="neg" data-sum><button class="b" data-basis="coil-40nb">110</button></td><td class="l neg">21 Jul — 7 days late</td><td><span class="st st-act">Overdue</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS · 2.0</td><td class="l">96 × 2.0 · E250</td><td class="l">Mill 3</td><td data-sum>235</td><td data-sum>245</td><td data-sum>90</td><td data-sum>100</td><td class="neg" data-sum>55</td><td class="l neg">23 Jul — 5 days late</td><td><span class="st st-act">Overdue</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS · 3.2</td><td class="l">191 × 3.2 · E250</td><td class="l">Mill 5</td><td data-sum>310</td><td data-sum>323</td><td data-sum>130</td><td data-sum>150</td><td class="neg" data-sum>43</td><td class="l">30 Jul — 2 days</td><td><span class="st st-act">Act now</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round · 3.2</td><td class="l">179 × 3.2 · E250</td><td class="l">Mill 1</td><td data-sum>285</td><td data-sum>297</td><td data-sum>140</td><td data-sum>120</td><td class="neg" data-sum>37</td><td class="l">28 Jul — today</td><td><span class="st st-act">Act now</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round · 3.2</td><td class="l">143 × 3.2 · E250</td><td class="l">Mill 2</td><td data-sum>330</td><td data-sum>344</td><td data-sum>160</td><td data-sum>150</td><td class="neg" data-sum>34</td><td class="l neg">21 Jul — 7 days late</td><td><span class="st st-act">Overdue</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS · 3.2</td><td class="l">92 × 3.2 · E250</td><td class="l">Mill 3</td><td data-sum>165</td><td data-sum>172</td><td data-sum>110</td><td data-sum>60</td><td class="neg" data-sum>2</td><td class="l neg">23 Jul — 5 days late</td><td><span class="st st-watch">Marginal</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round · 2.6</td><td class="l">181 × 2.6 · E250</td><td class="l">Mill 1</td><td data-sum>345</td><td data-sum>359</td><td data-sum>220</td><td data-sum>150</td><td class="pos" data-sum>0</td><td class="l dim">covered · +11</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS" data-thk="2.6"><td class="l">40×40 SHS · 2.6</td><td class="l">154 × 2.6 · E250</td><td class="l">Mill 4</td><td data-sum>180</td><td data-sum>188</td><td data-sum>200</td><td data-sum>0</td><td class="pos" data-sum>0</td><td class="l dim">covered · +12</td><td><span class="st st-ok">Clear</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">8 specs</td><td class="l">—</td><td data-tot>2,320</td><td data-tot>2,418</td><td data-tot>1,230</td><td data-tot>930</td><td class="neg" data-tot>281</td><td class="l">—</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">Coil needed = tube planned ÷ 96% yield. Width is set by the tube size: a round tube of outside diameter D and wall t needs a strip of roughly π × (D − t). A 145 mm coil cannot make a 50 NB tube, which is why the shortfall is counted per specification and never netted.</div>
    </div>

    <div class="grid2">
      <div class="pane">
        <h3>What to order today <em>281 MT · ₹1.31 cr at ₹46,500/MT</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Coil spec</th><th>MT</th><th>Value</th><th class="l">Needed by</th><th class="l">Status</th></tr></thead>
          <tbody>
            <tr><td class="l">145 × 2.6 · E250</td><td>110</td><td>₹51.2 L</td><td class="l">4 Aug</td><td class="l"><span class="st st-act">7 days late</span></td></tr>
            <tr><td class="l">96 × 2.0 · E250</td><td>55</td><td>₹25.6 L</td><td class="l">6 Aug</td><td class="l"><span class="st st-act">5 days late</span></td></tr>
            <tr><td class="l">191 × 3.2 · E250</td><td>43</td><td>₹20.0 L</td><td class="l">13 Aug</td><td class="l"><span class="st st-watch">2 days</span></td></tr>
            <tr><td class="l">179 × 3.2 · E250</td><td>37</td><td>₹17.2 L</td><td class="l">11 Aug</td><td class="l"><span class="st st-watch">Today</span></td></tr>
            <tr><td class="l">143 × 3.2 · E250</td><td>34</td><td>₹15.8 L</td><td class="l">4 Aug</td><td class="l"><span class="st st-act">7 days late</span></td></tr>
            <tr><td class="l">92 × 3.2 · E250</td><td>2</td><td>₹0.9 L</td><td class="l">6 Aug</td><td class="l"><span class="st st-watch">Marginal</span></td></tr>
          </tbody>
          <tfoot><tr class="tot"><td class="l">Total</td><td>281</td><td>₹1.31 cr</td><td class="l">—</td><td class="l"><span class="st st-act">3 overdue</span></td></tr></tfoot>
        </table></div>
      </div>

      <div class="pane">
        <h3>What happens if you do not <em>coil lead time 14 days</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Campaign</th><th class="l">Runs</th><th>Coil short</th><th>Tube at risk</th><th class="l">Consequence</th></tr></thead>
          <tbody>
            <tr><td class="l">40 NB Round · Mill 2</td><td class="l">4–8 Aug</td><td class="neg">144</td><td class="neg">138</td><td class="l">Runs short, or slips a week</td></tr>
            <tr><td class="l">25×25 SHS · Mill 3</td><td class="l">6–9 Aug</td><td class="neg">57</td><td class="neg">55</td><td class="l">Runs short — already 71 MT behind on orders</td></tr>
            <tr><td class="l">50 NB Round · Mill 1</td><td class="l">11–15 Aug</td><td class="neg">37</td><td class="neg">36</td><td class="l">Recoverable if ordered today</td></tr>
            <tr><td class="l">60×40 RHS · Mill 5</td><td class="l">13–16 Aug</td><td class="neg">43</td><td class="neg">41</td><td class="l">Recoverable if ordered by 30 Jul</td></tr>
          </tbody>
          <tfoot><tr class="tot"><td class="l">Total at risk</td><td class="l">—</td><td class="neg">281</td><td class="neg">270</td><td class="l">—</td></tr></tfoot>
        </table></div>
        <div class="note">40 NB × 2.6 is already 87 MT short against open orders. If its August campaign also runs short, that shortage carries into September and the same orders age another month.</div>
      </div>
    </div>

    <div class="pane">
      <h3>Coil in the yard <em>1,230 MT · ₹5.72 cr · by specification</em></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Coil spec</th><th class="l">Makes</th><th>MT</th><th>Value</th><th class="l">Age</th><th class="l">Committed to</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 1"><td class="l">181 × 2.6 · E250</td><td class="l">50 NB Round · 2.6</td><td>220</td><td>₹1.02 cr</td><td class="l">11 days</td><td class="l">11 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4"><td class="l">154 × 2.6 · E250</td><td class="l">40×40 SHS · 2.6</td><td>200</td><td>₹0.93 cr</td><td class="l">34 days</td><td class="l">19 Aug campaign</td><td><span class="st st-watch">Ageing</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2"><td class="l">145 × 2.6 · E250</td><td class="l">40 NB Round · 2.6</td><td>180</td><td>₹0.84 cr</td><td class="l">6 days</td><td class="l">4 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2"><td class="l">143 × 3.2 · E250</td><td class="l">40 NB Round · 3.2</td><td>160</td><td>₹0.74 cr</td><td class="l">6 days</td><td class="l">4 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1"><td class="l">179 × 3.2 · E250</td><td class="l">50 NB Round · 3.2</td><td>140</td><td>₹0.65 cr</td><td class="l">11 days</td><td class="l">11 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5"><td class="l">191 × 3.2 · E250</td><td class="l">60×40 RHS · 3.2</td><td>130</td><td>₹0.60 cr</td><td class="l">18 days</td><td class="l">13 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3"><td class="l">92 × 3.2 · E250</td><td class="l">25×25 SHS · 3.2</td><td>110</td><td>₹0.51 cr</td><td class="l">22 days</td><td class="l">6 Aug campaign</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3"><td class="l">96 × 2.0 · E250</td><td class="l">25×25 SHS · 2.0</td><td>90</td><td>₹0.42 cr</td><td class="l">22 days</td><td class="l">6 Aug campaign</td><td><span class="st st-watch">Short</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">8 specs</td><td>1,230</td><td>₹5.72 cr</td><td class="l">—</td><td class="l">—</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="note">Coil is 75–85% of the cost of a finished tube, so this yard is the largest single amount of money standing still in the business. 154 × 2.6 has been sitting 34 days waiting for a campaign that runs on the 19th.</div>
    </div>
  </div>

  <!-- ═══════════ CAMPAIGN MONITORING ═══════════ -->
  <div class="view" id="v-mon" role="tabpanel" aria-labelledby="t-mon" hidden>
    <div class="read"><span class="tag">Read</span><p id="mon-read"></p></div>


    <div id="mon-week">
    <div class="pane">
      <h3>Campaigns this week <em>week 31 · 640 of 750 MT · adherence 85.3%</em> <span class="st st-watch" style="margin-left:auto">Watch</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Plant</th><th class="l">Mill</th><th>Planned</th><th>Produced</th><th>Adherence</th><th class="l">Day</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round"><td class="l">40 NB Round</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>320</td><td data-sum>268</td><td>83.8%</td><td class="l">4 of 6</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round"><td class="l">50 NB Round</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>280</td><td data-sum>280</td><td>100.0%</td><td class="l">done</td><td><span class="st st-ok">Met</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS"><td class="l">25×25 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>150</td><td data-sum>92</td><td>61.3%</td><td class="l">5 of 6</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS"><td class="l">60×40 RHS</td><td class="l">Hosur</td><td class="l">Mill 5</td><td>140</td><td>—</td><td>—</td><td class="l">starts +2d</td><td><span class="st st-q">Queued</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Started campaigns</td><td class="l">—</td><td class="l">—</td><td data-tot>750</td><td data-tot>640</td><td><button class="b" data-basis="adherence">85.3%</button><span class="sub">floor 85.0%</span></td><td class="l">—</td><td><span class="st st-watch">Watch</span></td></tr></tfoot>
      </table></div>
      <div class="note">Queued campaigns are excluded from both sides of the adherence calculation.</div>
    </div>

    <div class="pane">
      <h3>Meant to be made vs actually made <em>week 31 · by size and thickness</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Plant</th><th class="l">Mill</th><th>Planned</th><th>Produced</th><th>Gap</th><th>%</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>180</td><td data-sum>144</td><td class="neg" data-sum>−36</td><td>80.0%</td><td><span class="st st-watch">Short</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>140</td><td data-sum>124</td><td class="neg" data-sum>−16</td><td>88.6%</td><td><span class="st st-watch">Short</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>140</td><td data-sum>140</td><td data-sum>0</td><td>100.0%</td><td><span class="st st-ok">Met</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>140</td><td data-sum>140</td><td data-sum>0</td><td>100.0%</td><td><span class="st st-ok">Met</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>80</td><td data-sum>42</td><td class="neg" data-sum>−38</td><td>52.5%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS</td><td class="l">3.2</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>70</td><td data-sum>50</td><td class="neg" data-sum>−20</td><td>71.4%</td><td><span class="st st-act">Act</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>750</td><td data-tot>640</td><td class="neg" data-tot><button class="b" data-basis="shortfall">−110</button></td><td>85.3%</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">Overproduction is never netted off a shortfall — a good week on one size does not cancel a bad week on another.</div>
    </div>
    </div><!-- /mon-week -->

    <div id="mon-month" hidden>
    <div class="pane">
      <h3>Every campaign this month <em>July · 10 run or running · 1 queued</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Plant</th><th class="l">Mill</th><th class="l">Window</th><th>Planned</th><th>Produced</th><th>Adherence</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round"><td class="l">40 NB Round</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l">1–5 Jul</td><td data-sum>340</td><td data-sum>282</td><td>82.9%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round"><td class="l">80 NB Round</td><td class="l">Hosur</td><td class="l">Mill 6</td><td class="l">2–4 Jul</td><td data-sum>200</td><td data-sum>172</td><td>86.0%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round"><td class="l">50 NB Round</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l">7–11 Jul</td><td data-sum>300</td><td data-sum>264</td><td>88.0%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS"><td class="l">25×25 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td class="l">9–12 Jul</td><td data-sum>180</td><td data-sum>144</td><td>80.0%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS"><td class="l">60×40 RHS</td><td class="l">Hosur</td><td class="l">Mill 5</td><td class="l">14–17 Jul</td><td data-sum>210</td><td data-sum>156</td><td>74.3%</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round"><td class="l">50 NB Round</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l">17–21 Jul</td><td data-sum>200</td><td data-sum>182</td><td>91.0%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS"><td class="l">40×40 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 4</td><td class="l">18–20 Jul</td><td data-sum>160</td><td data-sum>140</td><td>87.5%</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round"><td class="l">50 NB Round</td><td class="l">Raipur</td><td class="l">Mill 1</td><td class="l">24–28 Jul</td><td data-sum>280</td><td data-sum>280</td><td>100.0%</td><td><span class="st st-ok">Met</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round"><td class="l">40 NB Round</td><td class="l">Raipur</td><td class="l">Mill 2</td><td class="l">25–30 Jul</td><td data-sum>320</td><td data-sum>268</td><td>83.8%</td><td><span class="st st-act">Running</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS"><td class="l">25×25 SHS</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td class="l">24–29 Jul</td><td data-sum>150</td><td data-sum>92</td><td>61.3%</td><td><span class="st st-act">Running</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS"><td class="l">60×40 RHS</td><td class="l">Hosur</td><td class="l">Mill 5</td><td class="l">30 Jul–2 Aug</td><td>140</td><td>—</td><td>—</td><td><span class="st st-q">Queued</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Started campaigns</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>2,340</td><td data-tot>1,980</td><td><button class="b" data-basis="month-adherence">84.6%</button><span class="sub">floor 85.0%</span></td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">The week reads 85.3% and clears the floor. The month reads 84.6% and does not. Both are true — the week happened to contain the one campaign that finished in full.</div>
    </div>

    <div class="pane">
      <h3>Month by mill <em>July · where the loss actually sits</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Mill</th><th class="l">Plant</th><th class="l">Ran</th><th>Planned</th><th>Produced</th><th>Lost</th><th>Adherence</th><th class="l">In week 31?</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="B" data-mill="Mill 3"><td class="l">Mill 3</td><td class="l">Bhiwadi</td><td class="l">2 campaigns</td><td data-sum>330</td><td data-sum>236</td><td class="neg" data-sum>−94</td><td>71.5%</td><td class="l">Yes</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5"><td class="l">Mill 5</td><td class="l">Hosur</td><td class="l">1 campaign</td><td data-sum>210</td><td data-sum>156</td><td class="neg" data-sum>−54</td><td>74.3%</td><td class="l dim">No — invisible</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2"><td class="l">Mill 2</td><td class="l">Raipur</td><td class="l">2 campaigns</td><td data-sum>660</td><td data-sum>550</td><td class="neg" data-sum>−110</td><td>83.3%</td><td class="l">Yes</td><td><span class="st st-act">Act</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6"><td class="l">Mill 6</td><td class="l">Hosur</td><td class="l">1 campaign</td><td data-sum>200</td><td data-sum>172</td><td class="neg" data-sum>−28</td><td>86.0%</td><td class="l dim">No — invisible</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4"><td class="l">Mill 4</td><td class="l">Bhiwadi</td><td class="l">1 campaign</td><td data-sum>160</td><td data-sum>140</td><td class="neg" data-sum>−20</td><td>87.5%</td><td class="l dim">No — invisible</td><td><span class="st st-watch">Watch</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1"><td class="l">Mill 1</td><td class="l">Raipur</td><td class="l">3 campaigns</td><td data-sum>780</td><td data-sum>726</td><td class="neg" data-sum>−54</td><td>93.1%</td><td class="l">Yes</td><td><span class="st st-ok">Met</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">All mills</td><td class="l">—</td><td class="l">10 campaigns</td><td data-tot>2,340</td><td data-tot>1,980</td><td class="neg" data-tot>−360</td><td>84.6%</td><td class="l">3 of 6 ran</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">Only 3 of your 6 mills ran anything in week 31. The other 3 are simply absent from the weekly view — including Mill 5, which is your second-worst performer this month at 74.3%.</div>
    </div>
    </div><!-- /mon-month -->
  </div>

  <!-- ═══════════ INVENTORY ═══════════ -->
  <div class="view" id="v-inv" role="tabpanel" aria-labelledby="t-inv" hidden>
    <div class="read"><span class="tag">Read</span><p>Written by the system. Stock of <b>1,080 MT against 832 MT of open orders looks comfortable and is not</b>. <b>158 MT of orders sit in two sizes you cannot fill</b> — 40 NB × 2.6 and 25×25 × 2.0 — while <b>228 MT is tied up in 40×40 and 80 NB</b>, which have almost no orders against them. 80 NB has zero orders, 148 MT of stock, and its August campaign is deferred, so it will sit another month.</p></div>

    <div class="pane">
      <h3>Stock against open orders <em>9 SKUs · 1,080 MT stock · 832 MT open</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
      <div class="tw"><table>
        <thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Plant</th><th class="l">Mill</th><th>Open orders</th><th>Stock</th><th>Cover</th><th class="l">Next campaign</th><th>State</th></tr></thead>
        <tbody>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="2.6"><td class="l">40 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>205</td><td data-sum>118</td><td class="neg" data-sum><button class="b" data-basis="cover">−87</button></td><td class="l">4 Aug</td><td><span class="st st-act">Short</span></td></tr>
          <tr data-plant="A" data-mill="Mill 2" data-fam="40 NB Round" data-thk="3.2"><td class="l">40 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 2</td><td data-sum>168</td><td data-sum>186</td><td class="pos" data-sum>+18</td><td class="l">4 Aug</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="2.6"><td class="l">50 NB Round</td><td class="l">2.6</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>122</td><td data-sum>214</td><td class="pos" data-sum>+92</td><td class="l">11 Aug</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="A" data-mill="Mill 1" data-fam="50 NB Round" data-thk="3.2"><td class="l">50 NB Round</td><td class="l">3.2</td><td class="l">Raipur</td><td class="l">Mill 1</td><td data-sum>118</td><td data-sum>132</td><td class="pos" data-sum>+14</td><td class="l">11 Aug</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="2.0"><td class="l">25×25 SHS</td><td class="l">2.0</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>105</td><td data-sum>34</td><td class="neg" data-sum>−71</td><td class="l">6 Aug</td><td><span class="st st-act">Short</span></td></tr>
          <tr data-plant="B" data-mill="Mill 3" data-fam="25×25 SHS" data-thk="3.2"><td class="l">25×25 SHS</td><td class="l">3.2</td><td class="l">Bhiwadi</td><td class="l">Mill 3</td><td data-sum>54</td><td data-sum>64</td><td class="pos" data-sum>+10</td><td class="l">6 Aug</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="C" data-mill="Mill 5" data-fam="60×40 RHS" data-thk="3.2"><td class="l">60×40 RHS</td><td class="l">3.2</td><td class="l">Hosur</td><td class="l">Mill 5</td><td data-sum>28</td><td data-sum>72</td><td class="pos" data-sum>+44</td><td class="l">30 Jul</td><td><span class="st st-ok">Clear</span></td></tr>
          <tr data-plant="B" data-mill="Mill 4" data-fam="40×40 SHS" data-thk="2.6"><td class="l">40×40 SHS</td><td class="l">2.6</td><td class="l">Bhiwadi</td><td class="l">Mill 4</td><td data-sum>32</td><td data-sum>112</td><td class="pos" data-sum>+80</td><td class="l">19 Aug</td><td><span class="st st-watch">Overstock</span></td></tr>
          <tr data-plant="C" data-mill="Mill 6" data-fam="80 NB Round" data-thk="3.2"><td class="l">80 NB Round</td><td class="l">3.2</td><td class="l">Hosur</td><td class="l">Mill 6</td><td data-sum>0</td><td data-sum>148</td><td class="pos" data-sum>+148</td><td class="l">deferred</td><td><span class="st st-watch">Idle</span></td></tr>
        </tbody>
        <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="l">—</td><td class="l">—</td><td data-tot>832</td><td data-tot>1,080</td><td class="pos" data-tot>+248</td><td class="l">—</td><td><span class="st st-act">Act</span></td></tr></tfoot>
      </table></div>
      <div class="note">The total says +248 MT and the total is the least useful number here — it nets a shortage in one size against a surplus in another, which you cannot actually do.</div>
    </div>

    <div class="grid2">
      <div class="pane">
        <h3>Where the money is sitting <em>1,080 MT · ₹63.1 cr</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">Bucket</th><th>MT</th><th>Value</th><th>Share</th></tr></thead>
          <tbody>
            <tr><td class="l">Covering an open order</td><td>674</td><td>₹39.4 cr</td><td>62.4%</td></tr>
            <tr><td class="l">Surplus to orders</td><td>258</td><td>₹15.1 cr</td><td>23.9%</td></tr>
            <tr><td class="l">No order at all</td><td>148</td><td>₹8.6 cr</td><td>13.7%</td></tr>
          </tbody>
          <tfoot><tr class="tot"><td class="l">Total</td><td>1,080</td><td>₹63.1 cr</td><td>100%</td></tr></tfoot>
        </table></div>
      </div>
      <div class="pane">
        <h3>Orders you cannot fill today <em>158 MT · ₹0.92 cr</em></h3>
        <div class="tw"><table>
          <thead><tr><th class="l">SKU</th><th class="l">Mill</th><th>Short by</th><th class="l">Next made</th><th class="l">Days out</th></tr></thead>
          <tbody>
            <tr><td class="l">40 NB Round · 2.6</td><td class="l">Mill 2</td><td class="neg">87</td><td class="l">4 Aug</td><td class="l">7</td></tr>
            <tr><td class="l">25×25 SHS · 2.0</td><td class="l">Mill 3</td><td class="neg">71</td><td class="l">6 Aug</td><td class="l">9</td></tr>
          </tbody>
          <tfoot><tr class="tot"><td class="l">Total</td><td class="l">—</td><td class="neg">158</td><td class="l">—</td><td class="l">—</td></tr></tfoot>
        </table></div>
        <div class="note">Both are scheduled within 9 days — a promise-date problem rather than a lost order, provided the campaigns hold. Mill 3 ran at 61% last week.</div>
      </div>
    </div>
  </div>

  <div class="asks">
    <h2>What I need back</h2>
    <ol>
      <li><b>Are these the right seven views?</b> Flow, Sales &amp; chase, Orders &amp; invoices, Distributors, Campaign planning, Campaign monitoring, Inventory vs orders.</li>
      <li><b>Are the order statuses right?</b> Awaiting payment · Paid not scheduled · In production · Produced awaiting dispatch · Part-dispatched · Invoiced. These are my guesses — the real ones come from your ERP.</li>
      <li><b>Is Flow useful or is it a poster?</b> It reconciles everything, but you may never open it. It is also the most expensive view to build.</li>
      <li><b>Does the purple "Read" line earn its place?</b> That is the system writing prose from the numbers — the only thing on screen that is not a calculation.</li>
      <li><b>One month at a time,</b> or two months side by side?</li>
    </ol>
  </div>
</div>

<div class="scrim" id="scrim"></div>
<aside class="rail" id="rail" role="dialog" aria-modal="false" aria-labelledby="rail-title">
  <header><div><span class="lbl">Basis</span><h4 id="rail-title">—</h4></div><button id="rail-close" aria-label="Close">✕</button></header>
  <div class="body" id="rail-body"></div>
</aside>

<script>
var BASIS = {
  "ordered":{title:"Orders received, July",
    rule:"Every order line dated within the month, at order quantity, before any payment or scheduling test. This is intake, not revenue.",
    fx:[{term:"Order lines",val:"1,052",src:"ERP · to 06:00 today"},{op:"→"},{term:"Distributors",val:"34",src:"with at least one order"},{op:"→"},{term:"Intake",val:"2,622 MT",src:"July month-to-date"}],
    cf:"Running <b>+2.8% against June</b> and <b>+122 MT against the month's own plan</b> — intake is not the problem this month.",
    meta:"rule_version orders.intake v1 · excludes cancelled lines"},
  "paid":{title:"Payment received against orders",
    rule:"Orders where money has arrived, matched to the order rather than to the distributor account. A part-payment counts only for the part paid.",
    fx:[{term:"Ordered",val:"2,622",src:"July intake"},{op:"−"},{term:"Unpaid",val:"530",src:"Receipts · 07:00 today"},{op:"="},{term:"Paid",val:"2,092 MT",src:"79.8% of intake"}],
    band:{label:"79.8% paid",pos:38,note:"Watch below 90% · Act below 80%"},
    cf:"The <b>530 MT gap is the chase list</b>. Nothing downstream of this can move until it closes.",
    meta:"rule_version orders.paid v1 · receipts posted 07:00 daily"},
  "produced":{title:"Produced, July to date",
    rule:"Tonnes recorded against a campaign in the month, measured at the mill, before dispatch and before any quality hold.",
    fx:[{term:"Plan",val:"2,480",src:"Campaign plan · frozen 21 Jun"},{op:"−"},{term:"Remaining",val:"500",src:"Still scheduled this month"},{op:"="},{term:"Produced",val:"1,980 MT",src:"79.8% of plan · day 28 of 31"}],
    cf:"<b>500 MT is still scheduled inside the month.</b> Behind, not lost — but only 3 days remain to make it.",
    meta:"rule_version production.mtd v1 · mill-recorded, pre-dispatch"},
  "stock":{title:"Stock on hand",
    rule:"Opening stock plus everything produced, less everything dispatched. Finished goods only; work in progress is not counted.",
    fx:[{term:"Opening",val:"890",src:"1 Jul close"},{op:"+"},{term:"Produced",val:"1,980",src:"July to date"},{op:"−"},{term:"Dispatched",val:"1,790",src:"July to date"},{op:"="},{term:"Stock",val:"1,080 MT",src:"across 9 SKUs"}],
    contrib:[["Covering an open order",674,62],["Surplus to orders",258,24],["No order at all",148,14]],
    cf:"<b>110 MT above the month's plan of 970.</b> The excess is concentrated in 40×40 and 80 NB, not spread evenly.",
    meta:"rule_version stock.onhand v1 · finished goods only"},
  "metro":{title:"Metro Steel Syndicate — unpaid",
    rule:"This distributor's expected quantity with no receipt matched against it. Age runs from the day the estimate locked, not from first contact.",
    fx:[{term:"Expected",val:"240",src:"Estimate · locked 13 Jul"},{op:"−"},{term:"Paid",val:"0",src:"No receipt found"},{op:"="},{term:"Unpaid",val:"240 MT",src:"15 days open"}],
    band:{label:"15 days open",pos:88,note:"Act above 10 days"},
    cf:"Largest and oldest on the list, and <b>45% of the entire gap</b>. Spread over 3 order lines across 2 plants.",
    meta:"rule_version chase.unpaid v1 · no receipt matched in 15 days"},
  "demand":{title:"August demand basis",
    rule:"Confirmed paid orders for August plus distributor estimates for August, with any estimate already turned into an order removed so it is not counted twice.",
    fx:[{term:"Confirmed",val:"1,020",src:"Paid orders · Aug delivery"},{op:"+"},{term:"Estimates",val:"1,560",src:"Locked 22 Jul"},{op:"−"},{term:"Overlap",val:"90",src:"Estimate already ordered"},{op:"="},{term:"Demand",val:"2,490 MT",src:"41% firm"}],
    cf:"<b>Only 41% of this is firm.</b> The rest is estimates at face value with no reliability adjustment — a deliberate scope decision, not an oversight.",
    meta:"rule_version demand.basis v1 · estimates unadjusted by design"},
  "defer":{title:"100 NB Round — deferred",
    rule:"A family runs only if demand reaches the minimum economic campaign size for its mill. Below it the changeover cost is not recovered, and the family waits for the next cycle.",
    fx:[{term:"Demand",val:"145",src:"Aug · orders + estimates"},{op:"vs"},{term:"Minimum",val:"220",src:"Mill 6 · plant master"},{op:"="},{term:"Short by",val:"75 MT",src:"deferred to Sept"}],
    band:{label:"145 MT against a 220 MT minimum",pos:20,note:"Runs at or above minimum"},
    cf:"With 80 NB also deferred, <b>Mill 6 at Hosur has no work at all in August</b> — 233 MT of demand pushed out while a whole mill idles. Running both large-bore families back to back would clear both minimums, if the changeover allows it.",
    meta:"rule_version campaign.mincharge v1 · minimum from plant master, not yet verified"},
  "adherence":{title:"Campaign adherence, week 31",
    rule:"Tonnes produced as a share of tonnes planned across every campaign that has started in the window. Queued campaigns are excluded from both sides.",
    fx:[{term:"Produced",val:"640",src:"Mill entries · to 06:00"},{op:"/"},{term:"Planned",val:"750",src:"Plan · frozen 21 Jul"},{op:"="},{term:"Adherence",val:"85.3%",src:"floor 85.0%"}],
    band:{label:"85.3% against a floor of 85.0%",pos:59,note:"Act below 80% · Watch below 90%"},
    contrib:[["Mill 3 — 25×25 SHS",-58,53],["Mill 2 — 40 NB Round",-52,47]],
    cf:"Clears the floor by <b>0.3 points</b>. Three tonnes less on Mill 3 and this reads <b>Act</b> instead of Watch.",
    meta:"rule_version campaign.adherence v2 · Mill 5 excluded, not started"},
  "shortfall":{title:"Production shortfall, week 31",
    rule:"Planned less produced, summed only over lines that fell short. Overproduction on other lines is never netted off.",
    fx:[{term:"Planned",val:"750",src:"Plan · frozen 21 Jul"},{op:"−"},{term:"Produced",val:"640",src:"Mill entries · to 06:00"},{op:"="},{term:"Short",val:"110 MT",src:"4 of 6 lines"}],
    contrib:[["Mill 3 · 25×25 · 2.0",-38,35],["Mill 2 · 40 NB · 2.6",-36,33],["Mill 3 · 25×25 · 3.2",-20,18],["Mill 2 · 40 NB · 3.2",-16,14]],
    cf:"<b>All four short lines are on just two mills.</b> Mill 3 accounts for 58 MT and Mill 2 for 52 MT — Mill 1 met plan in full.",
    meta:"rule_version production.shortfall v1 · overproduction not netted"},
  "cover":{title:"40 NB Round × 2.6 — cover",
    rule:"Stock on hand less orders taken but not yet dispatched. Negative means orders exist that today's stock cannot fill.",
    fx:[{term:"Stock",val:"118",src:"Raipur · finished"},{op:"−"},{term:"Open orders",val:"205",src:"Taken, not dispatched"},{op:"="},{term:"Cover",val:"−87 MT",src:"next run 4 Aug"}],
    cf:"Next campaign is <b>7 days out</b> on Mill 2, planned at 800 MT for the family. The order is late, not lost — <b>if the campaign holds</b>, and Mill 2 ran at 83.8% last week.",
    meta:"rule_version stock.cover v1 · promise date from campaign calendar, not stock math"},
  "fastmove":{title:"Fast-moving — how a size earns the label",
    rule:"A size is fast-moving when many distributors buy it and they buy it every month. Both tests must pass: bought by at least half the channel, and ordered in each of the last three months. Volume alone never qualifies a size — a large tonnage from one buyer is concentration, not movement.",
    fx:[{term:"Buyers",val:"17 of 34",src:"threshold · half the channel"},{op:"+"},{term:"Months present",val:"3 of 3",src:"May, June, July"},{op:"="},{term:"Fast-moving",val:"5 of 9 sizes",src:"1,805 MT · 68.8% of July intake"}],
    contrib:[["40 NB Round · 2.6",486,27],["50 NB Round · 2.6",388,21],["40 NB Round · 3.2",356,20],["50 NB Round · 3.2",313,17],["25×25 SHS · 2.0",262,15]],
    cf:"Fast-moving does not mean growing. <b>25×25 SHS × 2.0 is bought by 19 distributors every month and is still down 12.4%</b> — a broad decline is harder to reverse than one buyer pulling back. Drop the buyer test and <b>60×40 RHS joins on volume alone</b>, though two-thirds of it comes from a single distributor.",
    meta:"rule_version demand.movement v1 · thresholds proposed by the design, not confirmed by the business"},
  "stopped":{title:"Stopped buying — how a size lands here",
    rule:"A size the distributor ordered at least once in the last three months and has not ordered at all in the current month. It is a gap in their own buying pattern, not a comparison against other distributors — a size they never bought never appears here.",
    fx:[{term:"Bought before",val:"yes",src:"last 3 months"},{op:"+"},{term:"Ordered this month",val:"none",src:"July · no order line"},{op:"="},{term:"Stopped",val:"flagged",src:"with the month last bought"}],
    cf:"<b>These distributors owe you nothing.</b> The chase list is triggered by money not received, so a distributor who quietly stops ordering never appears on it — they are paid up and invisible. This is the only place a reason to call surfaces that is not about money.",
    meta:"rule_version demand.lapsed v1 · three-month window proposed, not confirmed"},
  "concentration":{title:"60×40 RHS × 3.2 — who actually buys it",
    rule:"Buyers counts distributors with at least one order line for the size in the month. It counts customers, not tonnes, so a size can be large and still have very few buyers.",
    fx:[{term:"Ordered",val:"298",src:"July · 62 order lines"},{op:"of which"},{term:"Sunrise Steel Co",val:"196",src:"South · 2 order lines"},{op:"="},{term:"One buyer",val:"66%",src:"of the whole size"}],
    band:{label:"11 buyers against a threshold of 17",pos:32,note:"Fast-moving at or above 17"},
    cf:"<b>Lose Sunrise Steel Co and two-thirds of this size goes with them</b> — and it is the only family Mill 5 at Hosur runs. Rising 11.3% on eleven buyers is not the same kind of growth as 40 NB rising on twenty-nine.",
    meta:"rule_version demand.buyers v1 · order lines, not tonnes"},
  "month-adherence":{title:"Campaign adherence, July",
    rule:"The same rule as the weekly figure, over every campaign that started in the month rather than in the week. Queued campaigns are excluded from both sides.",
    fx:[{term:"Produced",val:"1,980",src:"10 campaigns · to 06:00"},{op:"/"},{term:"Planned",val:"2,340",src:"10 campaigns started"},{op:"="},{term:"Adherence",val:"84.6%",src:"floor 85.0%"}],
    band:{label:"84.6% against a floor of 85.0%",pos:38,note:"Act below 80% · Watch below 90%"},
    contrib:[["Mill 2 — 2 campaigns",-110,31],["Mill 3 — 2 campaigns",-94,26],["Mill 1 — 3 campaigns",-54,15],["Mill 5 — 1 campaign",-54,15],["Mill 6 — 1 campaign",-28,8],["Mill 4 — 1 campaign",-20,5]],
    cf:"The week reads <b>85.3% and clears the floor; the month reads 84.6% and does not</b>. Both are correct — week 31 happened to contain the one campaign that finished in full. <b>Only 3 of 6 mills ran anything in week 31</b>, so the weekly figure cannot see half the plant.",
    meta:"rule_version campaign.adherence v2 · same rule, month window"},
  "coil-40nb":{title:"145 × 2.6 coil — shortfall",
    rule:"Coil needed is the planned tube tonnage divided by the mill's yield. Width is fixed by the tube size, so a shortfall in one width can never be covered by surplus in another.",
    fx:[{term:"Tube planned",val:"470",src:"Aug · 40 NB × 2.6"},{op:"÷"},{term:"Yield",val:"96%",src:"Mill 2 · plant master"},{op:"="},{term:"Coil needed",val:"490",src:"MT"},{op:"−"},{term:"Available",val:"380",src:"180 yard + 200 on order"},{op:"="},{term:"Short",val:"110 MT",src:"₹51.2 L"}],
    band:{label:"Order needed 21 Jul · today is 28 Jul",pos:8,note:"14-day lead time before a 4 Aug campaign"},
    cf:"<b>Seven days past the placing date.</b> At a 14-day lead time this coil cannot arrive before the 4 August campaign unless it is expedited. The likely outcome is the campaign runs 138 MT short — against a SKU already 87 MT behind on open orders.",
    meta:"rule_version coil.requirement v1 · yield and lead time from plant master, not yet verified"}
};

var rail=document.getElementById('rail'), scrim=document.getElementById('scrim'),
    railBody=document.getElementById('rail-body'), railTitle=document.getElementById('rail-title'), lastTrigger=null;

function render(k){
  var d=BASIS[k]; if(!d) return;
  railTitle.textContent=d.title;
  var h='<div><span class="lbl">How it is worked out</span><div class="fx">';
  d.fx.forEach(function(t){
    if(t.op){ h+='<div class="op"><span class="term">.</span><span class="val">'+t.op+'</span><span class="src">.</span></div>'; }
    else { h+='<div><span class="term">'+t.term+'</span><span class="val">'+t.val+'</span><span class="src">'+t.src+'</span></div>'; }
  });
  h+='</div></div>';
  h+='<div><span class="lbl">The rule</span><p class="rule-txt">'+d.rule+'</p></div>';
  if(d.band){ h+='<div><span class="lbl">Where it sits</span><div class="band"><div class="track"><i style="left:'+d.band.pos+'%"></i></div></div><p class="rule-txt" style="margin-top:8px">'+d.band.label+' — <span style="color:var(--ink-3)">'+d.band.note+'</span></p></div>'; }
  if(d.contrib){
    h+='<div><span class="lbl">What makes it up</span><div class="contrib">';
    d.contrib.forEach(function(c){ h+='<div><span>'+c[0]+'</span><span>'+c[1]+'</span><span class="cb"><i style="width:'+Math.abs(c[2])+'%"></i></span></div>'; });
    h+='</div></div>';
  }
  h+='<div class="cf">'+d.cf+'</div><div class="meta">'+d.meta+'</div>';
  railBody.innerHTML=h; railBody.scrollTop=0;
}
function openRail(b){ if(lastTrigger&&lastTrigger!==b) lastTrigger.setAttribute('aria-expanded','false');
  lastTrigger=b; b.setAttribute('aria-expanded','true'); render(b.getAttribute('data-basis'));
  rail.classList.add('open'); scrim.classList.add('open'); }
function closeRail(){ rail.classList.remove('open'); scrim.classList.remove('open');
  if(lastTrigger){ lastTrigger.setAttribute('aria-expanded','false'); lastTrigger.focus(); lastTrigger=null; } }

document.addEventListener('click',function(e){
  var b=e.target.closest('.b[data-basis]'); if(b){ openRail(b); return; }
  if(e.target.closest('#rail-close')||e.target.closest('#scrim')) closeRail();
});
document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&rail.classList.contains('open')) closeRail(); });

var tabs=[].slice.call(document.querySelectorAll('[role="tab"]'));
tabs.forEach(function(t){ t.addEventListener('click',function(){
  tabs.forEach(function(o){ var on=(o===t); o.setAttribute('aria-selected',on?'true':'false');
    document.getElementById(o.getAttribute('aria-controls')).hidden=!on; });
  if(rail.classList.contains('open')) closeRail();
}); });

/* time spine: one period control governs every view */
var gWeek=document.getElementById('g-week'), gMonth=document.getElementById('g-month'),
    pLabel=document.getElementById('p-label'), pState=document.getElementById('p-state'), pSub=document.getElementById('p-sub'),
    monWeek=document.getElementById('mon-week'), monMonth=document.getElementById('mon-month'),
    monRead=document.getElementById('mon-read');

var GRAIN={
  week:{ label:'Week 31 · 27 Jul – 2 Aug', state:'Running · day 2 of 7',
         sub:'One control, whole cockpit. Every view below is <b>week 31, Monday 27 July to Sunday 2 August</b>. Weeks always run Monday to Sunday, so a week never changes meaning.',
         read:'Written by the system. The week is at <b>85.3% of plan, clearing the floor by 0.3 points</b> — held up entirely by 50 NB finishing complete on Mill 1. <b>Both 25×25 sizes are short, and both run on Mill 3 at Bhiwadi.</b> That points at one mill, not at the product. <b>Switch the bar above to the month and the picture reverses — the month is at 84.6%, below the floor.</b>' },
  month:{ label:'July 2026', state:'Running · day 28 of 31',
         sub:'One control, whole cockpit. Every view below is <b>July 2026</b>. <b>Campaign planning</b> and <b>Coils to order</b> look one month ahead to August, because planning is forward-looking — their headings say so.',
         read:'Written by the system. The month is at <b>84.6% of plan, 0.4 points under the floor</b>. The loss is not spread — <b>Mill 3 at Bhiwadi (71.5%) and Mill 5 at Hosur (74.3%) account for 148 of the 360 MT lost</b>, and Mill 5 ran nothing in week 31, so the weekly view cannot see it at all. <b>Switch the bar above to the week and it reads 85.3% and clears the floor.</b>' }
};

function setGrain(g){
  gWeek.setAttribute('aria-pressed', g==='week'?'true':'false');
  gMonth.setAttribute('aria-pressed', g==='month'?'true':'false');
  pLabel.textContent=GRAIN[g].label; pState.textContent=GRAIN[g].state;
  pSub.innerHTML=GRAIN[g].sub; monRead.innerHTML=GRAIN[g].read;
  monWeek.hidden=(g!=='week'); monMonth.hidden=(g!=='month');
  if(rail.classList.contains('open')) closeRail();
}
gWeek.addEventListener('click',function(){ setGrain('week'); });
gMonth.addEventListener('click',function(){ setGrain('month'); });
setGrain('month');

var F={plant:'',mill:'',fam:'',thk:'',dist:'',status:''};
function fmt(n){ return (n<0?'−':'')+Math.abs(n).toLocaleString('en-IN'); }
/* what each distributor actually buys · rows [family, thk, mill, plant, MT, share%, direction, glyph]
   every column sums to the channel size totals, every row sums to the distributor total */
var DIST_MIX={
 "Metro Steel Syndicate":{tot:342,rows:[
   ["40 NB Round","2.6","Mill 2","A",121,35,"Rising","ok"],
   ["50 NB Round","2.6","Mill 1","A",84,25,"Flat","q"],
   ["40 NB Round","3.2","Mill 2","A",58,17,"Falling","watch"],
   ["60×40 RHS","3.2","Mill 5","C",41,12,"Rising","ok"],
   ["25×25 SHS","2.0","Mill 3","B",38,11,"Falling hard","act"]],stopped:[]},
 "Shree Balaji Steel":{tot:318,rows:[
   ["50 NB Round","2.6","Mill 1","A",234,74,"Flat","q"],
   ["40 NB Round","3.2","Mill 2","A",84,26,"Falling","watch"]],
   stopped:[["25×25 SHS","2.0","Mill 3","B","June",34]]},
 "Deepak Tubes & Pipes":{tot:286,rows:[
   ["40 NB Round","2.6","Mill 2","A",168,59,"Rising","ok"],
   ["40 NB Round","3.2","Mill 2","A",62,22,"Rising","ok"],
   ["50 NB Round","2.6","Mill 1","A",56,19,"Flat","q"]],stopped:[]},
 "Kisan Agencies":{tot:244,rows:[
   ["25×25 SHS","2.0","Mill 3","B",158,65,"Rising","ok"],
   ["25×25 SHS","3.2","Mill 3","B",46,19,"Flat","q"],
   ["40×40 SHS","2.6","Mill 4","B",40,16,"Falling","watch"]],
   stopped:[["40 NB Round","2.6","Mill 2","A","May",28]]},
 "Anand Steel Traders":{tot:218,rows:[
   ["40 NB Round","3.2","Mill 2","A",122,56,"Falling","watch"],
   ["40 NB Round","2.6","Mill 2","A",96,44,"Flat","q"]],
   stopped:[["60×40 RHS","3.2","Mill 5","C","June",41]]},
 "Sunrise Steel Co":{tot:196,rows:[
   ["60×40 RHS","3.2","Mill 5","C",196,100,"Rising","ok"]],
   stopped:[["40 NB Round","3.2","Mill 2","A","April",22]]},
 "Bharat Pipe House":{tot:174,rows:[
   ["50 NB Round","3.2","Mill 1","A",114,66,"Falling","watch"],
   ["80 NB Round","3.2","Mill 6","C",46,26,"Falling hard","act"],
   ["50 NB Round","2.6","Mill 1","A",14,8,"Flat","q"]],
   stopped:[["40×40 SHS","2.6","Mill 4","B","June",38],["25×25 SHS","3.2","Mill 3","B","May",19]]},
 "Ganesh Steel Traders":{tot:152,rows:[
   ["25×25 SHS","3.2","Mill 3","B",62,41,"Rising","ok"],
   ["25×25 SHS","2.0","Mill 3","B",48,31,"Rising","ok"],
   ["60×40 RHS","3.2","Mill 5","C",42,28,"Rising","ok"]],stopped:[]}
};

function renderDist(){
  var chan=document.getElementById('fm-chan'), box=document.getElementById('fm-dist'), cap=document.getElementById('fm-cap');
  var d=DIST_MIX[F.dist];
  if(!d){
    chan.hidden=false; box.hidden=true; box.innerHTML='';
    cap.textContent='July · across all 34 distributors · size × thickness';
    return;
  }
  chan.hidden=true; box.hidden=false;
  cap.textContent='July · '+F.dist+' only · '+d.tot+' MT · biggest first';
  var h='<div class="tw"><table><thead><tr><th class="l">Family</th><th class="l">Thk</th><th class="l">Mill</th><th>Jul MT</th>'+
        '<th>Share of their buying</th><th>Direction</th></tr></thead><tbody>';
  d.rows.forEach(function(r){
    h+='<tr data-fam="'+r[0]+'" data-thk="'+r[1]+'" data-mill="'+r[2]+'" data-plant="'+r[3]+'">'+
       '<td class="l">'+r[0]+'</td><td class="l">'+r[1]+'</td><td class="l">'+r[2]+'</td>'+
       '<td data-sum>'+r[4]+'</td><td>'+r[5]+'%</td><td><span class="st st-'+r[7]+'">'+r[6]+'</span></td></tr>';
  });
  h+='</tbody><tfoot><tr class="tot"><td class="l">All sizes they buy</td><td class="l">—</td><td class="l">—</td>'+
     '<td data-tot>'+d.tot+'</td><td>100%</td><td>—</td></tr></tfoot></table></div>';

  if(d.stopped.length){
    h+='<div class="tw"><table><thead><tr><th class="l"><button class="b" data-basis="stopped">Stopped buying</button></th>'+
       '<th class="l">Thk</th><th class="l">Mill</th><th>Last order</th><th class="l">Last bought</th><th>Direction</th></tr></thead><tbody>';
    d.stopped.forEach(function(s){
      h+='<tr data-fam="'+s[0]+'" data-thk="'+s[1]+'" data-mill="'+s[2]+'" data-plant="'+s[3]+'">'+
         '<td class="l">'+s[0]+'</td><td class="l">'+s[1]+'</td><td class="l">'+s[2]+'</td>'+
         '<td class="dim">'+s[5]+'</td><td class="l neg">'+s[4]+'</td><td><span class="st st-act">Stopped</span></td></tr>';
    });
    h+='</tbody></table></div><div class="note"><b>'+F.dist+' has gone quiet on '+d.stopped.length+
       ' size'+(d.stopped.length>1?'s':'')+'.</b> They owe you nothing, so no unpaid-money trigger will ever raise them — '+
       'this is the one place the cockpit finds a reason to call that has nothing to do with money.</div>';
  } else {
    h+='<div class="note">Nothing dropped — '+F.dist+' still buys every size they bought in the last three months.</div>';
  }
  box.innerHTML=h;
}

function applyFilters(){
  renderDist();
  [].slice.call(document.querySelectorAll('table')).forEach(function(tb){
    var rows=[].slice.call(tb.querySelectorAll('tbody tr'));
    rows.forEach(function(r){
      var ok=true;
      if(F.plant  && r.getAttribute('data-plant')  && r.getAttribute('data-plant')!==F.plant) ok=false;
      if(F.mill   && r.getAttribute('data-mill')   && r.getAttribute('data-mill')!==F.mill) ok=false;
      if(F.fam    && r.getAttribute('data-fam')    && r.getAttribute('data-fam')!==F.fam) ok=false;
      if(F.thk    && r.getAttribute('data-thk')    && r.getAttribute('data-thk')!==F.thk) ok=false;
      if(F.dist   && r.getAttribute('data-dist')   && r.getAttribute('data-dist')!==F.dist) ok=false;
      if(F.status && r.getAttribute('data-status') && r.getAttribute('data-status')!==F.status) ok=false;
      r.classList.toggle('off',!ok);
    });
    var foot=tb.querySelector('tfoot tr.tot');
    if(!foot) return;
    var tots=[].slice.call(foot.querySelectorAll('[data-tot]'));
    tots.forEach(function(cell,i){
      var sum=0, found=false;
      rows.forEach(function(r){
        if(r.classList.contains('off')) return;
        var cells=[].slice.call(r.querySelectorAll('[data-sum]'));
        if(cells[i]){
          var v=parseFloat(cells[i].textContent.replace(/[^0-9.\-−]/g,'').replace('−','-'));
          if(!isNaN(v)){ sum+=v; found=true; }
        }
      });
      if(found){
        var btn=cell.querySelector('.b');
        if(btn){ btn.textContent=fmt(sum); } else { cell.textContent=fmt(sum); }
      }
    });
  });
  /* banded sections recompute from the visible rows beneath them */
  [].slice.call(document.querySelectorAll('tbody tr.sec')).forEach(function(sec){
    var sums=[], n=0;
    for(var r=sec.nextElementSibling; r && !r.classList.contains('sec'); r=r.nextElementSibling){
      if(r.classList.contains('off')) continue;
      n++;
      [].slice.call(r.querySelectorAll('[data-sum]')).forEach(function(c,i){
        var v=parseFloat(c.textContent.replace(/[^0-9.\-−]/g,'').replace('−','-'));
        if(!isNaN(v)) sums[i]=(sums[i]||0)+v;
      });
    }
    [].slice.call(sec.querySelectorAll('[data-secsum]')).forEach(function(c,i){
      c.textContent = sums[i]===undefined ? '—' : fmt(sums[i]);
    });
    var cnt=sec.querySelector('[data-seccount]'); if(cnt) cnt.textContent=n;
  });
}
['plant','mill','fam','thk','dist','status'].forEach(function(k){
  document.getElementById('f-'+k).addEventListener('change',function(e){ F[k]=e.target.value; applyFilters(); });
});
document.getElementById('f-reset').addEventListener('click',function(){
  F={plant:'',mill:'',fam:'',thk:'',dist:'',status:''};
  ['plant','mill','fam','thk','dist','status'].forEach(function(k){ document.getElementById('f-'+k).value=''; });
  applyFilters();
});

var tb=document.getElementById('theme');
tb.addEventListener('click',function(){
  var d=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',d?'light':'dark');
  tb.textContent=d?'Dark':'Light';
});
</script>
</body>
</html>
