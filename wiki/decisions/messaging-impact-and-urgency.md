---
title: Messaging Impact and Urgency Rewrite
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-08-11
updated: 2026-08-11
tags: [messaging, copywriting, urgency, cta, ab-testing, gemini]
---

# Messaging Impact and Urgency Rewrite

**Decision (2026-08-11, Cody):** Ellie's copywriter spec is rewritten for impact and urgency. The "no pressure" voice, the soft call to action, and the friendly-check-in third touch are retired. Urgency is allowed but only from the real calendar (seasonal production lead times), never invented. Two message angles now run as a controlled A/B comparison. All of Jenn's content guardrails stay in force.

## Trigger

July's numbers, per the [July report](../../leadgeneration/reports/2026-07-jaydees-outreach-report.html) and [reply interest classification](reply-interest-classification.md): roughly 134 personalized emails to 77 businesses produced 2 human replies, both declines, a 1.5 percent reply rate against the 5 to 15 percent goal in [engagement goals](../topics/engagement-goals.md). The goals page's own health table says a reply rate below 3 percent means the messaging is not landing.

The spec itself suppressed impact: the tone block said "no pressure", the Gemini schema asked for a "soft CTA" and a "friendly check-in, no pressure" close, the 2026-07-22 guardrails stripped every concrete noun from the copy, and one prompt produced one variant for every lead with no mechanism to learn what works.

## Decisions made

- **Voice.** Warm, direct, confident; Ellie has a genuine reason to reach out this week. Retires "friendly first ... no pressure".
- **Real-calendar urgency only.** Every touch anchors to the coming season and production lead times, made concrete for the prospect. Explicitly banned: invented discounts, deadlines Jaydees did not set, "closing our production window", "spots filling up".
- **Direct CTA.** Every touch ends with exactly one specific question answerable in a line, immediately before Ellie's sign-off. Soft closers are banned and fail validation deterministically (question mark required, soft-closer regex, Ellie sign-off required).
- **Break-up Touch 3.** Day 9 is now "closing the file unless you say otherwise" with an easy out and a final yes-or-no question, replacing the friendly check-in.
- **A/B angles.** Each lead is deterministically assigned `deadline` or `direct-ask` (hash of task id), passed to the prompt, and tagged `angle:<name>` on the ClickUp task. First controlled messaging test of the engagement; read results by crossing `angle:` tags with the reply poller's `interest:` tags.
- **Jenn's guardrails unchanged.** Zero product talk, no prices, no catalog, deterministic seasonality, CASL scan, anti-AI-tells all stay. A separate proposal to relax product talk to segment-level nouns goes to Jenn for a decision; nothing ships without her approval (`leadgeneration/docs/2026-08-11-messaging-proposal-for-jenn.md`).

## What was implemented

- `pipeline/src/index.ts`: `buildPrompt()` rewrite (tone, WHY NOW block, CTA rules, restructured touches, per-angle framing), `assignAngle()`, angle tag on writeback, CTA validators, and a sanitizer fix converting double-escaped newlines from Gemini into real newlines.
- `pipeline/src/clients/gemini.ts`: response schema field descriptions aligned (direct question, timeline escalation, break-up).
- `pipeline/scripts/sample-drafts.ts`: dry-run copy sampler with the pipeline's retry loop, for eyeballing copy changes before a deploy.
- `pipeline/scripts/regenerate-pending.ts`: pushes "Ready for Review" leads back to "Enriched" for regeneration (optional `--include-approved` flag for a human-decided recall of approved copy).
- Test suite extended; 331 tests passing.

## Open items at decision time

- 22 leads sat in Approved with pre-rewrite copy queued for the 9:00am send; left untouched per plan (Jenn's sign-off stands) and flagged to Cody.
- Instantly open tracking still off, so deliverability and copy cannot be separated; raised in the Jenn proposal.
- ~~Deploy of the `personalize` function pending gcloud reauthentication.~~ **Deployed and verified live 2026-08-11 15:15 UTC** (revision ACTIVE; a manual invocation ran the new validators in production). The verification run also surfaced a pre-existing validator strictness: `companyNameMentioned()` rejects natural acronym mentions ("IMS"), parking one lead; tracked in the OS backlog.

## Related pages

- [Outreach messaging framework](../systems/outreach-messaging-framework.md)
- [Ellie, the outreach persona](../people/ellie.md)
- [Personalization content guardrails](personalization-content-guardrails.md)
- [Anti-AI writing guardrails](anti-ai-writing-guardrails.md)
- [Engagement goals](../topics/engagement-goals.md)
- [Reply interest classification](reply-interest-classification.md)
