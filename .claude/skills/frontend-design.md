# Frontend Design Skill

## Typography
- Font: Inter (Google Fonts CDN, loaded in index.html)
- Sizes: text-sm (14px) body, text-base (16px) emphasis, text-lg/text-xl headings
- Line height: 1.5 body, 1.2 headings
- font-medium (500) for emphasis, font-semibold (600) for section headers

## Color System
- **Primary:** indigo-600 (buttons, active tabs, accents)
- **Grays:** slate-50 through slate-900 (backgrounds, text, borders)
- **Success:** emerald-600 / green-100 (valid states, dispatched badges)
- **Danger:** red-600 / red-100 (errors, warnings, delete buttons)
- **Warning:** yellow-50 / yellow-200 (validation warning fields)
- Hover: darken 10% same hue (e.g., indigo-600 → indigo-700)
- NEVER use #0000ff blue or #800080 purple or pure black (#000)

## Field Color Coding (defined in src/index.css)
- `.field-manual` — bg-blue-50 border-blue-200 (manual input, `○` prefix label)
- `.field-auto` — bg-green-50 border-green-200 (auto-calculated, `●` prefix, disabled)
- `.field-warning` — bg-yellow-50 border-yellow-200 (validation display)
- Dark mode variants use -950 and -800 shades

## Spacing
- Scale: 4, 8, 12, 16, 24, 32, 48, 64
- Cards/Sections: p-6
- Between sections: space-y-6
- Form grid gaps: gap-4
- No arbitrary values (p-7, gap-5)

## Layout
- Max width: max-w-7xl (1280px) centered
- Forms: grid grid-cols-2 md:grid-cols-4
- Cards: shadow-sm, border border-slate-200, rounded-lg
- Buttons: rounded-md, font-medium, transition-colors
- Tables: sticky headers, overflow-x-auto, divide-y for rows

## Reusable Components (defined in App.jsx)
| Component | Props | Purpose |
|-----------|-------|---------|
| `Field` | label, auto, warn, children | Form field wrapper with color-coded label |
| `Input` | value, onChange, type, disabled | Styled input with field-manual/field-auto |
| `Select` | value, onChange, options, placeholder | Styled dropdown |
| `Btn` | variant, size, onClick, disabled | primary/success/danger/ghost button |
| `Badge` | ok, text | Green ✔ / Red ⚠ tolerance indicator |
| `YieldBadge` | pct | Color-coded yield percentage |
| `Card` | title, value, sub, color | Dashboard KPI card |
| `Section` | title, children, actions | Bordered content section |
| `DataTable` | columns, data, onEdit, onDelete | Searchable, sortable table |
| `SearchInput` | value, onChange | Search bar for tables |

## Dark Mode
- Toggled via `dark` class on `<html>` (Tailwind class strategy)
- All components use `dark:` variants
- Persisted to `jsw:dark` in localStorage

## Don'ts
- No gradients unless requested
- No animations on everything (only transition-colors on buttons)
- No pure black — use slate-900
- No low-contrast text
- No arbitrary Tailwind values
