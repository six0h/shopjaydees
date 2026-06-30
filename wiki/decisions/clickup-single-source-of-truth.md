---
title: ClickUp Single Source of Truth
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [clickup, architecture, design-decision]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Decision: ClickUp Is the Single Source of Truth

Every lead lives in ClickUp with its status, score, enrichment data, and outreach history. No separate databases. From the key design decisions in the 2026-05-20 design spec.

## Rationale

One record system keeps the owner's daily review, the agents' state transitions, and reporting in the same place. The client already planned to use ClickUp, so it adds no new tool cost.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
