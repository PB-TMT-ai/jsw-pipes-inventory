# Distributor estimate-reliability score

Type: grilling
Status: closed — out of scope

## Question

How do you tell a trustworthy distributor estimate from a gamed one, using only your own history?

## Resolution: out of scope

Ruled out by the user at charting time (2026-08-01): distributor reliability scoring is not required at this stage.

This is a scoping decision, not a route step. It does not graduate from the fog and does not return unless the destination is redrawn.

**Accepted consequence**: with secondary sales and distributor stock already out of scope, and estimate-reliability scoring now also out, distributor estimates enter the forecast rollup and campaign plan at face value. The system will have no mechanism — neither channel-stock based nor history based — for distinguishing an inflated estimate from real demand. Over-estimation by a distributor will propagate into the production plan unchallenged.

If that blind spot later proves expensive, this ticket is the starting point: the design sketched here needs only the 2+ years of estimate-versus-offtake history already on hand, and requires no distributor cooperation or new data feed.
