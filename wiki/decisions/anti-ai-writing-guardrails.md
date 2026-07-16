---
title: Anti-AI-Writing Guardrails
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-15
updated: 2026-07-15
tags: [personalization, copywriting, quality, gemini]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
---

# Anti-AI-Writing Guardrails

**Decision (2026-07-15):** the personalization agent must produce copy that reads as human-written, not AI-generated. The recipient should think the email is simply from Ellie, the outreach persona, not from a machine.

## Trigger

An em-dash slipped into the live-sent Blue Pine draft. Jenn dislikes em-dashes and, more broadly, wants the writing to avoid the tells that mark text as AI-written. Cody's direction: "We should be following human grammar patterns as much as possible. Not using em dashes… include any other giveaways that we know indicate AI writing."

## What was implemented

Two layers, so the guarantee holds even when the model ignores the instruction:

1. **Prompt guidance** in the copywriter prompt ("WRITE LIKE A HUMAN — AVOID AI TELLS"): no em/en dashes, use contractions, vary sentence length, no rule-of-three triplets or "not just X, it's Y" templates, a banned LLM-vocabulary list (elevate, leverage, seamless, delve, tapestry, etc.), no formulaic transitions, no company puffery, no semicolons or bullets in bodies, straight quotes only.
2. **Deterministic guard** (`sanitizeDrafts`) applied to every prospect-facing field before validation and writeback: em/en dashes become commas (numeric ranges become hyphens), curly quotes and ellipses are straightened. This guarantees no em-dashes reach a draft regardless of model compliance; ordinary hyphens are left alone.

Both are committed to the lead-gen pipeline and the `personalize` Cloud Function was redeployed to apply them. They affect newly personalized leads; drafts written before this change are unaffected.

## Related pages

- [Gemini Flash for personalization](gemini-flash-for-personalization.md)
- [Outreach messaging framework](../systems/outreach-messaging-framework.md)
- [Lead generation system](../systems/lead-generation-system.md)
