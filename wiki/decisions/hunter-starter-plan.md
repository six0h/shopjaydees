---
title: Hunter.io Starter Plan (over Growth)
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-15
updated: 2026-07-15
tags: [hunter-io, tooling, cost, discovery]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
---

# Hunter.io Starter Plan (over Growth)

**Decision (2026-07-15):** the client subscribes to Hunter.io's **Starter** plan, not Growth. Jenn upgraded from the free tier and paid a **full year** during the walkthrough call.

## Rationale

- The free plan (50 credits) is insufficient for real discovery volume.
- Starter provides ~24,000 credits/year — roughly 12,000 email+phone lookups (~2 credits each) — which is ample; Jenn is not expected to have the capacity to work through anywhere near 12,000 leads in a year.
- Growth's ~120,000 credits/year (~60,000 lookups) would be overkill for this engagement.
- Starter still includes the API access the Discovery Agent depends on.

## Cost reference

- Free: 50 credits.
- Starter: the $0–49/month tier, ~24,000 credits/yr — **purchased, annual.**
- Growth: ~120,000 credits/yr — considered and rejected as excess.
- Lookup costs: email+phone ≈ 2 credits; verify-email endpoint ≈ 0.5 credit (deferred; see [lead generation system](../systems/lead-generation-system.md)).

Supersedes the earlier design-spec assumption of a Hunter.io Starter plan at ~$34/month as an estimate; this is the confirmed live purchase.

## Related pages

- [Third-party stack](../topics/third-party-stack.md)
- [Hunter.io for discovery and enrichment](hunter-io-for-discovery-and-enrichment.md)
- [Lead generation system](../systems/lead-generation-system.md)
