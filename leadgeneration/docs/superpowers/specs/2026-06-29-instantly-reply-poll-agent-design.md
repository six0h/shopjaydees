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

- Detect replies (and auto-replies), bounces, and sequence-completions for leads in active
  outreach, and reflect each in ClickUp. (Unsubscribes are out of scope — see the mapping note.)
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
        ├─ Phase A — email events (Instantly API):
        │     ├─ instantly.listCampaigns()
        │     ├─ for each campaign: instantly.listEmails(campaignId, { since: lookback })  (paginated)
        │     ├─ normalizeEmail(raw) → classifyEmail(n) → reply | auto-reply | bounce | ignore
        │     ├─ match to ClickUp task by Contact Email
        │     └─ apply mapping idempotently (updateTask / addComment / addTag / assign)
        │
        └─ Phase B — completion sweep (ClickUp only, no Instantly call):
              ├─ clickup.getTasks(list, { statuses: ["Outreach Active"] })
              ├─ for each: outreachStartedDate older than SEQUENCE_COMPLETE_AFTER_DAYS?
              └─ if so → Dormant + dormantDate + dormantReactivationDate(+90d)
```

Phase B is deliberately **not** driven by the Instantly API: per-lead "sequence finished"
is poorly exposed on Growth, and a time-based sweep is deterministic, fully unit-testable,
and needs no external call. The 3-touch sequence spans 9 days (day 0 / 4 / 9), so a default
threshold of **14 days** safely means "sequence done, no reply." This phase is what finally
makes the existing — but currently never-triggered — dormancy/reactivation agent fire in
production.

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
| **Bounce** | not already in a closed status | status → **Bounced**; tag `bounced`. *(Detection is implemented but currently lands in `noMatch` for mail-daemon bounces — lead identity unresolved until live-payload validation; see Go-live.)* |
| Anything else (sent, open, click, **unsubscribe**, manual labels, meetings) | — | ignore (log at debug). |

> **Unsubscribe is out of scope** for this agent: Instantly handles suppression itself, and unsubscribe surfaces as a lead-status change rather than an email in `/emails`, so it is not detected here.

Sequence completion is handled by the **Phase B time-based sweep**, not the email classifier:

| Sweep condition | Action |
|---|---|
| status = **Outreach Active** AND `outreachStartedDate` older than `SEQUENCE_COMPLETE_AFTER_DAYS` (default 14) | status → **Dormant**; set `dormantDate` = today; set `dormantReactivationDate` = today + 90 days. (The **Dormant** status itself conveys completion; no separate Sequence Status write — that would be redundant.) |

Notes:

- **Reply wins over completion.** Phase A runs before Phase B, and the sweep only touches
  leads still in **Outreach Active** — so a lead flagged **Responded** (or closed) in
  Phase A is never swept to Dormant.
- **Dormant hand-off.** `dormantReactivationDate` (+90d) is exactly the field
  `isDormantEligible()` reads to gate reactivation, so swept leads flow into the existing
  dormancy agent with no change to it. This sweep is the trigger that agent has been
  missing — today nothing moves a lead into Dormant, so reactivation never runs.

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

### Email normalizer + classifier (two functions)

The only real unknown is the raw `/emails` payload shape — the exact fields that mark an
item as inbound reply vs bounce vs auto-reply vs sent are not fully documented. That
uncertainty is quarantined in a single **adapter** so it can't leak into the rest of the
agent:

```ts
// Raw shape is unknown until the spike → typed loosely, only the adapter touches it.
type InstantlyRawEmail = Record<string, unknown>;

interface NormalizedEmail {
  leadEmail: string;
  direction: "inbound" | "outbound";
  isAutoReply: boolean;
  isBounce: boolean;
  isUnsubscribe: boolean;
  subject: string;
  snippet: string;
}

function normalizeEmail(raw: InstantlyRawEmail): NormalizedEmail; // finalized by the spike
```

The classifier then works only on the stable `NormalizedEmail` shape and is fully
testable today, independent of the live API:

```ts
type EmailSignal =
  | { kind: "reply"; leadEmail: string; subject: string; snippet: string }
  | { kind: "auto_reply"; leadEmail: string; snippet: string }
  | { kind: "bounce"; leadEmail: string }
  | { kind: "unsubscribe"; leadEmail: string }
  | { kind: "ignore" };

