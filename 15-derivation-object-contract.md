# The v1 deviation set

Type: grilling
Status: open
Blocked by: 01, 02, 09

## Question

Which deviations does v1 actually watch?

The research catalogued 16 with owners, cadences, formulas and encoding specs — see [04-deviations-kpis.md](../../pt-os-research/briefs/04-deviations-kpis.md). Three of the five it recommended starting with are now **out of scope**: D11 primary–secondary gap, D12 distributor stock-days, D14 credit-limit breach. So the recommended starting set cannot be adopted as-is.

Decide:

- **Which of the 16 survive** the physical-chain boundary, and which are cut.
- **What replaces the lost diagnostic power.** D11/D12 were the sharpest channel-stuffing detectors. Without secondary-sales data, what signals over-supply into the channel — order pattern shape, return rates, order-then-cancel behaviour, dispatch refusals, ageing of allocated stock? This is the substantive part of the ticket, not a footnote.
- **Per surviving deviation**: exact formula, source fields, grain (SKU vs family, distributor vs region, plant vs mill), threshold with its RAG bands, cadence, and the action it implies.
- **Where thresholds come from** — the research offers industry benchmarks, but 2+ years of own history means thresholds can be calibrated from actual variance. Decide which are set from benchmark and which from own distribution, and say why.
- **The starting count.** Sixteen is too many to launch. Pick the smallest set that covers the real failure modes, and record the rest as deliberately deferred.

**Done when**: the v1 list is fixed with formulas, sources, thresholds and cadences, and the replacement for the lost channel-visibility signals is either designed or explicitly accepted as a blind spot.
