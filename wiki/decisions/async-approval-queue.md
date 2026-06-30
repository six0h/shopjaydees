---
title: Async Approval Queue
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [approval, workflow, design-decision]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Decision: Approval Queue Is Async

The owner reviews a batch of ten to twenty drafts once per day (fifteen to twenty minutes), not in real time. From the key design decisions in the 2026-05-20 design spec.

## Rationale

The pipeline keeps filling while the owner reviews on their own schedule. This fits the engagement's hard constraint of roughly fifteen to twenty minutes of owner bandwidth per day. The health signals flag the design as broken if the owner spends thirty minutes or more per day on reviews.

## Related pages

- [Daily approval workflow](../systems/daily-approval-workflow.md)
- [Engagement goals](../topics/engagement-goals.md)
