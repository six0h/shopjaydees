---
title: Personalization Content Guardrails — Products, Seasonality, Retry
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-22
updated: 2026-07-22
tags: [personalization, guardrails, seasonality, copywriting, gemini]
---

# Personalization Content Guardrails — Products, Seasonality, Retry

**Decision (2026-07-22, client feedback from Jenn + Cody direction):** Ellie must stay inside hard content guardrails — she may only offer generic branded apparel and a quote, must talk about the correct upcoming season for the date, and must never ship a draft that breaks these rules. Enforced deterministically in code, not left to model compliance, mirroring the [anti-AI-writing guardrails](anti-ai-writing-guardrails.md) pattern.

## Trigger

Jenn flagged two live failures in the drafts reaching her review queue:

1. **Invented products.** Ellie offered to show prospects specific products that don't exist. The prompt had been handing the model a product list ("uniforms, spirit wear, team gear, corporate swag") and telling it to offer "a mockup of their logo on a product", which invited invention. The only hard guard was a `catalog`/`catalogue` regex.
2. **Wrong season.** Ellie asked a prospect if they were ready for "the upcoming spring season" in July. Root cause: the prompt never received the current date, so the model guessed the time of year from training data.

## Decisions made

- **Zero product talk.** Prospect-facing copy may say "custom apparel" / "branded apparel" only — never a named garment, style, fabric, colour, or price. (Jenn's call; she chose the strictest of the options offered.)
- **The offer is a no-obligation quote**, replacing the free-mockup CTA. Ellie never states or estimates a price herself.
- **Seasonality is deterministic and BC-grounded.** The calendar is computed from the date in code, following the [seasonal playbook](../topics/seasonal-playbook.md), which was revised the same day to BC Lower Mainland buying occasions plus custom-apparel lead time. Each period sells the season that is *coming*; the one substantive shift is that September now sells year-end/holiday, not back-to-school, because Sept-start apparel must be ordered by mid-August to produce in time.
- **Schools are out of scope.** Jenn runs school outreach herself, so the seasonal segment focus is businesses / teams / trades only. (This is a segment-focus change, not yet a hard discovery exclusion — see below.)

## What was implemented

Prompt guidance plus deterministic enforcement, so the guarantee holds even when the model ignores the instruction:

1. **Prompt** — the product vocabulary was removed; the offer is now a quote; a computed seasonal-timing block injects the current selling period, theme, and selling season, and names the forbidden seasons. Segment focus is deliberately *not* injected (the lead already carries its own segment).
2. **Validators** (`validateDrafts` + a separate `findForbiddenSeasonMentions`) hard-fail any prospect-facing field that names a product/garment (a denylist of ~30 nouns, extended as Jenn flags new ones — like the catalog guard), states a price (currency-anchored, so the "12 to 250+ employees" social proof does not false-positive), or uses a forbidden-season word. A failure forces a regenerate.
3. **Capped retry** — a validation failure now retries generation up to 3 times per run in-process (reusing the scrape, feeding the errors back), then parks the lead after 2 failed runs with an ntfy alert. This retroactively fixes a silent infinite Enriched↔Personalizing bounce that had existed for validation failures.

Committed to the lead-gen pipeline and the `personalize` Cloud Function was redeployed. Affects newly personalized leads; drafts written before this change are unaffected. Spec and plan: `leadgeneration/docs/superpowers/specs/2026-07-22-personalization-guardrails-design.md` and the sibling plan.

## Follow-ups

- **Hard-error cap — RESOLVED 2026-07-22.** The retry cap originally covered validation failures only; a persistent hard Gemini error (SAFETY / parse / transport) still bounced Enriched↔Personalizing uncapped. Now both failure paths share one `recordPersonalizationFailure` disposition, so a hard error also escalates the cross-run attempt tag and parks the lead (`personalize-failed` + alert) after two failed runs. Hard errors do not retry in-run (re-running the same prompt reproduces a SAFETY/parse failure); transient transport errors self-heal across runs and only persistent ones park.
- **Schools at discovery — open.** Schools are dropped from the seasonal segment focus but not hard-excluded at discovery. If school leads start appearing in the queue, that's a separate targeting change.

## Runtime

Cloud Functions run on **nodejs22** as of 2026-07-22 (bumped from the GCP-deprecated nodejs20; `@types/node` and the `engines` floor moved to 22 to match). All five functions redeployed.

## Related pages

- [Anti-AI-writing guardrails](anti-ai-writing-guardrails.md)
- [Seasonal playbook](../topics/seasonal-playbook.md)
- [Outreach messaging framework](../systems/outreach-messaging-framework.md)
- [Gemini Flash for personalization](gemini-flash-for-personalization.md)
- [Lead generation system](../systems/lead-generation-system.md)
