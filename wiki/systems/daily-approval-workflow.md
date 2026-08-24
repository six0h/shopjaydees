---
title: Daily Approval Workflow
type: wiki-page
category: system
status: active
owner: cody
created: 2026-06-11
updated: 2026-08-24
tags: [clickup, approval, client-operations]
sources:
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/lead-gen-pitch.html
    ingested: 2026-06-11
  - file: ingested/documents/messaging-framework.html
    ingested: 2026-06-11
---

# Daily Approval Workflow

Formerly the human-in-the-loop step in the [lead generation system](lead-generation-system.md). As of 2026-08-24 Jenn has **graduated past the manual approval gate**: personalized leads now land directly in **Approved** and the send stage picks them up on the next run. The pipeline no longer parks drafts in "Ready for Review" — cold email outreach goes out without a per-lead human sign-off.

## Current state (2026-08-24 onward)

- The pipeline's `personalize` stage writes drafts to ClickUp and sets the prospect to **Approved** (previously "Ready for Review"). See the code change in `pipeline/src/index.ts` (personalize writeback).
- The send stage sends every Approved lead (top-scored first, subject to `sendBatchSize` batching). No manual approval step remains between drafting and sending.
- Warm-lead handling is unchanged: when a prospect replies, the [reply-poll agent](lead-generation-system.md) flags the lead (Responded - Owner Follow-up, assigned to Jenn). Jenn reviews flagged warm leads, responds from the standalone ellie@ Gmail inbox (the Instantly Growth plan has no unified inbox), and transitions established conversations to the primary business email.
- LinkedIn outreach stays manual on purpose to keep it human; Jenn still copies the pre-written note into LinkedIn per warm/target lead.
- Jenn can still spot-check or edit drafts in ClickUp before a send run, but it is no longer a required daily gate.

> **Contract note:** the original service agreement framed daily review/approval as a contractual client responsibility, and the pitch targeted an 80%+ approval rate. Removing the gate changes that arrangement — confirm this is reflected in the client relationship. See [Jenn Milne](../people/jenn-milne.md).

## History — the daily routine while the gate was active (per the pitch)

Each morning a batch of ten to twenty drafted messages waited in ClickUp. The routine had four steps:

1. Open the "Ready for Review" queue. Each card carried the prospect info and draft messages.
2. Approve as-is, tweak wording, reject, or flag "I know this person".
3. Send LinkedIn messages by copying the pre-written note into LinkedIn, about thirty seconds each.
4. Check the "Responded" status for warm leads and continue those conversations.

The pitch targeted an approval rate of 80 percent or higher, meaning most drafts should be sendable without edits — which is the track record that made graduating past the gate reasonable.

Per the messaging framework: flagging "I know this person" switches the lead to a warm intro instead of cold outreach, and the client's approve, edit, and reject feedback tunes the AI to match their voice over time. LinkedIn requests stay manual on purpose to keep them human.

## Related pages

- [Jenn Milne](../people/jenn-milne.md)
- [Lead generation system](lead-generation-system.md)
