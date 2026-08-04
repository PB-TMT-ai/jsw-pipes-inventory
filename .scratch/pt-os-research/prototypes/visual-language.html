<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>P&amp;T Command Centre — visual language, three densities</title>

<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  img { max-width: 100%; }
  button { font: inherit; }

  /* ---------- tokens: light ---------- */
  :root {
    --ground:   #F6F8F9;
    --surface:  #FFFFFF;
    --sunken:   #EDF1F3;
    --ink-1:    #12171B;
    --ink-2:    #45505A;
    --ink-3:    #59646E;
    --rule:     #DDE3E7;
    --rule-2:   #C6D0D6;
    --accent:   #1B5E8A;
    --accent-w: #E4EFF6;
    --ok:       #0E6B54;
    --ok-w:     #E1F1EC;
    --watch:    #8A5D00;
    --watch-w:  #F7EEDA;
    --act:      #A8351B;
    --act-w:    #F8E7E2;
    --shadow:   0 1px 2px rgba(18,23,27,.06), 0 8px 24px rgba(18,23,27,.07);
    --ui: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
    --display: "Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", system-ui, sans-serif;
    --mono: ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
  }
  :root[data-theme="dark"] {
    --ground:#0D1114; --surface:#151A1F; --sunken:#1D242A;
    --ink-1:#E9EDF0; --ink-2:#AEB9C2; --ink-3:#8E9AA4;
    --rule:#262F36; --rule-2:#36424B;
    --accent:#5FADE0; --accent-w:#12303F;
    --ok:#45C49B; --ok-w:#0F2E27;
    --watch:#E2AC45; --watch-w:#33270F;
    --act:#F2795A; --act-w:#3A1B14;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.45);
  }

  body {
    background: var(--ground);
    color: var(--ink-1);
    font-family: var(--ui);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 28px 24px 90px; }

  /* ---------- page furniture ---------- */
  .masthead { display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: baseline; padding-bottom: 16px; border-bottom: 1px solid var(--rule); }
  .masthead h1 { font-family: var(--display); font-size: 21px; font-weight: 650; letter-spacing: -.01em; margin: 0 auto 0 0; }
  .chip { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; font-weight: 650;
          padding: 3px 8px; border-radius: 3px; background: var(--watch-w); color: var(--watch); white-space: nowrap; }
  .chip.q { background: var(--sunken); color: var(--ink-2); }
  #theme { border: 1px solid var(--rule-2); background: var(--surface); color: var(--ink-2); font-size: 11px;
           font-weight: 650; letter-spacing: .06em; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  #theme:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .lede { max-width: 68ch; color: var(--ink-2); margin: 18px 0 26px; font-size: 15px; }
  .lede strong { color: var(--ink-1); font-weight: 600; }

  /* ---------- treatment switcher ---------- */
  .switch { display: flex; border: 1px solid var(--rule-2); border-radius: 6px; overflow: hidden; width: fit-content; margin-bottom: 6px; }
  .switch button {
    font-family: var(--ui); font-size: 13px; font-weight: 600; color: var(--ink-2);
    background: var(--surface); border: 0; border-right: 1px solid var(--rule-2);
    padding: 9px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 1px; text-align: left;
  }
  .switch button:last-child { border-right: 0; }
  .switch button span { font-weight: 400; font-size: 11px; color: var(--ink-3); }
  .switch button[aria-selected="true"] { background: var(--accent); color: #fff; }
  .switch button[aria-selected="true"] span { color: rgba(255,255,255,.82); }
  .switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  .panel[hidden] { display: none; }
  .panel { margin-top: 22px; }
  .panel-note { font-size: 13px; color: var(--ink-3); margin: 0 0 18px; max-width: 66ch; }

  /* ---------- Basis: the signature component ---------- */
  .b {
    font-family: var(--mono); font-variant-numeric: tabular-nums;
    border: 0; background: none; padding: 0; color: inherit; font-size: inherit; font-weight: inherit;
    border-bottom: 1px dotted var(--rule-2); cursor: pointer; line-height: 1.25;
  }
  .b:hover { border-bottom-width: 2px; border-bottom-style: solid; border-bottom-color: var(--accent); }
  .b:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
  .b[aria-expanded="true"] { border-bottom: 2px solid var(--accent); }
  .basis-line { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; margin-top: 3px; }

  /* state encoding — never colour alone */
  .st { font-family: var(--ui); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        padding: 2px 7px; border-radius: 3px; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
  .st::before { content: ""; width: 7px; height: 7px; flex: none; }
  .st-act   { background: var(--act-w);   color: var(--act); }
  .st-act::before   { background: var(--act); clip-path: polygon(50% 0,100% 100%,0 100%); }
  .st-watch { background: var(--watch-w); color: var(--watch); }
  .st-watch::before { background: var(--watch); border-radius: 50%; }
  .st-ok    { background: var(--ok-w);    color: var(--ok); }
  .st-ok::before    { background: var(--ok); }

  .num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .lbl { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); font-weight: 650; }

  /* ---------- A: Brief ---------- */
  .brief { background: var(--surface); border: 1px solid var(--rule); border-radius: 10px; padding: 40px 44px; box-shadow: var(--shadow); }
  .brief .when { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); font-weight: 650; }
  .brief-item { padding: 26px 0; border-bottom: 1px solid var(--rule); }
  .brief-item:last-child { border-bottom: 0; padding-bottom: 4px; }
  .brief-item p { font-family: var(--display); font-size: 25px; line-height: 1.42; font-weight: 400; text-wrap: balance; letter-spacing: -.011em; margin: 0; }
  .brief-item p .b { font-size: 25px; font-weight: 600; }
  .brief-item .then { margin-top: 12px; font-size: 14px; color: var(--ink-2); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .brief-item .then button.act { font-family: var(--ui); font-size: 13px; font-weight: 600; padding: 6px 13px; border-radius: 5px;
        border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
  .brief-item .then button.act:focus-visible { outline: 2px solid var(--ink-1); outline-offset: 2px; }

  /* ---------- B: Board ---------- */
  .board { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
  .card { background: var(--surface); border: 1px solid var(--rule); border-radius: 9px; box-shadow: var(--shadow); overflow: hidden; }
  .card > header { display: flex; align-items: baseline; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--rule); background: var(--sunken); }
  .card > header h3 { font-family: var(--display); font-size: 14px; font-weight: 650; margin: 0 auto 0 0; }
  .card > header .lbl { font-size: 10px; }
  .card-body { padding: 4px 16px 14px; }
  .hero-fig { padding: 16px 16px 14px; border-bottom: 1px solid var(--rule); }
  .hero-fig .v { font-family: var(--mono); font-size: 34px; font-weight: 600; letter-spacing: -.02em; }
  .row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--rule); }
  .row:last-child { border-bottom: 0; }
  .row .who { flex: 1; min-width: 0; }
  .row .who b { font-weight: 600; font-size: 14px; display: block; }
  .row .who small { color: var(--ink-3); font-size: 12px; }
  .row .qty { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .bar { height: 7px; background: var(--sunken); border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
  .bar i.is-act { background: var(--act); }
  .bar i.is-ok { background: var(--ok); }
  .camp { padding: 12px 0; border-bottom: 1px solid var(--rule); }
  .camp:last-child { border-bottom: 0; }
  .camp .top { display: flex; gap: 10px; align-items: baseline; }
  .camp .top b { font-size: 14px; font-weight: 600; margin-right: auto; }

  /* ---------- C: Console ---------- */
  .console { background: var(--surface); border: 1px solid var(--rule); border-radius: 7px; box-shadow: var(--shadow); }
  .console section { border-bottom: 1px solid var(--rule); }
  .console section:last-child { border-bottom: 0; }
  .console h3 { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-2); font-weight: 700;
                padding: 8px 14px; background: var(--sunken); display: flex; gap: 10px; align-items: center; margin: 0; }
  .console h3 em { font-style: normal; color: var(--ink-3); font-weight: 600; letter-spacing: .02em; text-transform: none; font-size: 11.5px; }
  .tblwrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); font-weight: 650;
       text-align: right; padding: 7px 14px 6px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 7px 14px; border-bottom: 1px solid var(--rule); text-align: right; white-space: nowrap;
       font-family: var(--mono); font-variant-numeric: tabular-nums; }
  td:first-child { font-family: var(--ui); }
  tr:last-child td { border-bottom: 0; }
  tbody tr:hover td { background: var(--sunken); }
  td .sub { display: block; font-size: 10.5px; color: var(--ink-3); }
  .city { font-family: var(--ui) !important; }

  /* ---------- the rail ---------- */
  .rail {
    position: fixed; top: 0; right: 0; height: 100%; width: min(420px, 92vw);
    background: var(--surface); border-left: 1px solid var(--rule-2); box-shadow: var(--shadow);
    display: flex; flex-direction: column; z-index: 40;
    transform: translateX(101%); transition: transform .22s cubic-bezier(.4,0,.2,1); visibility: hidden;
  }
  .rail.open { transform: none; visibility: visible; }
  @media (prefers-reduced-motion: reduce) { .rail { transition: none; } }
  .rail header { display: flex; align-items: flex-start; gap: 12px; padding: 15px 16px 13px; border-bottom: 1px solid var(--rule); }
  .rail header div { margin-right: auto; }
  .rail header .lbl { display: block; margin-bottom: 3px; }
  .rail header h4 { font-family: var(--display); font-size: 15px; font-weight: 650; margin: 0; }
  .rail header button { border: 1px solid var(--rule-2); background: var(--surface); color: var(--ink-2);
        width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 15px; line-height: 1; flex: none; }
  .rail header button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .rail .body { overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }
  .rail .body > div > .lbl { display: block; margin-bottom: 8px; }
  .rail .body p { margin: 0; }

  /* formula grid: one column per token, three rows */
  .fx { display: grid; grid-auto-flow: column; gap: 0 8px; overflow-x: auto; padding-bottom: 6px; }
  .fx > div { display: grid; grid-template-rows: subgrid; grid-row: span 3; justify-items: center; text-align: center; gap: 4px; }
  .fx .term { font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); font-weight: 650; }
  .fx .val { font-family: var(--mono); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .fx .val.drill { border: 0; border-bottom: 1px dotted var(--rule-2); cursor: pointer; background: none; color: inherit; padding: 0; }
  .fx .val.drill:hover { border-bottom: 2px solid var(--accent); }
  .fx .val.drill:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .fx .src { font-size: 10px; color: var(--ink-3); line-height: 1.3; }
  .fx .op .val { color: var(--ink-3); font-weight: 400; }
  .fx .op .term, .fx .op .src { visibility: hidden; }

  .band { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--ink-2); }
  .band .track { flex: 1; height: 6px; border-radius: 3px; background: linear-gradient(to right, var(--act) 0 42%, var(--watch) 42% 58%, var(--ok) 58% 100%); position: relative; }
  .band .track i { position: absolute; top: -4px; width: 2px; height: 14px; background: var(--ink-1); }
  .contrib { display: flex; flex-direction: column; gap: 7px; }
  .contrib div { display: grid; grid-template-columns: 1fr auto; gap: 10px; font-size: 12.5px; align-items: center; }
  .contrib .cb { grid-column: 1/-1; height: 5px; background: var(--sunken); border-radius: 3px; overflow: hidden; }
  .contrib .cb i { display: block; height: 100%; background: var(--act); }
  .cf { background: var(--sunken); border-left: 2px solid var(--accent); padding: 10px 12px; font-size: 13px; color: var(--ink-2); border-radius: 0 5px 5px 0; }
  .cf b { color: var(--ink-1); font-weight: 600; }
  .rule-txt { font-size: 12.5px; color: var(--ink-2); }
  .meta { font-size: 11px; color: var(--ink-3); font-family: var(--mono); border-top: 1px solid var(--rule); padding-top: 12px; line-height: 1.7; }
  .scrim { position: fixed; inset: 0; background: rgba(10,14,17,.32); z-index: 30; opacity: 0; pointer-events: none; transition: opacity .22s; }
  .scrim.open { opacity: 1; pointer-events: auto; }

  /* ---------- closing questions ---------- */
  .asks { margin-top: 40px; border-top: 2px solid var(--ink-1); padding-top: 20px; }
  .asks h2 { font-family: var(--display); font-size: 17px; font-weight: 650; margin: 0 0 6px; }
  .asks > p { color: var(--ink-2); font-size: 14px; max-width: 66ch; margin: 0 0 18px; }
  .asks ol { display: flex; flex-direction: column; gap: 14px; counter-reset: q; list-style: none; margin: 0; padding: 0; }
  .asks li { display: grid; grid-template-columns: 26px 1fr; gap: 12px; max-width: 74ch; }
  .asks li::before { counter-increment: q; content: counter(q); font-family: var(--mono); font-size: 12px; font-weight: 600;
        color: var(--accent); background: var(--accent-w); border-radius: 4px; height: 22px; display: grid; place-items: center; }
  .asks li b { font-weight: 650; }
  .asks li span.d { display: block; color: var(--ink-2); font-size: 13.5px; margin-top: 2px; }

  @media (max-width: 860px) {
    .board { grid-template-columns: 1fr; }
    .brief { padding: 28px 22px; }
    .brief-item p, .brief-item p .b { font-size: 21px; }
  }
