# Instantly Reply-Poll Agent — Design

**Date:** 2026-06-29
**Status:** Approved (design); pending implementation plan
**Author:** Cody (SixOhQuad)
**Component:** `pipeline` — fifth scheduled agent

## Motivation

The lead-gen pipeline has four agents (discover, personalize, send, dormancyCheck), all
green and merged to `main`. The send agent pushes approved leads into Instantly and sets
them to **Outreach Active**, but nothing closes the loop: when a prospect **replies**,
**bounces**, **unsubscribes**, or **finishes the sequence with no answer**, the lead's
ClickUp record is never updated. Warm leads are invisible to Jenn, and leads that complete
the sequence never enter the Dormant → reactivation cycle the dormancy agent expects.

The original system design bridged Instantly → ClickUp with Zapier (6 zaps + 2 ClickUp
automations). The 2026-06-22 standalone-mailbox decision proposed replacing the reply path
with a Cloud Function fed by an Instantly webhook.

## Plan constraint (the deciding factor)

Instantly **webhooks require the Hypergrowth plan**; Jenn is on **Growth**, which is what
was presented to her. Growth *does* include API v2 access (as of Jan 2026) and basic
analytics, but **not** webhooks and **not** Unibox.

Consequences:

- A push/webhook agent is not possible without upgrading her plan (~$78–97/mo), which
  would push the tool budget past the <$100/mo target and change what was sold.
- The original "Jenn replies in the Unibox" assumption is also Hypergrowth-only and does
  not hold on Growth.

**Decision:** stay on Growth and detect events by **polling the Instantly API** on a
schedule. Jenn reads and replies to warm leads directly in the standalone `ellie@`
Gmail inboxes (`.ca` / `.net`); ClickUp is where the warm lead is flagged, assigned, and
tracked. This also retires the Zapier dependency entirely.

## Goals

- Detect replies, bounces, unsubscribes, and sequence-completions for leads in active
  outreach, and reflect each in ClickUp.
- Flag warm leads to Jenn fast enough to matter (within one poll interval).
- Move sequence-completed leads into **Dormant** so the existing dormancy/reactivation
  agent can pick them up.
- Add no new infrastructure beyond a Cloud Scheduler trigger; fit the existing
  scheduled-`ff.http`-agent architecture.
- Remove the Zapier bridge.

## Non-goals (YAGNI)

- **Per-open / per-click engagement counters.** Heavy to poll, prone to double-counting
  across overlapping look-back windows, and already visible in Instantly's Growth-tier
  analytics UI. Jenn's workflow only needs reply / bounce / opt-out / went-cold.
- **Manual Unibox label events** (`lead_interested`, meeting events, etc.). Jenn manages
  warm leads in ClickUp and the `ellie@` inboxes, not the Unibox (which she doesn't have).
- **Real-time delivery.** Up-to-one-poll-interval latency is acceptable for warm-lead
  follow-up.
- **A persistent cursor store.** A time-window look-back plus idempotency is sufficient.

## Architecture

A fifth agent, consistent with the existing four:

- Core logic: `runReplyPoll(deps: ReplyPollDeps): Promise<ReplyPollRunResult>` in
  `pipeline/src/index.ts`.
- HTTP entry point: `ff.http("replyPoll", ...)`, mirroring the existing handlers
  (loads config, builds logger/alerter/clickup/instantly, supports a `dry_run` body
  override, returns the run result JSON, alerts Cody + 500 on unhandled error).
- Trigger: **Cloud Scheduler**, every ~20 min during business hours
  (America/Vancouver). Cadence and business-hours windowing live in the scheduler
  config, not in code.

```
Cloud Scheduler (every ~20m, business hours)
        │  POST
        ▼
ff.http("replyPoll")  ──►  runReplyPoll(deps)
        │
        ├─ instantly.listCampaigns()
        ├─ for each campaign: instantly.listEmails(campaignId, { since: lookback })  (paginated)
        ├─ classify each item  → reply | auto-reply | bounce | unsubscribe | sequence-complete | ignore
        ├─ match to ClickUp task by Contact Email
        └─ apply mapping idempotently (updateTask / addComment / addTag / assign)
```

### Look-back window, not a cursor

Each run queries activity from the last `REPLY_POLL_LOOKBACK_MINUTES` (default **90**),
deliberately wider than the ~20-min schedule so a missed/slow run never drops events.
The resulting reprocessing of already-seen items is made safe by idempotency (below),
so no persistent cursor or datastore is required.

### Task matching

Match incoming activity to a ClickUp Prospects task by **Contact Email**, via
`clickup.getTasks(listId, { customFields: [{ field_id: contactEmail, operator: "=", value: leadEmail }] })`.

Rationale: the send agent stores Instantly's `upload_id` (a per-batch id, not a per-lead
id) in the `instantly_lead_id` field, so it is **not** a reliable per-lead key. The
contact email is. No match → log at info and skip (a reply to a lead not in the CRM, or
to a lead created outside the pipeline).

