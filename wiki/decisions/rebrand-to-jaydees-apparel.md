---
title: Rebrand — Agent Communicates as "Jaydees Apparel"
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-16
updated: 2026-07-16
tags: [rebrand, naming, outreach, personalization]
---

# Rebrand — Agent Communicates as "Jaydees Apparel"

**Decision (2026-07-16, client request):** the outreach agent communicates the business name as **"Jaydees Apparel"** (the legal name), not "ShopJaydees" (the former brand name). The client has undergone a name change.

## What changed

- The personalization prompt (`buildPrompt`, `leadgeneration/pipeline/src/index.ts`) now writes cold outreach for "Jaydees Apparel" in all three prospect-facing references (the intro line, the Wear It Forward mention, and the "Ellie is the … outreach persona" instruction). The `personalize` Cloud Function was redeployed so all future drafts use the new name. TDD (`buildPrompt` test asserts the prompt contains "Jaydees Apparel" and no longer "ShopJaydees").
- The sender persona is unchanged: emails are still signed "Ellie."

## Deliberately NOT changed (flagged)

- **Sending domains / mailboxes** — still `shopjaydees.ca` / `.net` (and website `shopjaydees.com`). The request was a name change, not a domain change; moving domains is a separate infrastructure change (new mailboxes + fresh warmup). Emails will read "Jaydees Apparel" but send from and reference the `shopjaydees` domains until/unless the client moves domains.
- **Instantly campaign-name prefix** (`CAMPAIGN_BUSINESS_NAME`, currently "ShopJaydees") — this is internal troubleshooting metadata, not prospect communication. Left as-is because changing it mid-month would orphan the existing `ShopJaydees - Business - 2026-07` campaign from the [monthly report](maintenance-and-reporting-phase.md)'s name matcher. Recommend switching it at the next month boundary.
- **Ops-alert email subject** (`[ShopJaydees Pipeline]`) — internal alert to Cody, not client-facing.

## Consequences

- All **future** drafts communicate as "Jaydees Apparel."
- Already-sent copy (Monark, Blue Pine on 2026-07-15) said "ShopJaydees" — unchangeable.
- The **4 pending Youth Sports drafts** (Ready for Review) were generated before this change and still say "ShopJaydees." Regenerate them (reset to Enriched → re-run personalize) if you want them on-brand before Jenn approves.
- Revisit the domain and campaign-name items above when the client confirms whether the domains are also moving.

## Related pages

- [Overview](../overview.md)
- [Lead generation system](../systems/lead-generation-system.md)
- [Anti-AI-writing guardrails](anti-ai-writing-guardrails.md)