function classifyEmail(n: NormalizedEmail): EmailSignal;
```

The spike (first implementation task) captures a real page of `/emails` JSON as test
fixtures and finalizes only `normalizeEmail` against them; `classifyEmail` and everything
downstream never change. Sequence-completion is **not** detected here — it is the Phase B
time-based sweep (see Architecture), which needs no Instantly call.

### ClickUp client (`src/clients/clickup.ts`)

Add assignee support, needed for the reply hand-off. Either extend `updateTask` to accept
`assignees?: { add?: number[]; rem?: number[] }` (ClickUp's task-update shape) or add a
dedicated `assignTask(taskId, userId)`. Prefer extending `updateTask` so status + assignee
happen in one call.

### Send agent (`runSend` in `src/index.ts`) — one-line addition

When the send agent moves a lead to **Outreach Active**, it must also stamp
`outreachStartedDate` = today (epoch ms) in the same `updateTask` custom-fields array it
already writes (campaign id, lead id, sequence status). This date is the input the Phase B
sweep reads to decide "sequence done." No other send-agent behavior changes.

### Config (`src/config.ts`)

- `ownerUserId: number` ← `CLICKUP_OWNER_USER_ID` (Jenn's ClickUp user id; required).
- `replyPollLookbackMinutes: number` ← `REPLY_POLL_LOOKBACK_MINUTES` (default 90).
- `sequenceCompleteAfterDays: number` ← `SEQUENCE_COMPLETE_AFTER_DAYS` (default 14).
- `outreachFields.lastReplyDate` ← `CLICKUP_FIELD_LAST_REPLY_DATE` (required).
- `outreachFields.outreachStartedDate` ← `CLICKUP_FIELD_OUTREACH_STARTED_DATE` (required).

### ClickUp workspace

- New custom field on the Prospects list: **Last Reply Date** (Date).
- New custom field on the Prospects list: **Outreach Started Date** (Date).

### `.env.example`

Add `CLICKUP_OWNER_USER_ID`, `REPLY_POLL_LOOKBACK_MINUTES`, `SEQUENCE_COMPLETE_AFTER_DAYS`,
`CLICKUP_FIELD_LAST_REPLY_DATE`, `CLICKUP_FIELD_OUTREACH_STARTED_DATE`. The
`INSTANTLY_API_KEY` entry is reused; no webhook secret.

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

- `normalizeEmail` — maps captured raw `/emails` fixtures to `NormalizedEmail` (the spike's
  fixtures become these tests).
- `classifyEmail` — one test per signal kind, from `NormalizedEmail` inputs (no live API).
- Reply → Responded + assign + Last Reply Date + comment.
- Reply when already Responded → no-op (idempotency: no duplicate comment, no re-assign).
- Auto-reply → tag only, no status change; second pass adds nothing.
- Bounce → classified, but for mail-daemon bounces the lead is unresolved → `noMatch` (documented limitation; see Go-live validation).
- **Phase B sweep:** Outreach Active + `outreachStartedDate` older than threshold → Dormant
  with dormantDate + dormantReactivationDate(+90d); Outreach Active but within threshold →
  untouched; a lead flagged Responded in Phase A is never swept (Phase A precedes Phase B,
  and Phase B skips tasks Phase A already transitioned).
- No matching ClickUp task → skipped, counted in `noMatch`.
- Look-back re-run over the same window → zero net changes.
- Dry run → no write calls.
- Run-level Instantly failure → alerter called, surfaced as run error.

Send-agent test (`tests/send.test.ts`): moving a lead to Outreach Active now also writes
`outreachStartedDate` — extend the existing assertion.

## Open validation item (carried into the plan)

The single remaining piece of real uncertainty is the raw `GET /emails` payload shape. The
implementation plan's first task is a live-API spike to capture real fixtures and finalize
**only** `normalizeEmail` against them; `classifyEmail`, the Phase B sweep, and everything
else are mechanical and testable independent of the live API. (Sequence completion no
longer depends on the API — Phase B is time-based — so that uncertainty is removed.)

## Go-live validation

Once a campaign has real inbound traffic:

1. Run `scripts/spike-emails.ts` against the live Instantly API to capture a real page of
   `/emails` JSON.
2. Confirm the exact field names used by `normalizeEmail`: specifically `from_address_email`,
   `to_address_email_list`, `subject`, and `body.text`. If the live payload uses different
   names, adjust `normalizeEmail` and its test fixtures to match, then re-run
   `npx vitest run` to confirm all tests stay green.
3. **BOUNCE reconciliation is not yet functional.** Mail-daemon bounce messages currently
   resolve `leadEmail` to the daemon address (e.g. `mailer-daemon@...`) and land in
   `noMatch` — safe, no wrong ClickUp writes. During live validation, inspect how the
   Instantly `/emails` endpoint represents a bounce (the `from_address_email` field on a
   bounce record), and map the bounced lead's real email address before relying on the
   Bounced status transition.