## Event → action mapping

All status changes are guarded against the current ClickUp status so re-seeing an item
in the next look-back window is a no-op.

| Signal | Condition | Action |
|---|---|---|
| **Genuine reply** | current status ∉ {Responded - Owner Follow-up, Won, Lost, Unsubscribed, Bounced} | status → **Responded - Owner Follow-up**; assign Jenn (`ownerUserId`); set **Last Reply Date** = today; add comment with reply subject + snippet. If already Responded: skip (no duplicate comment/flag). |
| **Auto-reply** | always | add tag `auto-reply`; add comment with snippet (once — guard on existing tag). **No status change.** |
| **Bounce** | not already in a closed status | status → **Bounced**; tag `bounced`. |
| **Unsubscribe** | not already in a closed status | status → **Unsubscribed**; tag `unsubscribed`. |
| **Sequence completed, no reply** | current status = **Outreach Active** | status → **Dormant**; set `dormantDate` = today; set `dormantReactivationDate` = today + 90 days; set Sequence Status → `Completed`. |
| Anything else (sent, open, click, manual labels, meetings) | — | ignore (log at debug). |

Notes:

- **Reply wins over completion.** Because the reply branch only fires when status is not
  already terminal/Responded, and the completion branch only fires when status is still
  Outreach Active, a lead that replied will not later be flipped to Dormant by a
  completion signal seen in the same or a later window.
- **Dormant hand-off.** `dormantReactivationDate` (+90d) is exactly the field
  `isDormantEligible()` reads to gate reactivation, so completed leads flow into the
  existing dormancy agent with no change to it.

## Idempotency

The look-back window means most items are seen more than once. Safety comes from:

1. **Status guards** — every status transition checks the current status first; a lead
   already Responded/closed/Dormant is skipped.
2. **Tag guards** — `auto-reply` / `bounced` / `unsubscribed` comments and tags are only
   added if the tag is not already present.
3. **Last Reply Date is a set, not an increment** — re-setting the same date is a no-op;
   there is no reply counter to double-count (counters were dropped, see Non-goals).

## Interfaces and changes

### Instantly client (`src/clients/instantly.ts`)

Add a read method for the polling agent:

```ts
listEmails(
  campaignId: string,
  opts: { since?: string; startingAfter?: string; limit?: number }
): Promise<InstantlyEmailPage>;
```

`InstantlyEmailPage` exposes `items: InstantlyEmail[]` and `nextStartingAfter: string | null`
for pagination. `GET /emails` is rate-limited to 20 req/min; the client already centralizes
requests and can surface 429s the same way the Hunter client does.

### Email classifier

The exact `/emails` payload fields that distinguish **inbound reply** vs **bounce** vs
**auto-reply** vs **sent** are not fully documented and **must be validated against a live
Instantly API key as the first implementation step** (a short spike: pull a real page of
emails for a test campaign and inspect the fields). The classifier is therefore isolated
behind a pure function:

```ts
type EmailSignal =
  | { kind: "reply"; leadEmail: string; subject: string; snippet: string }
  | { kind: "auto_reply"; leadEmail: string; snippet: string }
  | { kind: "bounce"; leadEmail: string }
  | { kind: "unsubscribe"; leadEmail: string }
  | { kind: "ignore" };

function classifyEmail(email: InstantlyEmail): EmailSignal;
```

Keeping classification pure makes it unit-testable from fixtures and confines any
field-name corrections discovered during the spike to one function.

