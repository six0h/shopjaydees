---
title: Dedicated Cold Email Tool
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [email, deliverability, design-decision]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Decision: Dedicated Cold Email Tool for Sending

Cold email goes out through Instantly or Smartlead, not through ClickUp. From the key design decisions in the 2026-05-20 design spec.

## Rationale

ClickUp's email features are built for marketing, not cold outreach deliverability. A dedicated tool handles warmup, rotation, and deliverability at low cost (30 to 50 US dollars per month).

## Related pages

- [Separate cold outreach domains](separate-cold-outreach-domains.md)
- [Third-party stack](../topics/third-party-stack.md)
- [Lead generation system](../systems/lead-generation-system.md)
