# 🔧 OPTIMIZED PROMPT — JSW One Pipes & Tubes: Inventory Management System

> **Target AI:** Claude (Anthropic) — optimized for long-context reasoning, structured data modeling, and React artifact generation
> **Complexity:** High — Multi-stage manufacturing pipeline with cross-entity traceability, validation logic, and real-time dashboards

---

## THE PROMPT

---

**ROLE ASSIGNMENT:**

You are a senior full-stack engineer and manufacturing systems architect specializing in steel pipe & tube production operations. You have deep expertise in inventory lifecycle tracking, coil-to-finished-goods traceability, weight-based yield analysis, and production floor data entry systems. You will build a complete, production-ready React application.

---

**CONTEXT — THE BUSINESS:**

JSW One Pipes & Tubes operates a steel tube manufacturing plant (currently Hyderabad). The production pipeline converts HR (Hot Rolled) steel coils into finished tube bundles through a 5-stage linear process. Every kilogram of steel must be traceable from mother coil arrival through to dispatch invoice. All theoretical weight calculations use the **proportionate method** — weight flows downstream based on the ratio of the child entity's dimension to the parent total. **No density constants are used anywhere.** Example: Baby coil weight = `(Baby Width / Sum of All Baby Widths) × Mother Actual Weight`. This proportionate logic cascades through every stage.

---

**SYSTEM ARCHITECTURE — 5 STAGES + MASTERS + DASHBOARDS:**

Build a **single-page React application** with tabbed navigation across the following modules. Each module is a data-entry screen with inline validation, auto-calculations, and visual status indicators. All data is persisted via `window.storage` (key-value, JSON-serialized).

---

### STAGE 1: COIL INWARD (Mother Coil Registration)

**Purpose:** Record arrival of HR mother coils at the plant.

**Data Fields:**

| Field | Type | Source | Notes |
|---|---|---|---|
| Date of Inward | Date picker | Manual | Default: today |
| HR Coil No. | Integer | Manual | Simple sequential (1, 2, 3…) |
| HR Coil ID | Auto-generated | Formula | Format: `HYD-MMYY-XX` where MM=month, YY=year of inward date, XX=zero-padded coil number. Example: `HYD-0426-05` |
| Input Coil Number (Batch ID) | Text | Manual | Supplier's coil number (e.g., `C102781102`) |
| Coil Grade | Text | Manual | Free text entry (e.g., `E250-BR`, `IS10748 Gr 1`, `IS10748 Gr 2`, `HR2`) |
| Heat Number | Text | Manual | Supplier heat/batch reference |
| Thickness (mm) | Number | Manual | Steel thickness |
| Width (mm) | Number | Manual | Mother coil width — **critical for slit validation** |
| Length (mm) | Number | Manual | Optional |
| Invoice Weight (T) | Number | Manual | Weight on supplier invoice |
| Actual Weight (T) | Number | Manual | Weighed at plant |
| Cost Price (₹) | Number | Manual | Purchase cost |
| PO Number | Text | Manual | JSW purchase order reference (e.g., `JOO-0BGCK1QR7`) |

**Auto-Calculated / Performance Fields:**

| Field | Logic |
|---|---|
| Total Baby Coil Width (mm) | SUM of all baby coil widths created from this mother coil (cross-reference Stage 2) |
| Width Check | If `Total Baby Coil Width` is within ±5% of Mother Coil Width → ✔ OK (green). Outside ±5% → ⚠ WARNING (red) |
| FG Readiness | Status: what % of this coil has been converted to tubes |
| Dispatched Weight (T) | SUM of dispatched bundle weights traceable to this coil |
| Yield % | `(Dispatched Weight / Actual Weight) × 100` |
| Duplicate ID Check | Flag if HR Coil ID already exists |

---

### STAGE 2: COIL TO SLIT (Mother Coil → Baby Coils)

**Purpose:** Record slitting of a mother coil into multiple narrower baby coils.

**Data Fields:**

| Field | Type | Source | Notes |
|---|---|---|---|
| Date of Conversion | Date | Manual | |
| HR Coil ID | Dropdown | Auto-populated | Select from Stage 1 registered coils |
| Baby Coil Entry | Auto-generated | System | Sequential letter: A, B, C, D… per mother coil |
| Baby Coil ID | Auto-generated | Formula | Format: `{HR Coil ID}-{Letter}` → e.g., `HYD-0326-01-A` |
| Thickness (mm) | Auto-fetched | Stage 1 lookup | Inherited from mother coil |
| Width (mm) | Number | Manual | Width of this individual baby coil slit |
| Length (mm) | Number | Manual | Optional |
| Weight (T) | Auto-calculated | Formula | **Proportionate method:** `(Baby Width / Sum of All Baby Widths from this Mother Coil) × Mother Actual Weight` |
| Cost Price (₹) | Auto-calculated | Formula | **Proportionate method:** `(Baby Width / Sum of All Baby Widths) × Mother Cost Price`. Recalculates all siblings on add/edit/delete. |
| PO Number | Auto-fetched | Stage 1 lookup | |