> Sequence-completion is detected per-lead, which may not appear in `/emails`. The spike
> also confirms the source for "lead finished the sequence with no reply" — candidate
> sources are the leads endpoint lead status or `campaigns/search-by-contact`. The design
> treats it as a separate detector (`detectCompletions(campaignId)`) with the same
> pure-function + fixture-test shape; if the live API makes per-lead completion
> impractical on Growth, completion-based Dormant transitions fall back to the existing
> time-based behavior and this branch is deferred (documented, not silently dropped).

### ClickUp client (`src/clients/clickup.ts`)

Add assignee support, needed for the reply hand-off. Either extend `updateTask` to accept
`assignees?: { add?: number[]; rem?: number[] }` (ClickUp's task-update shape) or add a
dedicated `assignTask(taskId, userId)`. Prefer extending `updateTask` so status + assignee
happen in one call.

### Config (`src/config.ts`)

- `ownerUserId: number` ← `CLICKUP_OWNER_USER_ID` (Jenn's ClickUp user id; required).
- `replyPollLookbackMinutes: number` ← `REPLY_POLL_LOOKBACK_MINUTES` (default 90).
- `outreachFields.lastReplyDate` ← `CLICKUP_FIELD_LAST_REPLY_DATE` (required).

### ClickUp workspace

- New custom field on the Prospects list: **Last Reply Date** (Date).
- **Sequence Status** dropdown gains a `Completed` option (it already has `Not Started`).

### `.env.example`

Add `CLICKUP_OWNER_USER_ID`, `REPLY_POLL_LOOKBACK_MINUTES`, `CLICKUP_FIELD_LAST_REPLY_DATE`.
The `INSTANTLY_SENDING_DOMAINS` / `INSTANTLY_API_KEY` entries are reused; no webhook secret.

### Zapier

Retired. The 6 zaps + 2 reply-related ClickUp automations from the original data model are
superseded by this agent. (ClickUp automations unrelated to Instantly events, if any, are
unaffected.)

## Error handling

- **Per-item:** classify/match/apply is wrapped per email so one malformed record or one
  failed ClickUp call is logged and counted, not fatal to the batch.
- **Per-campaign:** a failed `listEmails` page is logged; the run continues to other
  campaigns.
- **Run-level:** an unrecoverable failure (e.g. Instantly API unreachable, auth failure)
  is logged `critical`, alerts Cody via the alerter, and the handler returns 500.
- **Rate limit:** a 429 from `/emails` aborts the current run gracefully (partial work is
  fine — idempotency means the next run re-covers the window) and alerts only if persistent.
- **Dry run:** `config.dryRun` (or a `dry_run` body override) performs all reads and
  classification and logs intended writes without calling `updateTask`/`addComment`/
  `addTag`.

## Result shape

`ReplyPollRunResult` reports, for the run: campaigns polled, emails scanned, and counts of
`repliesFlagged`, `autoRepliesTagged`, `bounced`, `unsubscribed`, `dormant`, `noMatch`,
and `errors` — for logging and for the HTTP response body.

## Testing (TDD)

New `tests/reply-poll.test.ts` + helpers, following the `runSend` test style (mock
clickup/instantly/alerter, `createLogger("test")`):

- `classifyEmail` — one test per signal kind, from fixtures (drives out the spike findings).
- Reply → Responded + assign + Last Reply Date + comment.
- Reply when already Responded → no-op (idempotency: no duplicate comment, no re-assign).
- Auto-reply → tag only, no status change; second pass adds nothing.
- Bounce → Bounced + tag; already-closed → no-op.
- Unsubscribe → Unsubscribed + tag.
- Sequence complete + status Outreach Active → Dormant with dormantDate +
  dormantReactivationDate(+90d); complete when already Responded → no-op.
- No matching ClickUp task → skipped, counted in `noMatch`.
- Look-back re-run over the same window → zero net changes.
- Dry run → no write calls.
- Run-level Instantly failure → alerter called, surfaced as run error.

## Open validation item (carried into the plan)

The single piece of real uncertainty is the `/emails` payload shape and the per-lead
completion source. The implementation plan's first task is a live-API spike to capture
real fixtures and finalize `classifyEmail` / `detectCompletions`; everything downstream is
mechanical given those fixtures.
