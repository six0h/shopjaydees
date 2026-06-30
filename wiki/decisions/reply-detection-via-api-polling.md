---
title: Reply Detection via API Polling (not Webhooks)
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-29
updated: 2026-06-29
tags: [instantly, clickup, reply-handling, automation, deliverability, plan]
sources:
  - file: leadgeneration/docs/superpowers/specs/2026-06-29-instantly-reply-poll-agent-design.md
    created: 2026-06-29
---

# Decision: Reply Detection via API Polling (not Webhooks)

The outreach reply loop — turning an Instantly reply into a flagged warm lead in ClickUp — is implemented as a **scheduled polling agent** that calls the Instantly `GET /emails` API, **not** as a real-time webhook. Decided by Cody on 2026-06-29 while building the agent.

This **realizes** the "reply → ClickUp automation" left pending by [Standalone outreach mailboxes](standalone-outreach-mailboxes.md) (2026-06-22), but by a different mechanism than that page anticipated (it assumed an Instantly webhook → Cloud Function). It also **retires the Zapier bridge** described in the original system design.

## Why polling, not webhooks

The deciding constraint is the client's **Instantly plan**. Jenn is on **Growth**, which is what was presented and sold to her. As of January 2026:

- **Webhooks require Hypergrowth** (~$78–97/mo). Growth cannot receive them, so a push/webhook agent is impossible without an upsell that would breach the lean tool budget (<$100/mo) and change what was sold.
- **Unibox also requires Hypergrowth.** The standalone-mailboxes page assumed Jenn would reply to warm leads from the Instantly Unibox — but she has no Unibox on Growth. Instead she reads and replies directly in the standalone **ellie@shopjaydees.ca / .net Gmail inboxes**; ClickUp is where the warm lead is flagged, assigned, and tracked.
- **API v2 access IS included on Growth.** So polling the API for replies is available; only real-time push is not. The cost is up-to-one-poll-interval latency, acceptable for warm-lead follow-up.

## What the reply-poll agent does

A fifth scheduled Cloud Function (`runReplyPoll` / `ff.http("replyPoll")`), triggered by Cloud Scheduler every ~20 minutes during business hours:

- **Phase A — Instantly events.** Polls `GET /emails` per active campaign over a look-back window, classifies each inbound message (genuine reply, auto-reply, bounce) by checking the sender against our own sending domains, matches the ClickUp task by Contact Email, and applies the update idempotently: a genuine reply sets status **Responded — Owner Follow-up**, assigns Jenn, sets Last Reply Date, and posts the reply snippet as a comment. Auto-replies (out-of-office) are tagged only, never flagged as warm.
- **Phase B — completion sweep (ClickUp only).** Leads stuck in **Outreach Active** past a time threshold (default 14 days, read from an "Outreach Started Date" stamped by the send agent) move to **Dormant** with a +90-day reactivation date — which finally triggers the existing, previously-never-fired dormancy/reactivation agent.

## Scope and accepted limitations

- **Unsubscribes are out of scope.** Instantly handles suppression itself; an opt-out surfaces as a lead-status change, not an email, so it is not reflected in ClickUp.
- **Per-open / per-click counters were dropped** — visible in Instantly's own Growth-tier analytics; the agent tracks only status-changing signals.
- **Two go-live validation items** (the cold mailboxes are still warming, so no live `/emails` traffic exists yet): confirm the raw `/emails` field names the classifier assumes, and fix **bounce** lead-identity mapping — mail-daemon bounces currently resolve to the daemon address and safely fall into "no match" until the real bounce payload is inspected. Replies and auto-replies are the validated core.

## Related pages

- [Standalone outreach mailboxes](standalone-outreach-mailboxes.md)
- [Separate cold outreach domains](separate-cold-outreach-domains.md)
- [Dedicated cold email tool](dedicated-cold-email-tool.md)
- [ClickUp single source of truth](clickup-single-source-of-truth.md)
- [Lead generation system](../systems/lead-generation-system.md)