**Validation Rules (CRITICAL):**

| Validation | Logic | Display |
|---|---|---|
| Sum Baby Width vs Parent Width | SUM of all baby coil widths for a given HR Coil ID. **3-color validation:** ≤100% → green ✔ OK, 100-105% → yellow ⚠ Over 100% (within tolerance, can save), >105% → red ✘ Exceeds 105% (save blocked). | Show: `1243 / 1250 mm (99.4%) ✔ OK` or `1280 / 1250 mm (102.4%) ⚠ Over 100%` or `1320 / 1250 mm (105.6%) ✘ Exceeds 105%` |
| Duplicate Baby Coil ID | No two rows can share the same Baby Coil ID | Flag duplicates in red |
| Width Sum Display | Always show `{sum} / {parent} mm` for quick operator reference | Inline per HR Coil ID group |

---

### STAGE 3: SLIT TO TUBE CONVERSION (Baby Coil → Finished Goods)

**Purpose:** Record tube manufacturing from each baby coil.

**Data Fields:**

| Field | Type | Source | Notes |
|---|---|---|---|
| Date of Conversion | Date | Manual | |
| SKU Code | Dropdown | SKU Master | Full product description, e.g., `MS SHS One Helix IS 4923 YSt 210 Black 38x38x2.80x6000` |
| Baby Coil ID | Dropdown | Stage 2 | Only show baby coils not yet fully converted |
| Number of Pieces | Number | Manual | Count of tubes produced |
| Thickness (mm) | Auto-fetched | Stage 2 | |
| Width (mm) | Number | Manual | Tube width — can differ from slit width. Validated: sum of tube widths must not exceed 105% of baby coil width. |
| Length (mm) | Auto-fetched | SKU Master | Standard tube length (typically 6000mm) |
| Theoretical Weight (T) | Auto-calculated | Formula | **Proportionate method:** `(Number of Pieces produced / Total possible pieces from this baby coil) × Baby Coil Weight`. Alternatively: `Baby Coil Weight` is the theoretical weight for the full baby coil (since all pieces come from it). Per-piece weight = `Baby Coil Weight / Total Number of Pieces`. Total = Per-piece × Number of Pieces. |

**Validation Rules:**

| Validation | Logic |
|---|---|
| Width Sum Check | SUM of tube widths from a baby coil vs Baby Coil Width. **3-color:** ≤100% → green ✔ OK, 100-105% → yellow ⚠ (can save), >105% → red ✘ (save blocked). Same pattern as Stage 2. |
| Weight Check | SUM of theoretical weights for all tube batches from a baby coil must be **within ±5% of Baby Coil Weight** from Stage 2. If within 95%–105% → `✔ OK`. Outside → `⚠ WEIGHT VARIANCE EXCEEDS ±5%` |
| Mother Coil Wt Display | Show mother coil weight for reference |

---

### STAGE 4: BUNDLE FORMATION

**Purpose:** Group tubes into dispatch-ready bundles. **KEY COMPLEXITY: A single bundle can contain tubes from MULTIPLE baby coils.** Leftover tubes from one baby coil carry forward into the next bundle.

**Data Fields:**

| Field | Type | Source | Notes |
|---|---|---|---|
| Date of Entry | Date | Manual | |
| Baby Coil ID | Dropdown | Stage 3 | Source baby coil for these specific tubes |
| SKU Code | Auto-fetched / Dropdown | Stage 3 | Dependent on Baby Coil ID — must match |
| No. of Tube Pieces (in this row) | Number | Manual | How many pieces from THIS baby coil go into THIS bundle |
| No. of Tube Pieces Left (from baby coil) | Auto-calculated | System | Remaining unconverted pieces after this allocation |
| Bundle No. | Number | Manual | Sequential integer: 1, 2, 3… |
| Bundle ID | Auto-generated | Formula | `BND-{Bundle No.}` → e.g., `BND-1`, `BND-14` |
| Remaining Tube Pieces | Auto-calculated | System | What's left after all allocations |
| Weight per Piece (T) | Auto-fetched | Stage 3 | Theoretical weight of one tube piece |
| Total Bundle Weight (T) | Auto-calculated | Formula | `Weight per Piece × No. of Tube Pieces` (summed across all rows for this Bundle ID) |

