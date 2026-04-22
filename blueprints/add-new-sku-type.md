# Blueprint: Add SKUs to the SKU Master

## Goal
Add one or more product SKUs (e.g., SHS, RHS, CHS, ERW specifications) to the SKU Master so they are selectable in Stage 3 (Slit to Tube) and used in cost calculations.

There is **no hard-coded SKU seed** in the codebase — the SKU Master starts empty on a fresh install and the user populates it via the app UI (primary) or a direct Supabase insert (bulk).

## Inputs Required (per SKU)
| Field | Type | Notes |
|---|---|---|
| `productType` | string | SHS / RHS / CHS / ERW |
| `skuCode` | string | Unique — this is the display code |
| `description` | string | Human-readable spec line |
| `height`, `breadth`, `thickness`, `length` | number (mm) | Length defaults to 6000 |
| `nominalBore`, `outsideDiameter` | string | Populate for CHS; leave blank for SHS/RHS |
| `hsnCode` | string | e.g., `7306` / `72080000` |
| `weightPerTube` | number (kg) | Computed per geometry/thickness |
| `baseConversion` | number (₹/MT) | Usually 2900 |
| `thicknessExtra` | number (₹/MT) | Thickness premium |
| `ladderPrice` | number | `baseConversion + thicknessExtra` |
| `totalConversion` | number | `weightPerTube × ladderPrice / 1000` |
| `status` | string | `published` or `draft` |

## Path A — add one SKU via the app UI (default)

1. Open the app → **SKU Master** tab
2. Click **+ Add SKU**
3. Fill the fields above; `skuCode` must be unique
4. **Save** — the row writes straight to Supabase (`skus` table) and appears in Stage 3's dropdown immediately

## Path B — bulk-insert SKUs via Supabase SQL

For importing a catalog, skip the UI and use the Supabase SQL editor:

```sql
insert into skus
  (id, product_type, sku_code, description,
   height, breadth, thickness, length,
   nominal_bore, outside_diameter, hsn_code, status,
   weight_per_tube, base_conversion, thickness_extra, ladder_price, total_conversion)
values
  ('SKU-001', 'SHS', 'SHS-25x25x2.50',
   'MS SHS One Helix IS 4923 YSt 210 Black 25x25x2.50x6000',
   25, 25, 2.5, 6000,
   '', '', '7306', 'published',
   10.5975, 2900, 0, 2900, 30.73275),
  -- …more rows…
on conflict (id) do nothing;
```

Columns follow the `skus` table schema in `supabase-setup.sql:95-114`. `id` must be unique (the app reads this as the React key); use any stable string like `SKU-001`.

## Edge Cases
- **CHS / circular tubes** — populate `nominal_bore` and `outside_diameter` instead of `height`/`breadth`. Update the `description` to match the circular format.
- **ERW** — uses nominal bore; ensure the UI renders the right fields for the product type before saving.
- **Pagination** — if you go beyond ~50 SKUs, consider adding pagination to the DataTable (not currently needed).
- **Reset Data button** — preserves both SKU Master and PO Master. Pipeline stages are cleared; master data is not.

## Verification
1. After inserting, open **SKU Master** tab → new SKUs appear in the table.
2. Open **Stage 3: Slit to Tube** → SKU dropdown lists the new codes.
3. Create a tube with one of them → the weight calculation uses `weightPerTube` from the SKU.
