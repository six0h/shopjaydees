---
title: Per-Ticket Company Size Targeting
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-08-04
updated: 2026-08-04
tags: [hunter-io, discovery, clickup, scoring, targeting, design-decision]
sources:
  - file: leadgeneration/docs/2026-08-04-per-ticket-company-size-targeting.md
    ingested: 2026-08-04
---

# Decision: Per-Ticket Company Size Targeting

Jenn asked to prospect smaller companies than the pipeline had been finding, on the belief that smaller businesses are an easier entry for Jaydees Apparel. Rather than change the global default, each Prospecting Request now carries an optional **Company Size** band that Jenn sets when she wants to go small.

## What changed (shipped 2026-08-04)

- A new optional `Company Size` dropdown on the Prospecting Requests list (`901417162428`, field id `d7ec49bd-0cd3-48df-ae1b-14cc0e7f32e0`), with three bands mapped to Hunter Discover headcount ranges:
  - `Micro (1-10)` → `1-10`
  - `Small (11-50)` → `11-50`
  - `1-50 (small+micro)` → `1-10, 11-50`
- Blank leaves today's behaviour unchanged: the default band `1-10, 11-50, 51-200`.
- When a small band is chosen, the discovery agent uses it as the Discover headcount filter for that request only, and lead scoring drops its size bias for that request (no `+1` for larger firms, no `-1` for small ones) so intentionally-small leads are not parked for being small. See [Lead scoring](../systems/lead-scoring.md).

## Rationale

The field is read by name and is fully additive, so existing tickets and the running pipeline are untouched until Jenn opts in. The three offered bands are all small on purpose; larger bands were left out because the request was specifically to reach smaller businesses.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Hunter.io for discovery and enrichment](hunter-io-for-discovery-and-enrichment.md)
- [Lead scoring](../systems/lead-scoring.md)
- [Target market](../topics/target-market.md)
