// ============================================================
// JSW ONE TEMPLATE MODULE
// File: /mnt/skills/user/jsw-one-pptx/scripts/jsw_template.js
//
// VENDORED COPY for scripts/sku-by-plant/ (2026-09-30). Two changes from the skill's original, both
// in asset loading: the logo and divider are read from ./assets next to this file FIRST, so the
// deck builds on any machine, not only where the skill is installed; the skill paths remain as
// fallbacks. Re-copy from the jsw-one-pptx skill if its branding changes.
//
// USAGE:
//   const pptxgen = require("pptxgenjs");
//   const T = require("/mnt/skills/user/jsw-one-pptx/scripts/jsw_template.js");
//   const pres = new pptxgen();
//   T.init(pres);  // Sets layout, defines masters, loads logo
//   const slide = T.cover(pres, { ... });   // Layout 1
//   const slide = T.agenda(pres, [...]);    // Layout 2
//   ... etc
//   pres.writeFile({ fileName: "out.pptx" });
//
// All layouts inherit JSW One brand chrome via slide masters.
// ============================================================

const fs = require("fs");
const path = require("path");

// ---------- BRAND CONSTANTS ----------
const C = {
  NAVY: "213366",
  NAVY_LIGHT: "3D5180",
  NAVY_FADED: "2D3F66",
  NAVY_TEXT_LIGHT: "C8D0E0",
  NAVY_TEXT_DIM: "9DA8C5",
  RED: "EA2127",
  GREY_DARK: "404040",
  GREY: "7F7F7F",
  GREY_LIGHT: "BFBFBF",
  GREY_BG: "F2F2F2",
  GREY_BORDER: "CCCCCC",
  GREY_HIGHLIGHT: "E8EDF5",
  WHITE: "FFFFFF",
  BLACK: "000000"
};

const FONT = "Calibri";

// ---------- ALIGNMENT GRID ----------
const G = {
  L: 0.50, R: 12.83, W: 12.33,
  TOP: 0.95, BOTTOM: 6.80, H: 5.85,
  FOOTER_Y: 7.00
};

