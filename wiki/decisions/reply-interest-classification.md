---
title: Reply Interest Classification
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-08-04
updated: 2026-08-04
tags: [reply-poll, reporting, classification, agents]
---

# Reply Interest Classification

**Decision (2026-08-04):** the reply-poll agent classifies the sentiment of every genuine reply and drives the ClickUp status and the monthly report from that classification, so a decline is never recorded or reported as a warm, interested lead.

## Trigger

The monthly report counted any reply as a warm handoff (`report.ts` `warmHandoffs` = prospects with a `Last Reply Date` in the month; `reply-poll.ts` set every genuine reply to `Responded - Follow-up`). In July both replies the report would have shown as warm had actually declined. See the broader principle in the OS decision log: `company/decisions/2026-08-04-reply-sentiment-classified-in-pipeline.md`.

## What was implemented

In `leadgeneration/pipeline/`:

1. **Classifier** (`src/clients/gemini.ts`) — `classifyReplyInterest({subject, snippet})` returns one of `interested | not_interested | wrong_person | out_of_office | neutral`. `gemini-3.5-flash`, temperature 0. The internal Gemini call was generalized to be schema-parameterized; the existing draft-generation path is unchanged.
2. **Routing** (`src/reply-poll.ts`) — each genuine reply is classified, then:
   - `interested` / `neutral` → `Responded - Follow-up`, assigned to the owner (a real warm handoff).
   - `not_interested` / `wrong_person` → `Lost` (reply date still stamped, not counted as warm). Reuses the existing status, so no change to the client's ClickUp workspace.
   - classifier-detected `out_of_office` → tagged `auto-reply`, not flagged (a catch for OOO the subject-line regex misses).
   - **classifier error → fails safe to `Responded - Follow-up`**, so a real reply is never silently dropped.
   - Every reply also gets an `interest:<label>` tag; a `repliesDeclined` run counter was added.
3. **Report** (`src/report.ts`) — `warmHandoffs` now counts interested-only; adds `replyBreakdown` (interested / not_interested / wrong_person / out_of_office / neutral / unknown) and `repliesThisMonth`, read from the `interest:` tags.

Built test-first (full suite 315 tests green). Committed `bae6069`; the `replyPoll` Cloud Function was redeployed (revision `replypoll-00011-xof`). Affects replies from the deploy onward; July's replies predate it and carry no interest tag.

## Deliberately NOT changed (flagged)

- **No write-back to Instantly.** We do not push our label to Instantly's `interest_status`. Instantly's own auto-labelling was adequate on the genuine July declines, ClickUp is the source of truth, and per-reply writes to the client's Instantly add cost and risk for no reporting benefit. The endpoint exists if ever needed: `POST /api/v2/leads/update-interest-status`.
- **Only `replyPoll` was redeployed.** `personalize` shares the refactored `gemini.ts` but its behaviour is unchanged.

## July 2026 finding

Reclassifying July (read-only) found only **2 genuine replies** (thepowergrp, surreylacrosse), both `not_interested` and already correctly at Instantly −1. The other 3 flagged leads were **out-of-office autoresponders**, not real replies — which is why the campaign analytics `reply_count` (2) differed from the lead-level reply flags (5). No Instantly relabel was needed.

## Related pages

- [Reply detection via API polling](reply-detection-via-api-polling.md)
- [Transition to maintenance & reporting phase](maintenance-and-reporting-phase.md)
- [Anti-AI-writing guardrails](anti-ai-writing-guardrails.md)
- [Gemini Flash for personalization](gemini-flash-for-personalization.md)
- [Lead generation system](../systems/lead-generation-system.md)