</style>
</head>
<body>

<div class="wrap">

  <div class="masthead">
    <h1>P&amp;T Command Centre — visual language</h1>
    <span class="chip">Sample data — invented, not yours</span>
    <span class="chip q">Week 31 · Mon 28 Jul</span>
    <button id="theme">Dark</button>
  </div>

  <p class="lede">
    The same Monday morning, drawn three ways. Same numbers in all three — only the density and tone change,
    so the comparison is honest. Every figure with a <span class="b" style="cursor:default">dotted underline</span>
    is derived: <strong>click it and it shows the arithmetic that produced it.</strong> That component is the thing to judge
    hardest — it's the one that has to appear on every screen you ever build.
  </p>

  <div class="switch" role="tablist" aria-label="Density treatment">
    <button role="tab" id="t-a" aria-controls="p-a" aria-selected="true">Brief<span>lowest density</span></button>
    <button role="tab" id="t-b" aria-controls="p-b" aria-selected="false">Board<span>medium</span></button>
    <button role="tab" id="t-c" aria-controls="p-c" aria-selected="false">Console<span>highest density</span></button>
  </div>

  <!-- ============ A. BRIEF ============ -->
  <div class="panel" id="p-a" role="tabpanel" aria-labelledby="t-a">
    <p class="panel-note">Three facts, nothing else. Everything is a sentence you could read aloud. Fastest to act on — but it decides for you what matters, and hides the rest.</p>
    <div class="brief">
      <div class="when">Monday 28 July · three things</div>

      <div class="brief-item">
        <p>Four distributors owe money on <button class="b" data-basis="gap-mt">530&nbsp;MT</button> they said they'd take — about <button class="b" data-basis="gap-cr">₹3.10&nbsp;cr</button>.</p>
        <div class="then">
          <button class="act">Draft note to sales manager</button>
          <span style="color:var(--ink-3);font-size:13px">Metro Steel is the worst — 240 MT, 15 days, nothing paid.</span>
        </div>
      </div>

      <div class="brief-item">
        <p>The week's campaigns ran at <button class="b" data-basis="adherence">85.3%</button> of plan — just above the floor, held up by one good campaign.</p>
        <div class="then"><span class="st st-watch">Watch</span><span style="color:var(--ink-3);font-size:13px">25×25 SHS at Plant B is the drag, at 61%.</span></div>
      </div>

      <div class="brief-item">
        <p><button class="b" data-basis="shortfall">110&nbsp;MT</button> that was meant to be made last week wasn't — concentrated in two sizes.</p>
        <div class="then"><span class="st st-act">Act</span><span style="color:var(--ink-3);font-size:13px">25×25 × 2.0 mm is half-built: 42 of 80 MT.</span></div>
      </div>
    </div>
  </div>

  <!-- ============ B. BOARD ============ -->
  <div class="panel" id="p-b" role="tabpanel" aria-labelledby="t-b" hidden>
    <p class="panel-note">One card per thing you watch, with the chase list given the most room because it holds your only real decision. Dense inside each card, generous between them.</p>
    <div class="board">

      <div class="card">
        <header><h3>Chase list</h3><span class="lbl">You decide · weekly</span></header>
        <div class="hero-fig">
          <div class="v"><button class="b" data-basis="gap-mt" style="font:inherit">530 MT</button></div>
          <div class="basis-line">775 MT expected − 245 MT paid · 4 of 5 distributors short</div>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="who"><b>Metro Steel Syndicate</b><small>Ludhiana · 15 days · nothing paid</small></div>
            <div class="qty"><button class="b" data-basis="metro">240 MT</button><br><span class="st st-act">Act</span></div>
          </div>
          <div class="row">
            <div class="who"><b>Shree Balaji Steel</b><small>Nagpur · 9 days · nothing paid</small></div>
            <div class="qty">180 MT<br><span class="st st-act">Act</span></div>
          </div>
          <div class="row">
            <div class="who"><b>Deepak Tubes &amp; Pipes</b><small>Indore · 12 days · 60 of 145 paid</small></div>
            <div class="qty">85 MT<br><span class="st st-watch">Watch</span></div>
          </div>
          <div class="row">
            <div class="who"><b>Kisan Agencies</b><small>Rajkot · 4 days · 95 of 120 paid</small></div>
            <div class="qty">25 MT<br><span class="st st-watch">Watch</span></div>
          </div>
          <div class="row">
            <div class="who"><b>Anand Steel Traders</b><small>Surat · paid in full</small></div>
            <div class="qty">0 MT<br><span class="st st-ok">Clear</span></div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <header><h3>Campaigns</h3><span class="lbl">Every 7 days</span></header>
          <div class="card-body">
            <div class="camp">
              <div class="top"><b>40 NB Round</b><span class="lbl">Mill 2 · Plant A</span></div>
              <div class="bar"><i class="is-act" style="width:83.8%"></i></div>
              <div class="basis-line">268 / 320 MT · day 4 of 6 · <span style="color:var(--act)">83.8%</span></div>
            </div>
            <div class="camp">
              <div class="top"><b>50 NB Round</b><span class="lbl">Mill 2 · Plant A</span></div>
              <div class="bar"><i class="is-ok" style="width:100%"></i></div>
              <div class="basis-line">280 / 280 MT · complete · 100%</div>
            </div>
            <div class="camp">
              <div class="top"><b>25×25 SHS</b><span class="lbl">Mill 1 · Plant B</span></div>
              <div class="bar"><i class="is-act" style="width:61.3%"></i></div>
              <div class="basis-line">92 / 150 MT · day 5 of 6 · <span style="color:var(--act)">61.3%</span></div>
            </div>
          </div>
        </div>

        <div class="card">
          <header><h3>Planned vs produced</h3><span class="lbl">By size &amp; thickness</span></header>
          <div class="card-body">
            <div class="row"><div class="who"><b>40 NB × 2.6 mm</b></div><div class="qty">144 / 180<span class="st st-watch" style="margin-left:8px">−36</span></div></div>
            <div class="row"><div class="who"><b>40 NB × 3.2 mm</b></div><div class="qty">124 / 140<span class="st st-watch" style="margin-left:8px">−16</span></div></div>
            <div class="row"><div class="who"><b>50 NB × 2.6 mm</b></div><div class="qty">140 / 140<span class="st st-ok" style="margin-left:8px">Met</span></div></div>
            <div class="row"><div class="who"><b>50 NB × 3.2 mm</b></div><div class="qty">140 / 140<span class="st st-ok" style="margin-left:8px">Met</span></div></div>
            <div class="row"><div class="who"><b>25×25 × 2.0 mm</b></div><div class="qty">42 / 80<span class="st st-act" style="margin-left:8px">−38</span></div></div>
            <div class="row"><div class="who"><b>25×25 × 3.2 mm</b></div><div class="qty">50 / 70<span class="st st-act" style="margin-left:8px">−20</span></div></div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ============ C. CONSOLE ============ -->
  <div class="panel" id="p-c" role="tabpanel" aria-labelledby="t-c" hidden>
    <p class="panel-note">Everything on one screen, nothing folded away. Built for someone who already knows what every column means and wants no clicks between them.</p>
    <div class="console">

      <section>
        <h3>Chase list <em>530 MT unpaid · ₹3.10 cr · 4 distributors</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
        <div class="tblwrap"><table>
          <thead><tr><th>Distributor</th><th>City</th><th>Expected</th><th>Paid</th><th>Unpaid</th><th>Value</th><th>Days</th><th>State</th></tr></thead>
          <tbody>
            <tr><td>Metro Steel Syndicate</td><td class="city">Ludhiana</td><td>240</td><td>0</td><td><button class="b" data-basis="metro">240</button></td><td>₹140.2 L</td><td>15</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td>Shree Balaji Steel</td><td class="city">Nagpur</td><td>180</td><td>0</td><td>180</td><td>₹105.1 L</td><td>9</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td>Deepak Tubes &amp; Pipes</td><td class="city">Indore</td><td>145</td><td>60</td><td>85</td><td>₹49.6 L</td><td>12</td><td><span class="st st-watch">Watch</span></td></tr>
            <tr><td>Kisan Agencies</td><td class="city">Rajkot</td><td>120</td><td>95</td><td>25</td><td>₹14.6 L</td><td>4</td><td><span class="st st-watch">Watch</span></td></tr>
            <tr><td>Anand Steel Traders</td><td class="city">Surat</td><td>90</td><td>90</td><td>0</td><td>—</td><td>—</td><td><span class="st st-ok">Clear</span></td></tr>
          </tbody>
        </table></div>
      </section>

      <section>
        <h3>Campaigns <em>640 / 750 MT · adherence 85.3%</em> <span class="st st-watch" style="margin-left:auto">Watch</span></h3>
        <div class="tblwrap"><table>
          <thead><tr><th>Family</th><th>Mill</th><th>Plant</th><th>Planned</th><th>Produced</th><th>Adherence</th><th>Day</th><th>State</th></tr></thead>
          <tbody>
            <tr><td>40 NB Round</td><td>Mill 2</td><td>Plant A</td><td>320</td><td>268</td><td>83.8%</td><td>4 / 6</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td>50 NB Round</td><td>Mill 2</td><td>Plant A</td><td>280</td><td>280</td><td>100.0%</td><td>done</td><td><span class="st st-ok">Met</span></td></tr>
            <tr><td>25×25 SHS</td><td>Mill 1</td><td>Plant B</td><td>150</td><td>92</td><td>61.3%</td><td>5 / 6</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td>2.6 mm GI</td><td>Mill 3</td><td>Plant A</td><td>200</td><td>—</td><td>—</td><td>starts +2d</td><td><span class="st st-ok">Queued</span></td></tr>
            <tr style="font-weight:650"><td>Week total</td><td>—</td><td>—</td><td>750</td><td>640</td><td><button class="b" data-basis="adherence">85.3%</button><span class="sub">floor 85.0%</span></td><td>—</td><td><span class="st st-watch">Watch</span></td></tr>
          </tbody>
        </table></div>
      </section>

      <section>
        <h3>Planned vs produced <em>shortfall 110 MT across 4 of 6 lines</em> <span class="st st-act" style="margin-left:auto">Act</span></h3>
        <div class="tblwrap"><table>
          <thead><tr><th>Size</th><th>Thickness</th><th>Planned</th><th>Produced</th><th>Gap</th><th>%</th><th>State</th></tr></thead>
          <tbody>
            <tr><td>40 NB</td><td>2.6 mm</td><td>180</td><td>144</td><td>−36</td><td>80.0%</td><td><span class="st st-watch">Short</span></td></tr>
            <tr><td>40 NB</td><td>3.2 mm</td><td>140</td><td>124</td><td>−16</td><td>88.6%</td><td><span class="st st-watch">Short</span></td></tr>
            <tr><td>50 NB</td><td>2.6 mm</td><td>140</td><td>140</td><td>0</td><td>100.0%</td><td><span class="st st-ok">Met</span></td></tr>
            <tr><td>50 NB</td><td>3.2 mm</td><td>140</td><td>140</td><td>0</td><td>100.0%</td><td><span class="st st-ok">Met</span></td></tr>
            <tr><td>25×25</td><td>2.0 mm</td><td>80</td><td>42</td><td>−38</td><td>52.5%</td><td><span class="st st-act">Act</span></td></tr>
            <tr><td>25×25</td><td>3.2 mm</td><td>70</td><td>50</td><td>−20</td><td>71.4%</td><td><span class="st st-act">Act</span></td></tr>
            <tr style="font-weight:650"><td>Total</td><td>—</td><td>750</td><td>640</td><td><button class="b" data-basis="shortfall">−110</button></td><td>85.3%</td><td><span class="st st-act">Act</span></td></tr>
          </tbody>
        </table></div>
      </section>

    </div>
  </div>

  <!-- ============ closing ============ -->
  <div class="asks">
    <h2>What I need you to react to</h2>
    <p>Not "does it look nice." These five answers unblock the screen map, and three of them can't be settled without you.</p>
    <ol>
      <li><b>Which density is right?</b><span class="d">Brief, Board or Console. Pick the one you'd actually still be opening in six months, not the one that looks most impressive today.</span></li>
      <li><b>Does the arithmetic line earn its space?</b><span class="d">The small grey line under each figure — <span class="basis-line" style="display:inline">268 / 320 MT · day 4 of 6</span> — is always visible, on every number, forever. Useful, or noise?</span></li>
      <li><b>Is the panel deep enough, or too deep?</b><span class="d">Click a dotted number. That panel is one interaction away from every figure in the system. Tell me if it answers the question you'd actually be asking.</span></li>
      <li><b>Is "Act / Watch / Clear" the right vocabulary?</b><span class="d">Three states, in your words rather than red/amber/green. Or do you think in different terms?</span></li>
      <li><b>Chase list at the top — right call?</b><span class="d">I put it first everywhere because it holds your only real decision. If campaigns actually matter more on a Monday, say so now and I'll re-rank before designing screens.</span></li>
    </ol>
  </div>