// ---------- LOGO LOADING ----------
// White/transparent background only. Black-background variants are prohibited per brand.
function loadLogo() {
  const paths = [
    path.join(__dirname, "assets", "JSW_Logo_Clean.png"),
    "/mnt/skills/user/jsw-one-pptx/assets/JSW_Logo_Clean.png",
    "/home/claude/jsw-one-pptx/assets/JSW_Logo_Clean.png",
    "/home/claude/JSW_Logo_Clean.png"
  ];
  for (const p of paths) {
    try {
      const buf = fs.readFileSync(p);
      return "image/png;base64," + buf.toString("base64");
    } catch (e) { /* try next */ }
  }
  // Fallback: search uploads for a clean-background logo only
  try {
    const up = fs.readdirSync("/mnt/user-data/uploads/");
    const lf = up.find(f => /jsw.*logo.*clean/i.test(f));
    if (lf) {
      return "image/png;base64,"
        + fs.readFileSync("/mnt/user-data/uploads/" + lf).toString("base64");
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ---------- DIVIDER RIBBON LOADING ----------
// Brand-correct ribbon image (blue + red with overlapping triangular pin join).
// Replaces the old butt-joint two-rectangle approach which did not match brand guidelines.
function loadDividerRibbon() {
  const paths = [
    path.join(__dirname, "assets", "divider_ribbon.png"),
    "/mnt/skills/user/jsw-one-pptx/assets/divider_ribbon.png",
    "/home/claude/jsw-one-pptx/assets/divider_ribbon.png",
    "/home/claude/divider_ribbon.png"
  ];
  for (const p of paths) {
    try {
      const buf = fs.readFileSync(p);
      return "image/png;base64," + buf.toString("base64");
    } catch (e) { /* try next */ }
  }
  return null;
}

let LOGO_B64 = null;
let DIVIDER_B64 = null;

// Divider ribbon dimensions — image is 960x12 (80:1 aspect)
// At slide width 12.33", height = 12.33 / 80 = 0.154"
const DIVIDER = {
  X: 0.50,
  W: 12.33,
  H: 0.154,
  Y_CONTENT: 0.78,    // Content slide divider y
  Y_COVER: 4.50,      // Cover slide divider y
  Y_SECTION: 3.35,    // Section divider y (used by sectionInline)
  Y_AGENDA: 0.78      // Agenda slide divider y (same as content)
};

// ============================================================
// INIT — call once before adding slides
// ============================================================
function init(pres) {
  pres.layout = "LAYOUT_WIDE";
  pres.author = pres.author || "JSW One Platforms Limited";
  pres.company = pres.company || "JSW One Platforms Limited";
  
  LOGO_B64 = loadLogo();
  DIVIDER_B64 = loadDividerRibbon();
  
  if (!DIVIDER_B64) {
    throw new Error("[jsw_template] divider_ribbon.png not found in assets/. " +
      "Brand divider is mandatory. Verify assets/divider_ribbon.png exists.");
  }
  
  // Brand divider — single image (blue+red ribbon with pin join, 960x12 native, 80:1 aspect)
  const dividerImage = {
    image: { x: DIVIDER.X, y: DIVIDER.Y_CONTENT, w: DIVIDER.W, h: DIVIDER.H,
             data: DIVIDER_B64 }
  };
  
  // MASTER_CONTENT — for all standard content slides
  const contentObjects = [dividerImage];
  if (LOGO_B64) {
    contentObjects.unshift({
      image: { x: 11.40, y: 0.20, w: 1.43, h: 0.47, data: LOGO_B64 }
    });
  }
  pres.defineSlideMaster({
    title: "MASTER_CONTENT",
    background: { color: C.WHITE },
    objects: contentObjects
  });
  
  // MASTER_SECTION — for section dividers, navy background (high-impact variant)
  pres.defineSlideMaster({
    title: "MASTER_SECTION",
    background: { color: C.NAVY }
  });
  
  // MASTER_COVER — for cover/title slide
  const coverObjects = [
    { image: { x: DIVIDER.X, y: DIVIDER.Y_COVER, w: DIVIDER.W, h: DIVIDER.H,
               data: DIVIDER_B64 } }
  ];
  if (LOGO_B64) {
    coverObjects.unshift({
      image: { x: 11.40, y: 0.40, w: 1.43, h: 0.47, data: LOGO_B64 }
    });
  }
  pres.defineSlideMaster({
    title: "MASTER_COVER",
    background: { color: C.WHITE },
    objects: coverObjects
  });
  
  // MASTER_CLOSING — for thank-you / closing slide
  pres.defineSlideMaster({
    title: "MASTER_CLOSING",
    background: { color: C.NAVY }
  });
  
  // MASTER_PLAIN — white background, no chrome.
  // Used by sectionInline() so the divider/logo can be placed below the title row,
  // and by any custom slide that needs a clean canvas.
  pres.defineSlideMaster({
    title: "MASTER_PLAIN",
    background: { color: C.WHITE }
  });
}

// ============================================================
// SHARED HELPERS
// ============================================================

function addTitle(slide, text) {
  slide.addText(text, {
    x: 0.50, y: 0.10, w: 9.80, h: 0.58,
    fontFace: FONT, fontSize: 17, bold: true, color: C.NAVY,
    valign: "middle", align: "left"
  });
}

function addBreadcrumb(slide, text) {
  slide.addText(text, {
    x: 10.20, y: 0.85, w: 2.60, h: 0.13,
    fontFace: FONT, fontSize: 7.5, color: C.GREY, italic: true,
    valign: "middle", align: "right"
  });
}

function addFooter(slide, sourceText, pageNum) {
  if (sourceText) {
    slide.addText(sourceText, {
      x: 0.50, y: G.FOOTER_Y, w: 11.00, h: 0.30,
      fontFace: FONT, fontSize: 8, color: C.GREY, italic: true,
      valign: "middle", align: "left"
    });
  }
  if (pageNum != null) {
    slide.addText(String(pageNum), {
      x: 12.50, y: G.FOOTER_Y, w: 0.40, h: 0.30,
      fontFace: FONT, fontSize: 9, color: C.GREY,
      valign: "middle", align: "right"
    });
  }
}

function kpiCard(slide, x, y, w, h, num, label, sub, opts = {}) {
  slide.addShape("rect", {
    x, y, w, h,
    fill: { color: opts.fill || C.GREY_BG },
    line: { color: C.GREY_BORDER, width: 0.5 }
  });
  slide.addText(String(num), {
    x: x + 0.10, y: y + 0.05, w: w - 0.20, h: 0.40,
    fontFace: FONT, fontSize: opts.numSize || 18, bold: true,
    color: opts.numColor || C.NAVY,
    valign: "middle", align: "left"
  });
  slide.addText(label, {
    x: x + 0.10, y: y + 0.43, w: w - 0.20, h: 0.20,
    fontFace: FONT, fontSize: 10, bold: true, color: C.GREY_DARK,
    valign: "middle", align: "left"
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.10, y: y + 0.62, w: w - 0.20, h: 0.20,
      fontFace: FONT, fontSize: 9, color: C.GREY,
      valign: "middle", align: "left"
    });
  }
}

// ============================================================
// LAYOUT 1 — COVER
// opts: { eyebrow, title, date, period, audience }
// ============================================================
function cover(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_COVER" });
  
  if (opts.eyebrow) {
    slide.addText(opts.eyebrow, {
      x: 0.50, y: 3.05, w: G.W, h: 0.30,
      fontFace: FONT, fontSize: 11, bold: true, color: C.GREY,
      charSpacing: 6, valign: "middle", align: "left"
    });
  }
  
  slide.addText(opts.title || "Title", {
    x: 0.50, y: 3.50, w: G.W, h: 0.85,
    fontFace: FONT, fontSize: 40, bold: true, color: C.NAVY,
    valign: "middle", align: "left"
  });
  
  // Three meta fields (Date | Period | Audience)
  const fields = [
    { x: 0.50, w: 2.50, label: "DATE", value: opts.date || "" },
    { x: 3.20, w: 3.50, label: "PERIOD", value: opts.period || "" },
    { x: 6.90, w: 4.00, label: "AUDIENCE", value: opts.audience || "" }
  ];
  fields.forEach(f => {
    if (!f.value) return;
    slide.addText([
      { text: f.label + "\n", options: { fontSize: 9, bold: true, color: C.GREY, charSpacing: 4 } },
      { text: f.value, options: { fontSize: 12, color: C.GREY_DARK } }
    ], {
      x: f.x, y: 5.30, w: f.w, h: 0.65,
      fontFace: FONT, valign: "top", align: "left"
    });
  });
  
  return slide;
}

// ============================================================
// LAYOUT 2 — AGENDA
// items: [{ num, title, sub }, ...]
// ============================================================
function agenda(pres, items, opts = {}) {
  const slide = pres.addSlide({ masterName: "MASTER_CONTENT" });
  addTitle(slide, opts.title || "Agenda");
  
  const top = 1.10;
  const rowH = Math.min(0.74, (G.BOTTOM - top - 0.30) / items.length);
  
  items.forEach((item, i) => {
    const y = top + i * rowH;
    slide.addText(item.num, {
      x: 0.50, y: y + 0.10, w: 0.80, h: 0.50,
      fontFace: FONT, fontSize: 22, bold: true, color: C.RED,
      valign: "middle", align: "left"
    });
    slide.addText(item.title, {
      x: 1.40, y: y + 0.05, w: 11.00, h: 0.30,
      fontFace: FONT, fontSize: 14, bold: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
    if (item.sub) {
      slide.addText(item.sub, {
        x: 1.40, y: y + 0.36, w: 11.00, h: 0.24,
        fontFace: FONT, fontSize: 10, color: C.GREY_DARK,
        valign: "middle", align: "left"
      });
    }
    slide.addShape("line", {
      x: 0.50, y: y + rowH - 0.05, w: G.W, h: 0,
      line: { color: C.GREY_BORDER, width: 0.5 }
    });
  });
  
  if (opts.source || opts.pageNum) addFooter(slide, opts.source, opts.pageNum);
  return slide;
}

// ============================================================
// LAYOUT 3 — SECTION DIVIDER
// opts: { number, eyebrow, title1, title2, subtitle, pageNum }
// ============================================================
function section(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_SECTION" });
  
  // Large faded number/letter anchored bottom-right
  if (opts.number) {
    slide.addText(String(opts.number), {
      x: 8.50, y: 2.50, w: 4.50, h: 4.50,
      fontFace: FONT, fontSize: 240, bold: true, color: C.NAVY_FADED,
      valign: "middle", align: "center"
    });
  }
  
  // Eyebrow (small caps)
  if (opts.eyebrow) {
    slide.addText(opts.eyebrow, {
      x: 0.50, y: 2.20, w: 8.00, h: 0.30,
      fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY_TEXT_DIM,
      charSpacing: 6, valign: "middle", align: "left"
    });
  }
  
  // Title (split across two lines for editorial feel)
  if (opts.title1) {
    slide.addText(opts.title1, {
      x: 0.50, y: 2.55, w: 8.00, h: 0.85,
      fontFace: FONT, fontSize: 44, bold: true, color: C.WHITE,
      valign: "middle", align: "left"
    });
  }
  if (opts.title2) {
    slide.addText(opts.title2, {
      x: 0.50, y: 3.45, w: 8.00, h: 0.85,
      fontFace: FONT, fontSize: 44, bold: true, color: C.WHITE,
      valign: "middle", align: "left"
    });
  }
  // Or single-line title
  if (opts.title && !opts.title1) {
    slide.addText(opts.title, {
      x: 0.50, y: 2.95, w: 8.00, h: 1.20,
      fontFace: FONT, fontSize: 44, bold: true, color: C.WHITE,
      valign: "middle", align: "left"
    });
  }
  
  if (opts.subtitle) {
    slide.addText(opts.subtitle, {
      x: 0.50, y: 4.50, w: 8.00, h: 0.80,
      fontFace: FONT, fontSize: 13, color: C.NAVY_TEXT_LIGHT,
      valign: "top", align: "left"
    });
  }
  
  if (opts.pageNum != null) {
    slide.addText(String(opts.pageNum), {
      x: 12.50, y: G.FOOTER_Y, w: 0.40, h: 0.30,
      fontFace: FONT, fontSize: 9, color: C.WHITE,
      valign: "middle", align: "right"
    });
  }
  
  return slide;
}

// ============================================================
// LAYOUT 3b — INLINE SECTION DIVIDER (internal-review variant)
// White background, small navy badge, sentence-case title, divider BELOW the title.
// Used for monthly internal reviews (S&OP, Homes CEO, PB BizFin, Financial perf).
// opts: { number, title, subtitle, theme, pageNum }
//   number: "01", "02", ... (rendered in a small navy badge top-left)
//   title: sentence-case section name
//   subtitle: optional one-liner under the title
//   theme: optional italic theme/ask line below the divider
// ============================================================
function sectionInline(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_PLAIN" });
  
  // Small navy badge with section number (top-left)
  if (opts.number) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.50, y: 1.80, w: 0.55, h: 0.55,
      fill: { color: C.NAVY }, line: { color: C.NAVY, width: 0 }
    });
    slide.addText(String(opts.number), {
      x: 0.50, y: 1.80, w: 0.55, h: 0.55,
      fontFace: FONT, fontSize: 18, bold: true, color: C.WHITE,
      valign: "middle", align: "center"
    });
  }
  
  // Title — sentence case, navy
  if (opts.title) {
    slide.addText(opts.title, {
      x: 1.20, y: 1.80, w: 11.00, h: 0.55,
      fontFace: FONT, fontSize: 28, bold: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
  }
  
  // Divider ribbon BELOW the title row
  if (DIVIDER_B64) {
    slide.addImage({
      data: DIVIDER_B64,
      x: DIVIDER.X, y: 2.55, w: DIVIDER.W, h: DIVIDER.H
    });
  }
  
  // Optional subtitle (under the divider, grey)
  if (opts.subtitle) {
    slide.addText(opts.subtitle, {
      x: 1.20, y: 2.85, w: 11.00, h: 0.40,
      fontFace: FONT, fontSize: 14, color: C.GREY_DARK,
      valign: "middle", align: "left"
    });
  }
  
  // Optional theme line (italic, navy)
  if (opts.theme) {
    slide.addText(opts.theme, {
      x: 1.20, y: 3.30, w: 11.00, h: 0.32,
      fontFace: FONT, fontSize: 11, italic: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
  }
  
  // Page number (footer, grey)
  if (opts.pageNum != null) {
    slide.addText(String(opts.pageNum), {
      x: 0.30, y: G.FOOTER_Y, w: 0.50, h: 0.30,
      fontFace: FONT, fontSize: 10, color: C.GREY,
      valign: "middle", align: "left"
    });
  }
  
  return slide;
}
// opts: { title, breadcrumb, kpis: [{num,label,sub}], obsLabel, observations: [{h,b}],
//         bandLabel, bandRuns: [{text, bold, color}], source, pageNum }
// ============================================================
function kpiObsBand(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_CONTENT" });
  if (opts.title) addTitle(slide, opts.title);
  if (opts.breadcrumb) addBreadcrumb(slide, opts.breadcrumb);
  
  // KPI strip (1 row, evenly spaced)
  if (opts.kpis && opts.kpis.length) {
    const n = opts.kpis.length;
    const gap = 0.10;
    const w = (G.W - gap * (n - 1)) / n;
    opts.kpis.forEach((k, i) => {
      kpiCard(slide, G.L + i * (w + gap), 0.95, w, 0.85, k.num, k.label, k.sub, k.opts || {});
    });
  }
  
  if (opts.obsLabel) {
    slide.addText(opts.obsLabel, {
      x: 0.50, y: 2.00, w: G.W, h: 0.30,
      fontFace: FONT, fontSize: 12, bold: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
  }
  
  // 3-column observations
  if (opts.observations && opts.observations.length) {
    const n = opts.observations.length;
    const gap = 0.20;
    const w = (G.W - gap * (n - 1)) / n;
    opts.observations.forEach((o, i) => {
      const x = G.L + i * (w + gap);
      slide.addShape("rect", {
        x, y: 2.40, w, h: 1.95,
        fill: { color: C.GREY_BG }, line: { color: C.GREY_BORDER, width: 0.5 }
      });
      slide.addText(o.h, {
        x: x + 0.15, y: 2.50, w: w - 0.30, h: 0.40,
        fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY,
        valign: "top", align: "left"
      });
      slide.addText(o.b, {
        x: x + 0.15, y: 2.95, w: w - 0.30, h: 1.30,
        fontFace: FONT, fontSize: 10, color: C.GREY_DARK,
        valign: "top", align: "left"
      });
    });
  }
  
  // Bottom commentary band
  if (opts.bandRuns) {
    slide.addShape("rect", {
      x: G.L, y: 4.55, w: G.W, h: 2.10,
      fill: { color: C.NAVY }, line: { color: C.NAVY, width: 0 }
    });
    if (opts.bandLabel) {
      slide.addText(opts.bandLabel, {
        x: G.L + 0.20, y: 4.65, w: 5.00, h: 0.30,
        fontFace: FONT, fontSize: 11, bold: true, color: C.WHITE,
        valign: "middle", align: "left"
      });
    }
    slide.addText(opts.bandRuns.map(r => ({
      text: r.text,
      options: {
        fontSize: r.size || 10,
        bold: r.bold || false,
        color: r.color || C.WHITE
      }
    })), {
      x: G.L + 0.20, y: 5.00, w: G.W - 0.40, h: 1.55,
      fontFace: FONT, valign: "top", align: "left"
    });
  }
  
  if (opts.source || opts.pageNum != null) addFooter(slide, opts.source, opts.pageNum);
  return slide;
}

// ============================================================
// LAYOUT 5 — Two column (chart left + structured commentary right)
// opts: { title, breadcrumb, leftLabel, chartType, chartData, chartOpts,
//         rightLabel, rightRuns, source, pageNum }
// ============================================================
function chartCommentary(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_CONTENT" });
  if (opts.title) addTitle(slide, opts.title);
  if (opts.breadcrumb) addBreadcrumb(slide, opts.breadcrumb);
  
  const colW = (G.W - 0.30) / 2;
  
  if (opts.leftLabel) {
    slide.addText(opts.leftLabel, {
      x: G.L, y: 0.95, w: colW, h: 0.30,
      fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
  }
  
  if (opts.chartType && opts.chartData) {
    const baseChartOpts = {
      x: G.L, y: 1.30, w: colW, h: 4.20,
      barDir: "col", chartColors: [C.NAVY],
      showLegend: false, showValue: true,
      dataLabelFontFace: FONT, dataLabelFontSize: 10, dataLabelColor: C.BLACK,
      dataLabelPosition: "outEnd",
      catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, catAxisLabelColor: C.GREY_DARK,
      valAxisHidden: true, catAxisHidden: false,
      valGridLine: { style: "none" }, catGridLine: { style: "none" },
      plotArea: { fill: { color: C.WHITE } }
    };
    slide.addChart(opts.chartType, opts.chartData, Object.assign(baseChartOpts, opts.chartOpts || {}));
  }
  
  const rightX = G.L + colW + 0.30;
  if (opts.rightLabel) {
    slide.addText(opts.rightLabel, {
      x: rightX, y: 0.95, w: colW, h: 0.30,
      fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY,
      valign: "middle", align: "left"
    });
  }
  
  if (opts.rightRuns) {
    slide.addText(opts.rightRuns.map(r => ({
      text: r.text,
      options: {
        fontSize: r.size || 10,
        bold: r.bold || false,
        color: r.color || (r.bold ? C.NAVY : C.GREY_DARK)
      }
    })), {
      x: rightX, y: 1.30, w: colW, h: 5.20,
      fontFace: FONT, valign: "top", align: "left",
      lineSpacingMultiple: 1.15
    });
  }
  
  if (opts.source || opts.pageNum != null) addFooter(slide, opts.source, opts.pageNum);
  return slide;
}

// ============================================================
// LAYOUT 6 — KPI strip + 3 BU columns + handoff band
// opts: { title, breadcrumb, kpis, bus: [{ name, q4, fy, metrics: [[label,value]] }],
//         handoffs: [string], source, pageNum }
// ============================================================
function buColumns(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_CONTENT" });
  if (opts.title) addTitle(slide, opts.title);
  if (opts.breadcrumb) addBreadcrumb(slide, opts.breadcrumb);
  
  // KPI strip
  if (opts.kpis && opts.kpis.length) {
    const n = opts.kpis.length;
    const gap = 0.10;
    const w = (G.W - gap * (n - 1)) / n;
    opts.kpis.forEach((k, i) => {
      kpiCard(slide, G.L + i * (w + gap), 0.95, w, 0.85, k.num, k.label, k.sub, k.opts || {});
    });
  }
  
  // BU columns
  if (opts.bus && opts.bus.length) {
    const n = opts.bus.length;
    const gap = 0.20;
    const buW = (G.W - gap * (n - 1)) / n;
    const buY = 2.00;
    
    opts.bus.forEach((bu, i) => {
      const x = G.L + i * (buW + gap);
      
      // Header band
      slide.addShape("rect", {
        x, y: buY, w: buW, h: 0.36,
        fill: { color: C.NAVY }, line: { color: C.NAVY, width: 0 }
      });
      slide.addText(bu.name, {
        x: x + 0.10, y: buY, w: buW - 0.20, h: 0.36,
        fontFace: FONT, fontSize: 11, bold: true, color: C.WHITE,
        valign: "middle", align: "left"
      });
      
      // Achievement boxes
      if (bu.q4 != null && bu.fy != null) {
        const achY = buY + 0.40;
        const halfW = buW / 2 - 0.05;
        const colorOf = (v) => v >= 90 ? C.NAVY : (v >= 70 ? C.GREY : C.RED);
        
        slide.addShape("rect", { x, y: achY, w: halfW, h: 0.40,
          fill: { color: C.GREY_BG }, line: { color: C.GREY_BORDER, width: 0.5 } });
        slide.addText([
          { text: "Q4 ", options: { fontSize: 9, color: C.GREY, fontFace: FONT } },
          { text: bu.q4 + "%", options: { fontSize: 14, bold: true, color: colorOf(bu.q4), fontFace: FONT } }
        ], { x: x + 0.05, y: achY, w: halfW - 0.10, h: 0.40, valign: "middle", align: "center" });
        
        slide.addShape("rect", { x: x + halfW + 0.10, y: achY, w: halfW, h: 0.40,
          fill: { color: C.GREY_BG }, line: { color: C.GREY_BORDER, width: 0.5 } });
        slide.addText([
          { text: "FY ", options: { fontSize: 9, color: C.GREY, fontFace: FONT } },
          { text: bu.fy + "%", options: { fontSize: 14, bold: true, color: colorOf(bu.fy), fontFace: FONT } }
        ], { x: x + halfW + 0.15, y: achY, w: halfW - 0.10, h: 0.40, valign: "middle", align: "center" });
      }
      
      // Metric rows
      if (bu.metrics && bu.metrics.length) {
        const metY = buY + (bu.q4 != null ? 0.90 : 0.45);
        const rowH = 0.30;
        bu.metrics.forEach((m, r) => {
          const ry = metY + r * rowH;
          slide.addText(m[0], {
            x: x + 0.05, y: ry, w: 1.10, h: rowH,
            fontFace: FONT, fontSize: 9.5, bold: true, color: C.GREY_DARK,
            valign: "middle", align: "left"
          });
          slide.addText(m[1], {
            x: x + 1.15, y: ry, w: buW - 1.20, h: rowH,
            fontFace: FONT, fontSize: 9.5, color: C.BLACK,
            valign: "middle", align: "left"
          });
          if (r < bu.metrics.length - 1) {
            slide.addShape("line", {
              x: x + 0.05, y: ry + rowH, w: buW - 0.10, h: 0,
              line: { color: C.GREY_BORDER, width: 0.25 }
            });
          }
        });
      }
    });
  }
  
  // Handoff band
  if (opts.handoffs && opts.handoffs.length) {
    slide.addShape("rect", {
      x: G.L, y: 6.10, w: G.W, h: 0.55,
      fill: { color: C.NAVY }, line: { color: C.NAVY, width: 0 }
    });
    if (opts.handoffLabel) {
      slide.addText(opts.handoffLabel, {
        x: G.L + 0.10, y: 6.15, w: 4.00, h: 0.20,
        fontFace: FONT, fontSize: 9, bold: true, color: C.WHITE,
        valign: "middle", align: "left"
      });
    }
    const n = opts.handoffs.length;
    opts.handoffs.forEach((h, i) => {
      slide.addText(h, {
        x: G.L + 0.10 + i * (G.W / n), y: 6.35, w: G.W / n - 0.20, h: 0.30,
        fontFace: FONT, fontSize: 8.5, color: C.WHITE,
        valign: "middle", align: "left"
      });
    });
  }
  
  if (opts.source || opts.pageNum != null) addFooter(slide, opts.source, opts.pageNum);
  return slide;
}

// ============================================================
// LAYOUT 7 — P&L variance table with 3-column commentary
// opts: { title, breadcrumb, columnHeaders, rows: [{label, q4A, q4T, fyA, fyT, em}],
//         observations: [{h,b}], source, pageNum }
// ============================================================
function plVarianceTable(pres, opts) {
  const slide = pres.addSlide({ masterName: "MASTER_CONTENT" });
  if (opts.title) addTitle(slide, opts.title);
  if (opts.breadcrumb) addBreadcrumb(slide, opts.breadcrumb);
  
  const headers = opts.columnHeaders || [
    "₹ Cr", "Q4 A", "Q4 AOP", "Q4 Var", "Q4 Ach %",
    "FY A", "FY AOP", "FY Var", "FY Ach %"
  ];
  
  const headerRow = headers.map((h, i) => ({
    text: h,
    options: {
      fill: { color: C.NAVY }, color: C.WHITE, bold: true,
      fontSize: 10, fontFace: FONT,
      align: i === 0 ? "left" : "center", valign: "middle"
    }
  }));
  const data = [headerRow];
  
  const fmt = v => {
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    if (abs >= 1000) return sign + abs.toLocaleString("en-IN", { maximumFractionDigits: 1 });
    return sign + abs.toFixed(1);
  };
  const fmtVar = v => (v >= 0 ? "+" : "") + v.toFixed(1);
  const fmtAch = a => isFinite(a) ? Math.round(a) + "%" : "n/a";
  const varColor = v => v >= 0 ? C.NAVY : C.RED;
  
  (opts.rows || []).forEach((r, ri) => {
    const q4Var = r.q4A - r.q4T;
    const q4Ach = (r.q4A / r.q4T) * 100;
    const fyVar = r.fyA - r.fyT;
    const fyAch = (r.fyA / r.fyT) * 100;
    const rf = r.em ? C.GREY_HIGHLIGHT : (ri % 2 === 0 ? C.WHITE : C.GREY_BG);
    
    data.push([
      { text: r.label, options: { fill: { color: rf }, color: C.BLACK, bold: r.em, fontSize: 10, fontFace: FONT, align: "left", valign: "middle" } },
      { text: fmt(r.q4A), options: { fill: { color: rf }, color: C.BLACK, bold: r.em, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmt(r.q4T), options: { fill: { color: rf }, color: C.GREY_DARK, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmtVar(q4Var), options: { fill: { color: rf }, color: varColor(q4Var), bold: true, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmtAch(q4Ach), options: { fill: { color: rf }, color: C.GREY_DARK, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmt(r.fyA), options: { fill: { color: rf }, color: C.BLACK, bold: r.em, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmt(r.fyT), options: { fill: { color: rf }, color: C.GREY_DARK, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmtVar(fyVar), options: { fill: { color: rf }, color: varColor(fyVar), bold: true, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } },
      { text: fmtAch(fyAch), options: { fill: { color: rf }, color: C.GREY_DARK, fontSize: 10, fontFace: FONT, align: "center", valign: "middle" } }
    ]);
  });
  
  slide.addTable(data, {
    x: G.L, y: 0.95, w: G.W,
    colW: opts.colW || [3.20, 1.20, 1.20, 1.10, 1.00, 1.20, 1.20, 1.10, 1.13],
    border: { pt: 0.5, color: C.GREY_BORDER },
    rowH: 0.36
  });
  
  // Commentary band
  if (opts.observations && opts.observations.length) {
    const tableH = 0.36 * (data.length);
    const cy = 0.95 + tableH + 0.30;
    const bandH = G.BOTTOM - cy - 0.10;
    slide.addShape("rect", { x: G.L, y: cy, w: G.W, h: bandH,
      fill: { color: C.NAVY }, line: { color: C.NAVY, width: 0 } });
    slide.addText(opts.obsLabel || "Variance observations", {
      x: G.L + 0.20, y: cy + 0.10, w: 5.00, h: 0.25,
      fontFace: FONT, fontSize: 11, bold: true, color: C.WHITE,
      valign: "middle", align: "left"
    });
    const n = opts.observations.length;
    opts.observations.forEach((o, i) => {
      slide.addText(o.h, {
        x: G.L + 0.20 + i * (G.W / n), y: cy + 0.42, w: G.W / n - 0.40, h: 0.30,
        fontFace: FONT, fontSize: 10, bold: true, color: C.WHITE, valign: "top", align: "left"
      });
      slide.addText(o.b, {
        x: G.L + 0.20 + i * (G.W / n), y: cy + 0.74, w: G.W / n - 0.40, h: bandH - 0.80,
        fontFace: FONT, fontSize: 9, color: C.WHITE, valign: "top", align: "left"
      });
    });
  }
  
  if (opts.source || opts.pageNum != null) addFooter(slide, opts.source, opts.pageNum);
  return slide;
}

// ============================================================
// LAYOUT 8 — ANNEXURE DIVIDER (variant of section, anchor letter)
// ============================================================
function annexure(pres, opts = {}) {
  return section(pres, Object.assign({
    number: opts.anchor || "A",
    eyebrow: opts.eyebrow || "ANNEXURE",
    title1: opts.title1 || "Supporting tables",
    title2: opts.title2 || "and reconciliations",
    subtitle: opts.subtitle,
    pageNum: opts.pageNum
  }, opts));
}

// ============================================================
// LAYOUT 9 — CLOSING
// opts: { title, attribution: [{text, bold, color}], subtitle, organisation }
// ============================================================
function closing(pres, opts = {}) {
  const slide = pres.addSlide({ masterName: "MASTER_CLOSING" });
  
  slide.addText(opts.title || "Thank you", {
    x: 0.50, y: 2.80, w: G.W, h: 1.50,
    fontFace: FONT, fontSize: 60, bold: true, color: C.WHITE,
    valign: "middle", align: "left"
  });
  
  if (opts.attribution) {
    slide.addText(opts.attribution.map(a => ({
      text: a.text,
      options: {
        fontSize: a.size || 14,
        bold: a.bold || false,
        color: a.color || (a.bold ? C.WHITE : C.NAVY_TEXT_LIGHT)
      }
    })), {
      x: 0.50, y: 4.50, w: G.W, h: 0.40,
      fontFace: FONT, valign: "middle", align: "left"
    });
  }
  
  if (opts.organisation) {
    slide.addText(opts.organisation, {
      x: 0.50, y: 5.00, w: G.W, h: 0.40,
      fontFace: FONT, fontSize: 12, color: C.NAVY_TEXT_LIGHT,
      valign: "middle", align: "left"
    });
  }
  
  // Brand divider in white/red
  slide.addShape("rect", { x: 0.50, y: 5.60, w: 8.15, h: 0.05,
    fill: { color: C.WHITE }, line: { color: C.WHITE, width: 0 } });
  slide.addShape("rect", { x: 8.25, y: 5.60, w: 4.58, h: 0.05,
    fill: { color: C.RED }, line: { color: C.RED, width: 0 } });
  
  return slide;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // Constants
  C, FONT, G, DIVIDER,
  // Init
  init,
  // Helpers
  addTitle, addBreadcrumb, addFooter, kpiCard,
  // Layouts
  cover, agenda, section, sectionInline, annexure, closing,
  kpiObsBand,        // Layout 4
  chartCommentary,   // Layout 5
  buColumns,         // Layout 6
  plVarianceTable    // Layout 7
};