**Validation Rules (CRITICAL — this is the most error-prone stage):**

| Validation | Logic |
|---|---|
| Baby Coil ID Existence | Must exist in Stage 3 data |
| Duplicate Row Check | No duplicate Bundle ID + Baby Coil ID combination |
| Pieces vs FG Conversion | Total pieces allocated from a baby coil (across ALL bundles) must be **within ±5% of Number of Pieces** produced in Stage 3. Show: `✔ OK` or `⚠ OVER-ALLOCATED` |
| Bundle Integrity | All rows within the same Bundle ID must share the **same SKU Code** (you cannot mix different tube sizes in one bundle) |
| Carry-Forward Logic | If a baby coil has leftover pieces after filling a bundle (e.g., bundle needs 110, coil has 124 → 14 remain), those 14 automatically become the first allocation in the NEXT bundle |

**UI Behavior:** When operator enters a Bundle No. and selects a Baby Coil ID, the system should show available pieces remaining and auto-suggest how many to allocate. Visual grouping of rows by Bundle ID with subtotals.

---

### STAGE 5: DISPATCH

**Purpose:** Record outgoing shipments with vehicle and invoice details.

**Data Fields:**

| Field | Type | Source | Notes |
|---|---|---|---|
| Date of Dispatch | Date | Manual | |
| Vehicle No. | Text | Manual | Registration number |
| Invoice No. | Text | Manual | Sales invoice reference |
| Vehicle Weight (T) | Number | Manual | Gross vehicle weight |
| SKU Code | Auto-fetched | Bundle lookup | |
| Bundle ID | Dropdown | Stage 4 | Only show undispatched bundles |
| No. of Pieces | Auto-fetched | Stage 4 | Total pieces in this bundle |
| Theoretical Weight (T) | Auto-fetched | Stage 4 | Bundle weight |
| Variance (T) | Auto-calculated | Formula | `Vehicle Weight - SUM(Theoretical Weight of all bundles on this vehicle)` |
| Length (mm) | Auto-fetched | SKU | |
| Width (mm) | Auto-fetched | Stage 2 | |
| Thickness (mm) | Auto-fetched | Stage 2 | |

**Validation Rules:**

| Validation | Logic |
|---|---|
| Yield Flag | If variance between vehicle weight and sum of theoretical bundle weights is **within ±5%** → 🟢 GOOD. Outside ±5% → 🔴 HIGH VARIANCE |
| Duplicate Bundle Check | A Bundle ID can only be dispatched ONCE |
| Bundle Status Update | Once dispatched, mark bundle as dispatched in Stage 4 (no re-dispatch) |

---

### MASTER DATA: SKU MASTER

**Purpose:** Reference table of all tube product specifications.

**Fields:** Product Type (SHS/RHS/CHS/ERW), SKU Code (MMID), Material Description, Height, Breadth, Thickness, Length, Nominal Bore, Outside Diameter, HSN Code, Status (published/draft).

**Product Types in scope:** SHS (Square Hollow Section), RHS (Rectangular Hollow Section), CHS (Circular Hollow Section), ERW (Electric Resistance Welded round pipes).

Load the following representative SKU data into the system (the full master has 230+ SKUs):

```
SHS 25x25x2.50x6000, SHS 38x38x2.80x6000, SHS 38x38x2.50x6000, SHS 38x38x2.20x6000,
SHS 50x50x2.80x6000, SHS 50x50x2.50x6000, SHS 50x50x2.20x6000, SHS 20x20x2.00x6000
```

---

### DASHBOARDS (Operational Intelligence)

Build a **Dashboard tab** with the following live views. All metrics are computed in real-time from the stored stage data.

**1. Coil Inventory Status:**
- Total coils in plant, total weight (invoice vs actual)
- Breakdown by stage: Awaiting Slitting → Slitting Complete → Tubes Made → Bundled → Dispatched
- Visual pipeline/funnel chart showing material flow

**2. Yield & Loss Tracking:**
- Per-coil yield: `Dispatched Weight / Actual Inward Weight × 100`
- Plant-wide average yield
- Weight loss analysis: where is material being lost (slitting waste, tube conversion waste, dispatch variance)
- Color-coded: 🟢 >95%, 🟡 90-95%, 🔴 <90%