</div>

<div class="scrim" id="scrim"></div>
<aside class="rail" id="rail" role="dialog" aria-modal="false" aria-labelledby="rail-title">
  <header>
    <div><span class="lbl" id="rail-kicker">Basis</span><h4 id="rail-title">—</h4></div>
    <button id="rail-close" aria-label="Close basis panel">✕</button>
  </header>
  <div class="body" id="rail-body"></div>
</aside>

<script>
  /* Derivation objects — a first sketch of the contract that ticket 15 has to freeze.
     Every figure carries its own tokens, operands, threshold, contribution and rule_version. */
  var BASIS = {
    "gap-mt": {
      title: "Unpaid quantity",
      rule: "Money has not arrived against a quantity the distributor said they would take. Expected less paid, summed across all distributors with a shortfall.",
      fx: [
        {term:"Expected", val:"775", src:"Estimates · locked 22 Jul", drill:true},
        {op:"−"},
        {term:"Paid", val:"245", src:"Receipts · as of 07:00 today", drill:true},
        {op:"="},
        {term:"Unpaid", val:"530 MT", src:"4 of 5 distributors"}
      ],
      contrib: [["Metro Steel Syndicate",240,45],["Shree Balaji Steel",180,34],["Deepak Tubes &amp; Pipes",85,16],["Kisan Agencies",25,5]],
      cf: "Metro Steel alone is <b>45%</b> of this. Clear that one and the week's gap drops to 290 MT.",
      meta: "rule_version chase.unpaid v1 · stamped at compute · receipts posted 07:00 daily"
    },
    "gap-cr": {
      title: "Value of unpaid quantity",
      rule: "Unpaid tonnes valued at the average realisation per tonne for each distributor's own mix — not a single blended rate.",
      fx: [
        {term:"Unpaid", val:"530", src:"MT · see quantity basis", drill:true},
        {op:"×"},
        {term:"Avg rate", val:"₹58,400", src:"per MT · mix-weighted"},
        {op:"="},
        {term:"Value", val:"₹3.10 cr", src:"rounded to 2 dp"}
      ],
      contrib: [["Metro Steel Syndicate",140.2,45],["Shree Balaji Steel",105.1,34],["Deepak Tubes &amp; Pipes",49.6,16],["Kisan Agencies",14.6,5]],
      cf: "Rate is mix-weighted per distributor. A flat rate would misstate Metro by about <b>₹4.2 L</b>.",
      meta: "rule_version chase.value v1 · rates from last invoiced realisation"
    },
    "metro": {
      title: "Metro Steel Syndicate — unpaid",
      rule: "This distributor's expected quantity with no receipt matched against it. Age counts from the day the estimate locked, not from first contact.",
      fx: [
        {term:"Expected", val:"240", src:"Estimate · 13 Jul", drill:true},
        {op:"−"},
        {term:"Paid", val:"0", src:"No receipt found", drill:true},
        {op:"="},
        {term:"Unpaid", val:"240 MT", src:"15 days open"}
      ],
      band: {label:"15 days open", pos: 88, note:"Act above 10 days"},
      cf: "Longest open item on the list. Second-longest is <b>Deepak at 12 days</b>.",
      meta: "rule_version chase.unpaid v1 · no receipt matched in 15 days"
    },
    "adherence": {
      title: "Campaign adherence, week 31",
      rule: "Tonnes actually produced as a share of tonnes planned, across every campaign scheduled in the window. Queued campaigns that have not started are excluded from both sides.",
      fx: [
        {term:"Produced", val:"640", src:"Production entries · to 06:00", drill:true},
        {op:"/"},
        {term:"Planned", val:"750", src:"Campaign plan · frozen 21 Jul", drill:true},
        {op:"="},
        {term:"Adherence", val:"85.3%", src:"floor 85.0%"}
      ],
      band: {label:"85.3% against a floor of 85.0%", pos: 59, note:"Act below 80% · Watch below 90%"},
      contrib: [["25×25 SHS — Plant B",-58,53],["40 NB Round — Plant A",-52,47]],
      cf: "It clears the floor by <b>0.3 points</b>. Had 25×25 produced <b>3 MT less</b>, this would read Act instead of Watch.",
      meta: "rule_version campaign.adherence v2 · 2.6 mm GI excluded, not yet started"
    },
    "shortfall": {
      title: "Production shortfall",
      rule: "Planned less produced, summed only over lines that fell short. Lines that overproduced are shown separately and never net off a shortfall.",
      fx: [
        {term:"Planned", val:"750", src:"Campaign plan · frozen 21 Jul", drill:true},
        {op:"−"},
        {term:"Produced", val:"640", src:"Production entries · to 06:00", drill:true},
        {op:"="},
        {term:"Short", val:"110 MT", src:"across 4 of 6 lines"}
      ],
      contrib: [["25×25 × 2.0 mm",-38,35],["40 NB × 2.6 mm",-36,33],["25×25 × 3.2 mm",-20,18],["40 NB × 3.2 mm",-16,14]],
      cf: "Both 25×25 lines are short — that's <b>one mill</b>, not a size problem. Mill 1 at Plant B is where to look.",
      meta: "rule_version production.shortfall v1 · overproduction not netted off"
    }
  };

  var rail = document.getElementById('rail'),
      scrim = document.getElementById('scrim'),
      railBody = document.getElementById('rail-body'),
      railTitle = document.getElementById('rail-title'),
      lastTrigger = null;

  function render(key){
    var d = BASIS[key];
    if(!d) return;
    railTitle.textContent = d.title;
    var h = '';

    h += '<div><span class="lbl">How it is worked out</span><div class="fx">';
    d.fx.forEach(function(t){
      if(t.op){
        h += '<div class="op"><span class="term">.</span><span class="val">' + t.op + '</span><span class="src">.</span></div>';
      } else {
        var v = t.drill
          ? '<button class="val drill">' + t.val + '</button>'
          : '<span class="val">' + t.val + '</span>';
        h += '<div><span class="term">' + t.term + '</span>' + v + '<span class="src">' + t.src + '</span></div>';
      }
    });
    h += '</div></div>';

    h += '<div><span class="lbl">The rule</span><p class="rule-txt">' + d.rule + '</p></div>';

    if(d.band){
      h += '<div><span class="lbl">Where it sits</span><div class="band"><div class="track"><i style="left:' + d.band.pos + '%"></i></div></div>'
         + '<p class="rule-txt" style="margin-top:8px">' + d.band.label + ' — <span style="color:var(--ink-3)">' + d.band.note + '</span></p></div>';
    }

    if(d.contrib){
      h += '<div><span class="lbl">What makes it up</span><div class="contrib">';
      d.contrib.forEach(function(c){
        h += '<div><span>' + c[0] + '</span><span class="num">' + c[1] + '</span>'
           + '<span class="cb"><i style="width:' + c[2] + '%"></i></span></div>';
      });
      h += '</div></div>';
    }

    h += '<div class="cf">' + d.cf + '</div>';
    h += '<div class="meta">' + d.meta + '</div>';
    railBody.innerHTML = h;
    railBody.scrollTop = 0;
  }

  function openRail(btn){
    if(lastTrigger && lastTrigger !== btn) lastTrigger.setAttribute('aria-expanded','false');
    lastTrigger = btn;
    btn.setAttribute('aria-expanded','true');
    render(btn.getAttribute('data-basis'));
    rail.classList.add('open');
    scrim.classList.add('open');
  }
  function closeRail(){
    rail.classList.remove('open');
    scrim.classList.remove('open');
    if(lastTrigger){ lastTrigger.setAttribute('aria-expanded','false'); lastTrigger.focus(); lastTrigger = null; }
  }

  document.addEventListener('click', function(e){
    var b = e.target.closest('.b[data-basis]');
    if(b){ openRail(b); return; }
    if(e.target.closest('#rail-close') || e.target.closest('#scrim')) closeRail();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && rail.classList.contains('open')) closeRail();
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      tabs.forEach(function(o){
        var on = (o === t);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
        document.getElementById(o.getAttribute('aria-controls')).hidden = !on;
      });
      if(rail.classList.contains('open')) closeRail();
    });
  });

  var themeBtn = document.getElementById('theme');
  themeBtn.addEventListener('click', function(){
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    themeBtn.textContent = dark ? 'Dark' : 'Light';
  });
</script>
</body>
</html>
