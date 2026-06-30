---
title: Hunter.io for Discovery and Enrichment
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [hunter-io, discovery, enrichment, design-decision]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Decision: Hunter.io for Discovery and Enrichment

Per the 2026-05-20 design spec, Hunter.io's Discover API handles both prospect finding (by industry, geography, and company size) and contact enrichment (verified decision-maker emails) in a single tool. It is accessed entirely through the Discovery Agent; Jenn never uses Hunter.io directly.

## Rationale

Combining discovery and enrichment in one tool eliminates the need for separate discovery and enrichment services. Estimated at $34 per month on the Starter plan, which fits the under-$100-per-month pipeline budget.

## Conflict with other documents

This decision is contradicted in both directions by other engagement documents:

- The service agreement, pitch, and implementation roadmap describe discovery as Google Maps scraping via Firecrawl, with Hunter.io only doing email discovery.
- The account setup guide replaces Hunter.io entirely with client-driven LinkedIn Sales Navigator searches enriched through cleanlists.ai.

Three discovery approaches exist across the documents and none of the sources are reliably ordered. Confirm the current approach with Cody. See [Third-party stack](../topics/third-party-stack.md).

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Lead scoring](../systems/lead-scoring.md)
- [Third-party stack](../topics/third-party-stack.md)