**3. Production Metrics:**
- Tubes produced today / this week / this month
- Bundles formed vs dispatched
- Top SKUs by volume
- Conversion cycle time (inward date → dispatch date per coil)

**4. Alerts & Warnings Panel:**
- Width validation failures (baby coils exceeding parent)
- Weight over-allocations
- Undispatched bundles older than 7 days
- Coils sitting at a stage for more than configurable threshold

---

### CROSS-CUTTING REQUIREMENTS:

**Data Integrity:**
- Every entity must have a unique, auto-generated ID that cannot be manually overridden
- All cross-stage references must be validated (no orphan records)
- Deletion should be soft-delete with audit trail
- All weight calculations use the **proportionate method** (no density constants) — weight cascades from mother coil actual weight through each stage based on dimensional ratios
- All width and weight validations apply a **±5% tolerance** — values within 95%–105% of expected are ✔ OK; outside this range trigger ⚠ WARNING

**UI/UX Requirements:**
- Color-coded sections: 🔵 Blue = Manual Input fields, 🟢 Green = Auto-calculated, 🟡 Yellow = Validation/Warning
- Frozen headers on all data tables
- Search and filter on every column
- Inline editing with save confirmation
- Responsive — must work on tablet (production floor use)
- Dark mode support

**Data Persistence:**
- Use `window.storage` API (get/set/list/delete) with hierarchical keys:
  - `coils:{HR_Coil_ID}` — Stage 1 records
  - `slits:{Baby_Coil_ID}` — Stage 2 records
  - `tubes:{Baby_Coil_ID}:{SKU}` — Stage 3 records
  - `bundles:{Bundle_ID}` — Stage 4 records
  - `dispatch:{Invoice_No}:{Bundle_ID}` — Stage 5 records
  - `sku-master` — Single key with all SKU data
  - `config` — Plant settings, variance tolerance (default ±5%), alert thresholds

**Seed Data:**
Pre-populate with the following coils for demonstration:
- HYD-0326-01 through HYD-0326-04 (March 2026, widths 1250mm and 1500mm, thicknesses 2.2-2.8mm)
- HYD-0426-05 through HYD-0426-07 (April 2026, widths 930-1264mm, thickness 2.0mm)

---

**OUTPUT SPECIFICATION:**

Deliver a single `.jsx` React artifact with:
1. All 5 stage modules as tabbed views
2. SKU Master management screen
3. Dashboard with charts (use Recharts)
4. Full validation engine
5. Persistent storage via `window.storage`
6. Responsive layout using Tailwind CSS
7. Clean, production-grade UI — industrial/utilitarian aesthetic appropriate for a manufacturing plant

Build this incrementally: start with the data model and storage layer, then Stage 1, then each subsequent stage, ensuring cross-stage references work correctly at each step. The bundle formation stage is the most complex — give it particular attention for the carry-forward logic and multi-coil bundle integrity.

---

## END OF PROMPT

---

## KEY IMPROVEMENTS (Lyra's Analysis)

**What Changed from your original request:**

- **Explicit Data Schema:** Every field across all 5 stages is defined with type, source, and calculation logic — no ambiguity for the AI to guess at
- **Validation Rules as Truth Tables:** Each check is specified with exact logic and expected display output, derived from the actual Excel formulas (e.g., `✔ OK` / `⚠ EXCEEDS PARENT`)
- **ID Generation Formulas:** Extracted the exact format patterns from your Excel (`HYD-MMYY-XX`, `BND-{n}`, `{HR_Coil_ID}-{Letter}`)
- **Bundle Formation Complexity:** Explicitly called out the multi-coil-per-bundle problem with carry-forward logic — this was implicit in your Excel but is the hardest part to implement
- **Cross-Stage Traceability:** Storage key hierarchy ensures every tube is traceable back to its mother coil
- **Dashboard Specs:** Converted your implicit need for visibility into 4 concrete dashboard panels with specific metrics
- **Seed Data:** Included your actual Excel data as demo records so the output is immediately testable
- **SKU Master Integration:** Extracted the product type taxonomy (SHS/RHS/CHS/ERW) and representative SKUs from your 230-row master

**Techniques Applied:** Role assignment, constraint-based specification, chain-of-thought decomposition, few-shot data examples, output format specification, incremental build instruction

**Pro Tip:** This prompt is long by design — Claude handles long-context prompts exceptionally well and produces better results when given exhaustive specifications. When using this prompt, paste it in full. If Claude's response is truncated due to output limits, say "continue from where you stopped" and it will resume. For iterative refinement, reference specific stage numbers (e.g., "Improve Stage 4 bundle carry-forward logic").
