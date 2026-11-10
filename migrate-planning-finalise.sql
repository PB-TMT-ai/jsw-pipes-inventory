-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Finalise a region's month: Baseline and change log (ticket #283)
-- ═══════════════════════════════════════════════════════════════
-- WHY: the Production Planning tab's monthly campaign now has a Finalise button. Finalise keeps the
-- figures as the Baseline, and every later change to Planned or Plant is logged with a reason. All
-- of it lives on the existing `planning_campaigns` row, in four new columns. Without them the
-- Finalise write is rejected (the sync-error banner shows and the sheet re-reads as Draft); every
-- other campaign edit keeps working, because only Finalise writes these keys.
--
-- Additive only: four new nullable / defaulted columns. Nothing existing is read, changed or
-- deleted. Run AFTER migrate-planning-campaigns.sql (the table must exist). Safe to re-run.
--
-- This file is the block from supabase-setup.sql, extracted verbatim so the two cannot drift, plus
-- one closing `notify pgrst` line.

-- ── PLANNING CAMPAIGNS: Finalise, Baseline and the change log (ticket #283, decision #255) ──────
-- Four columns on the same row, written ONLY by Finalise — a campaign never finalised carries none
-- of them, so it saves exactly as before.
--   finalised_at  when the region's month was finalised. Set once, never cleared: no Un-finalise.
--   finalised_by  the login that pressed Finalise.
--   baseline      { "South|50x50|1.6": { planned, suggested, indent, plant, split } } — the figures
--                 at Finalise, never written again. A row absent from it had Planned 0, no Indent.
--   changes       append-only array: { id, at, by, rowKey, field: 'planned'|'plant', from, to,
--                 reason } — every change to Planned or Plant after Finalise, with its reason.
alter table planning_campaigns add column if not exists finalised_at timestamptz;
alter table planning_campaigns add column if not exists finalised_by text;
alter table planning_campaigns add column if not exists baseline jsonb;
alter table planning_campaigns add column if not exists changes jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
