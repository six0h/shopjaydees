# Instantly Reply-Poll Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth scheduled agent that polls the Instantly API for replies/bounces/auto-replies and runs a time-based sequence-completion sweep, reconciling all of it into ClickUp — replacing the Zapier bridge.

**Architecture:** A new `src/reply-poll.ts` module holds pure helpers (`normalizeEmail`, `classifyEmail`, `isSequenceComplete`) and the orchestrator `runReplyPoll(deps)`. Phase A pulls `GET /emails` per active campaign, classifies each item, matches a ClickUp task by Contact Email, and applies an idempotent status/comment/tag/assignee update. Phase B sweeps ClickUp leads stuck in **Outreach Active** past a time threshold into **Dormant**. An `ff.http("replyPoll")` handler in `index.ts` wires it for Cloud Scheduler.

**Tech Stack:** TypeScript, Vitest, Instantly API v2 (`GET /emails`), ClickUp API v2, Google Cloud Functions (functions-framework).

## Global Constraints

- TDD: write the failing test first, watch it fail, implement minimal code, watch it pass, commit. One behavior per test.
- Reply direction is determined by sender domain vs `config.instantlySendingDomains` — NOT by any Instantly type enum.
- All ClickUp status transitions are guarded by current status (idempotent under the look-back window).
- No new datastore/cursor: a `replyPollLookbackMinutes` window (default 90) + idempotency only.
- `config.dryRun` (and a `dry_run` request-body override) must suppress all ClickUp/Instantly write calls.
- Run all pipeline commands from `pipeline/`: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline`.
- Commit messages end with the repo's required trailer (Co-Authored-By + Claude-Session), matching prior commits.
- The exact raw `/emails` field names in `normalizeEmail` are best-effort against docs and MUST be validated against live data before go-live (Task 9 checkpoint) — no live campaign traffic exists yet (mailboxes warming).

---

### Task 1: Instantly client — `listEmails()`

**Files:**
- Modify: `pipeline/src/clients/instantly.ts`
- Test: `pipeline/tests/clients/instantly.test.ts`

**Interfaces:**
- Produces: `InstantlyRawEmail` (= `Record<string, unknown>`), `InstantlyEmailPage` (`{ items: InstantlyRawEmail[]; nextStartingAfter: string | null }`), and `InstantlyClient.listEmails(campaignId: string, opts?: { startingAfter?: string; limit?: number }): Promise<InstantlyEmailPage>`.

- [ ] **Step 1: Write the failing test**

Add inside the existing top-level `describe` in `tests/clients/instantly.test.ts` (follow the existing `mockFetchResponse`/`logger` setup used by sibling tests in that file):

```ts
describe("listEmails", () => {
  it("GETs /emails filtered by campaign and maps pagination", async () => {
    const mockFetch = mockFetchResponse(200, {
      items: [{ id: "e1", from_address_email: "lead@acme.ca" }],
      next_starting_after: "e1",
    });
    const client = createInstantlyClient({ apiKey: "k", fetchFn: mockFetch, logger });

    const page = await client.listEmails("camp_1", { limit: 50 });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("api.instantly.ai/api/v2/emails");
    expect(url).toContain("campaign_id=camp_1");
    expect(url).toContain("limit=50");
    expect(options.method ?? "GET").toBe("GET");
    expect(page.items).toHaveLength(1);
    expect(page.nextStartingAfter).toBe("e1");
  });

  it("passes starting_after and null-coalesces missing cursor", async () => {
    const mockFetch = mockFetchResponse(200, { items: [] });
    const client = createInstantlyClient({ apiKey: "k", fetchFn: mockFetch, logger });

    const page = await client.listEmails("camp_1", { startingAfter: "e9" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("starting_after=e9");
    expect(page.nextStartingAfter).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clients/instantly.test.ts`
Expected: FAIL — `client.listEmails is not a function`.

- [ ] **Step 3: Implement**

In `instantly.ts`, add the exported types above the `InstantlyClient` interface:

```ts
export type InstantlyRawEmail = Record<string, unknown>;

export interface InstantlyEmailPage {
  items: InstantlyRawEmail[];
  nextStartingAfter: string | null;
}
```

Add to the `InstantlyClient` interface:

```ts
listEmails(
  campaignId: string,
  opts?: { startingAfter?: string; limit?: number }
): Promise<InstantlyEmailPage>;
```

Add the method to the returned object (the file already has a `request(method, path, body?)` helper that throws `InstantlyApiError` on non-2xx):

```ts
async listEmails(campaignId, opts = {}): Promise<InstantlyEmailPage> {
  const params = new URLSearchParams({ campaign_id: campaignId });
  params.set("limit", String(opts.limit ?? 100));
  if (opts.startingAfter) params.set("starting_after", opts.startingAfter);
  const data = (await request("GET", `/emails?${params.toString()}`)) as {
    items?: InstantlyRawEmail[];
    next_starting_after?: string | null;
  };
  return {
    items: data.items ?? [],
    nextStartingAfter: data.next_starting_after ?? null,
  };
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/clients/instantly.test.ts`
Expected: PASS (all instantly tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/instantly.ts pipeline/tests/clients/instantly.test.ts
git commit -m "feat: add Instantly listEmails for reply polling"
```

---

### Task 2: Email normalize + classify (pure functions)

**Files:**
- Create: `pipeline/src/reply-poll.ts`
- Create: `pipeline/tests/reply-poll.test.ts`

**Interfaces:**
- Consumes: `InstantlyRawEmail` (Task 1).
- Produces:
  - `NormalizedEmail = { leadEmail: string; direction: "inbound" | "outbound"; isAutoReply: boolean; isBounce: boolean; subject: string; snippet: string }`
  - `normalizeEmail(raw: InstantlyRawEmail, sendingDomains: string[]): NormalizedEmail`
  - `EmailSignal` (discriminated union, `kind`: `reply` | `auto_reply` | `bounce` | `ignore`, plus `leadEmail`/`subject`/`snippet` where relevant)
  - `classifyEmail(n: NormalizedEmail): EmailSignal`

> Note: `unsubscribe` is intentionally not detected via `/emails` (Instantly handles suppression itself; it surfaces as a lead-status change, not an email). It is out of scope for this agent; documented in Task 10.

- [ ] **Step 1: Write the failing tests**

Create `tests/reply-poll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail, classifyEmail } from "../src/reply-poll.js";

const DOMAINS = ["shopjaydees.ca", "shopjaydees.net"];

describe("normalizeEmail", () => {
  it("marks mail FROM a lead as inbound", () => {
    const n = normalizeEmail(
      {
        from_address_email: "mike@acme.ca",
        to_address_email_list: "ellie@shopjaydees.ca",
        subject: "Re: quick question",
        body: { text: "Sure, tell me more about pricing." },
      },
      DOMAINS
    );
    expect(n.direction).toBe("inbound");
    expect(n.leadEmail).toBe("mike@acme.ca");
    expect(n.snippet).toContain("pricing");
  });

  it("marks mail FROM our sending domain as outbound", () => {
    const n = normalizeEmail(
      { from_address_email: "ellie@shopjaydees.ca", to_address_email_list: "mike@acme.ca", subject: "Hi" },
      DOMAINS
    );
    expect(n.direction).toBe("outbound");
    expect(n.leadEmail).toBe("mike@acme.ca");
  });

  it("flags auto-replies by subject", () => {
    const n = normalizeEmail(
      { from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Automatic reply: Out of office" },
      DOMAINS
    );
    expect(n.isAutoReply).toBe(true);
  });

  it("flags bounces from mailer-daemon", () => {
    const n = normalizeEmail(
      { from_address_email: "MAILER-DAEMON@googlemail.com", to_address_email_list: "ellie@shopjaydees.ca", subject: "Delivery Status Notification (Failure)" },
      DOMAINS
    );
    expect(n.isBounce).toBe(true);
  });
});

describe("classifyEmail", () => {
  const base = { leadEmail: "mike@acme.ca", subject: "Re: hi", snippet: "interested" };

  it("inbound genuine reply -> reply", () => {
    expect(classifyEmail({ ...base, direction: "inbound", isAutoReply: false, isBounce: false }).kind).toBe("reply");
  });
  it("inbound auto-reply -> auto_reply", () => {
    expect(classifyEmail({ ...base, direction: "inbound", isAutoReply: true, isBounce: false }).kind).toBe("auto_reply");
  });
  it("bounce -> bounce", () => {
    expect(classifyEmail({ ...base, direction: "inbound", isAutoReply: false, isBounce: true }).kind).toBe("bounce");
  });
  it("outbound -> ignore", () => {
    expect(classifyEmail({ ...base, direction: "outbound", isAutoReply: false, isBounce: false }).kind).toBe("ignore");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: FAIL — cannot find module `../src/reply-poll.js`.

- [ ] **Step 3: Implement the pure functions**

Create `src/reply-poll.ts`:

```ts
import type { InstantlyRawEmail } from "./clients/instantly.js";

export interface NormalizedEmail {
  leadEmail: string;
  direction: "inbound" | "outbound";
  isAutoReply: boolean;
  isBounce: boolean;
  subject: string;
  snippet: string;
}

export type EmailSignal =
  | { kind: "reply"; leadEmail: string; subject: string; snippet: string }
  | { kind: "auto_reply"; leadEmail: string; snippet: string }
  | { kind: "bounce"; leadEmail: string }
  | { kind: "ignore" };

// NOTE: raw field names are best-effort vs Instantly docs — validate live (plan Task 9).
const AUTO_REPLY_RE = /(out of office|automatic reply|auto-?reply|away from|on vacation)/i;
const BOUNCE_FROM_RE = /(mailer-daemon|postmaster)/i;
const BOUNCE_SUBJECT_RE = /(delivery status notification|undeliverable|delivery has failed|returned mail)/i;

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function normalizeEmail(
  raw: InstantlyRawEmail,
  sendingDomains: string[]
): NormalizedEmail {
  const from = String(raw.from_address_email ?? "").trim();
  const toList = String(raw.to_address_email_list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = String(raw.subject ?? "");
  const bodyText =
    typeof raw.body === "object" && raw.body !== null
      ? String((raw.body as Record<string, unknown>).text ?? "")
      : String(raw.body ?? "");

  const ours = new Set(sendingDomains.map((d) => d.toLowerCase()));
  const direction: "inbound" | "outbound" = ours.has(domainOf(from)) ? "outbound" : "inbound";
  // The lead is whichever party is not us.
  const leadEmail = direction === "outbound" ? (toList[0] ?? "") : from;

  return {
    leadEmail,
    direction,
    isAutoReply: AUTO_REPLY_RE.test(subject),
    isBounce: BOUNCE_FROM_RE.test(from) || BOUNCE_SUBJECT_RE.test(subject),
    subject,
    snippet: bodyText.slice(0, 280),
  };
}

export function classifyEmail(n: NormalizedEmail): EmailSignal {
  if (n.direction === "outbound") return { kind: "ignore" };
  if (n.isBounce) return { kind: "bounce", leadEmail: n.leadEmail };
  if (n.isAutoReply) return { kind: "auto_reply", leadEmail: n.leadEmail, snippet: n.snippet };
  if (!n.leadEmail) return { kind: "ignore" };
  return { kind: "reply", leadEmail: n.leadEmail, subject: n.subject, snippet: n.snippet };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/reply-poll.ts pipeline/tests/reply-poll.test.ts
git commit -m "feat: add email normalize/classify for reply polling"
```

---

### Task 3: Live-validation capture script

**Files:**
- Create: `pipeline/scripts/spike-emails.ts`

**Interfaces:** none (operational tool).

- [ ] **Step 1: Write the script**

Create `scripts/spike-emails.ts` (run later, once a campaign has real traffic, to confirm `normalizeEmail`'s field assumptions):

```ts
/**
 * One-off: dump a page of GET /emails for a campaign so we can confirm the raw
 * field names normalizeEmail relies on. Run only after real campaign traffic exists.
 *   INSTANTLY_API_KEY=... CAMPAIGN_ID=... npx tsx scripts/spike-emails.ts
 */
const apiKey = process.env.INSTANTLY_API_KEY;
const campaignId = process.env.CAMPAIGN_ID;
if (!apiKey || !campaignId) {
  console.error("Set INSTANTLY_API_KEY and CAMPAIGN_ID");
  process.exit(1);
}
const url = `https://api.instantly.ai/api/v2/emails?campaign_id=${campaignId}&limit=20`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
console.log("status", res.status);
console.log(JSON.stringify(await res.json(), null, 2));
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors. (Do NOT run the script now — no live traffic yet.)

- [ ] **Step 3: Commit**

```bash
git add pipeline/scripts/spike-emails.ts
git commit -m "chore: add Instantly /emails capture script for live field validation"
```

---

### Task 4: ClickUp client — assignee support

**Files:**
- Modify: `pipeline/src/clients/clickup.ts`
- Test: `pipeline/tests/clients/clickup.test.ts`

**Interfaces:**
- Produces: `updateTask` accepts an optional `assignees?: { add?: number[]; rem?: number[] }` and forwards it in the PUT body.

- [ ] **Step 1: Write the failing test**

Add to `tests/clients/clickup.test.ts` (uses the file's existing `mockFetchResponse`/`logger` and `createClickUpClient` with `rateLimit`):

```ts
it("forwards assignees in the updateTask PUT body", async () => {
  const mockFetch = mockFetchResponse(200, { id: "t1" });
  const client = createClickUpClient({ token: "tok", rateLimit: 100, fetchFn: mockFetch, logger });

  await client.updateTask("t1", { status: "Responded - Owner Follow-up", assignees: { add: [42] } });

  const [, options] = mockFetch.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body.assignees).toEqual({ add: [42] });
  expect(body.status).toBe("Responded - Owner Follow-up");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clients/clickup.test.ts`
Expected: FAIL — TypeScript error: `assignees` not assignable to `updateTask` arg.

- [ ] **Step 3: Implement**

In `clickup.ts`, widen the `updateTask` signature in the `ClickUpClient` interface:

```ts
updateTask(
  taskId: string,
  update: {
    status?: string;
    custom_fields?: Array<{ id: string; value: unknown }>;
    assignees?: { add?: number[]; rem?: number[] };
  }
): Promise<ClickUpTask>;
```

The implementation already passes `update` straight through as the PUT body, so no body change is needed — only the type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/clients/clickup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/clickup.ts pipeline/tests/clients/clickup.test.ts
git commit -m "feat: support assignees in ClickUp updateTask"
```

---

### Task 5: Config — new fields and env

**Files:**
- Modify: `pipeline/src/config.ts`
- Modify: `pipeline/tests/config.test.ts`
- Modify: `pipeline/tests/helpers.ts` (both `makePersonalizationConfig` and `makeSendConfig`)
- Modify: `pipeline/tests/discovery.test.ts` (its local `makeConfig`)
- Modify: `pipeline/.env.example`

**Interfaces:**
- Produces on `Config`: `ownerUserId: number`, `replyPollLookbackMinutes: number`, `sequenceCompleteAfterDays: number`; on `OutreachTrackingFieldIds`: `lastReplyDate: string`, `outreachStartedDate: string`.

- [ ] **Step 1: Write the failing test**

Add to `tests/config.test.ts` (the file sets `process.env.*` then calls `loadConfig()` — match that style and set the two new required field ids + owner id in its env setup/`beforeEach` as needed):

```ts
it("loads reply-poll config with defaults", () => {
  process.env.CLICKUP_OWNER_USER_ID = "42";
  process.env.CLICKUP_FIELD_LAST_REPLY_DATE = "f-last-reply";
  process.env.CLICKUP_FIELD_OUTREACH_STARTED_DATE = "f-outreach-started";
  delete process.env.REPLY_POLL_LOOKBACK_MINUTES;
  delete process.env.SEQUENCE_COMPLETE_AFTER_DAYS;
  const config = loadConfig();
  expect(config.ownerUserId).toBe(42);
  expect(config.replyPollLookbackMinutes).toBe(90);
  expect(config.sequenceCompleteAfterDays).toBe(14);
  expect(config.outreachFields.lastReplyDate).toBe("f-last-reply");
  expect(config.outreachFields.outreachStartedDate).toBe("f-outreach-started");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `ownerUserId` is not a property / missing env throws.

- [ ] **Step 3: Implement**

In `config.ts`, add to `Config`:

```ts
ownerUserId: number;
replyPollLookbackMinutes: number;
sequenceCompleteAfterDays: number;
```

Add to `OutreachTrackingFieldIds`:

```ts
lastReplyDate: string;
outreachStartedDate: string;
```

In `loadConfig()` return object, add top-level:

```ts
ownerUserId: parseInt(required("CLICKUP_OWNER_USER_ID"), 10),
replyPollLookbackMinutes: parseInt(process.env.REPLY_POLL_LOOKBACK_MINUTES ?? "90", 10),
sequenceCompleteAfterDays: parseInt(process.env.SEQUENCE_COMPLETE_AFTER_DAYS ?? "14", 10),
```

And inside `outreachFields`:

```ts
lastReplyDate: required("CLICKUP_FIELD_LAST_REPLY_DATE"),
outreachStartedDate: required("CLICKUP_FIELD_OUTREACH_STARTED_DATE"),
```

- [ ] **Step 4: Update the test config makers**

In `tests/helpers.ts`, add to the returned `Config` of BOTH `makePersonalizationConfig()` and `makeSendConfig()`:

```ts
ownerUserId: 42,
replyPollLookbackMinutes: 90,
sequenceCompleteAfterDays: 14,
```

and inside each one's `outreachFields`:

```ts
lastReplyDate: "field-last-reply-date",
outreachStartedDate: "field-outreach-started-date",
```

Do the same for the local `makeConfig()` in `tests/discovery.test.ts`.

- [ ] **Step 5: Update `.env.example`**

Add under the ClickUp Outreach Tracking Fields section:

```bash
CLICKUP_OWNER_USER_ID=0
REPLY_POLL_LOOKBACK_MINUTES=90
SEQUENCE_COMPLETE_AFTER_DAYS=14
CLICKUP_FIELD_LAST_REPLY_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_OUTREACH_STARTED_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- [ ] **Step 6: Run the full suite (config + all makers)**

Run: `npx vitest run`
Expected: PASS (config + every test using the config makers).

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/config.ts pipeline/tests/config.test.ts pipeline/tests/helpers.ts pipeline/tests/discovery.test.ts pipeline/.env.example
git commit -m "feat: add reply-poll config (owner id, lookback, completion threshold, date fields)"
```

---

### Task 6: Send agent — stamp Outreach Started Date

**Files:**
- Modify: `pipeline/src/index.ts` (the Outreach Active `updateTask` block, ~line 1331-1339)
- Modify: `pipeline/tests/send.test.ts`

**Interfaces:**
- Consumes: `config.outreachFields.outreachStartedDate` (Task 5).

- [ ] **Step 1: Write the failing test**

In `tests/send.test.ts`, find the happy-path test that asserts the Outreach Active `updateTask` custom_fields and add an assertion that the started-date field is written with a numeric (epoch ms) value:

```ts
const updateArg = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls
  .map((c) => c[1])
  .find((u) => u.status === "Outreach Active");
const startedField = updateArg.custom_fields.find(
  (f: { id: string }) => f.id === "field-outreach-started-date"
);
expect(startedField).toBeDefined();
expect(typeof startedField.value).toBe("number");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/send.test.ts`
Expected: FAIL — started-date field not present.

- [ ] **Step 3: Implement**

In the Outreach Active `updateTask` custom_fields array in `index.ts`, add one entry:

```ts
{ id: config.outreachFields.outreachStartedDate, value: Date.now() },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/index.ts pipeline/tests/send.test.ts
git commit -m "feat: stamp Outreach Started Date when send agent activates a lead"
```

---

### Task 7: `runReplyPoll` — Phase A (email events → ClickUp)

**Files:**
- Modify: `pipeline/src/reply-poll.ts`
- Modify: `pipeline/tests/reply-poll.test.ts`
- Modify: `pipeline/tests/helpers.ts` (add `makeOutreachActiveLeadTask` + Instantly `listEmails` to any shared mock if used)

**Interfaces:**
- Consumes: `ClickUpClient` (Tasks 4), `InstantlyClient.listEmails` (Task 1), `Alerter`, `Logger`, `Config`.
- Produces:
  - `ReplyPollDeps = { config: Config; clickup: ClickUpClient; instantly: InstantlyClient; alerter: Alerter; logger: Logger }`
  - `ReplyPollRunResult = { runId: string; timestamp: string; campaignsPolled: number; emailsScanned: number; repliesFlagged: number; autoRepliesTagged: number; bounced: number; noMatch: number; dormant: number; errors: number }`
  - `runReplyPoll(deps: ReplyPollDeps): Promise<ReplyPollRunResult>` (Phase B added in Task 8)

Helper to add in `tests/helpers.ts`:

```ts
export function makeOutreachActiveLeadTask(opts: {
  id?: string;
  email?: string;
  status?: string;
  startedDaysAgo?: number;
  contactEmailFieldId?: string;
  outreachStartedFieldId?: string;
}): ClickUpTask {
  const started = Date.now() - (opts.startedDaysAgo ?? 0) * 24 * 60 * 60 * 1000;
  return makeClickUpTask({
    id: opts.id ?? "lead_1",
    status: { status: opts.status ?? "Outreach Active" } as ClickUpTask["status"],
    custom_fields: [
      { id: opts.contactEmailFieldId ?? "field-contact-email", name: "Contact Email", value: opts.email ?? "mike@acme.ca", type: "email" },
      { id: opts.outreachStartedFieldId ?? "field-outreach-started-date", name: "Outreach Started Date", value: started, type: "date" },
    ] as ClickUpTask["custom_fields"],
  });
}
```

- [ ] **Step 1: Write failing tests for Phase A**

Add a `describe("runReplyPoll — Phase A")` block to `tests/reply-poll.test.ts`. Build mocks the same way `send.test.ts` does (a `makeMockClickUp`, `makeMockInstantly` with `listEmails`, `makeMockAlerter`, `createLogger("test")`, and `makeSendConfig()` whose `fields.contactEmail` is `"field-contact-email"`). Cover:

```ts
it("flags a genuine reply: Responded + assign + last-reply date + comment", async () => {
  const config = makeSendConfig();
  const clickup = makeMockClickUp();
  (clickup.getTasks as Mock).mockResolvedValue([
    makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail, outreachStartedFieldId: config.outreachFields.outreachStartedDate }),
  ]);
  const instantly = makeMockInstantly();
  (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
  (instantly.listEmails as Mock).mockResolvedValue({
    items: [{ from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re: hi", body: { text: "Yes, send pricing" } }],
    nextStartingAfter: null,
  });

  const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

  const upd = (clickup.updateTask as Mock).mock.calls.find((c) => c[0] === "lead_1")![1];
  expect(upd.status).toBe("Responded - Owner Follow-up");
  expect(upd.assignees).toEqual({ add: [config.ownerUserId] });
  expect(upd.custom_fields.find((f: { id: string }) => f.id === config.outreachFields.lastReplyDate)).toBeDefined();
  expect(clickup.addComment).toHaveBeenCalledWith("lead_1", expect.stringContaining("Yes, send pricing"));
  expect(result.repliesFlagged).toBe(1);
});

it("is idempotent: a reply on an already-Responded lead does nothing", async () => {
  const config = makeSendConfig();
  const clickup = makeMockClickUp();
  (clickup.getTasks as Mock).mockResolvedValue([
    makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", status: "Responded - Owner Follow-up", contactEmailFieldId: config.fields.contactEmail }),
  ]);
  const instantly = makeMockInstantly();
  (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "c", status: "active" }]);
  (instantly.listEmails as Mock).mockResolvedValue({ items: [{ from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re", body: { text: "again" } }], nextStartingAfter: null });

  await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
  expect(clickup.updateTask).not.toHaveBeenCalled();
  expect(clickup.addComment).not.toHaveBeenCalled();
});

it("auto-reply only tags, no status change", async () => { /* listEmails subject 'Out of office'; expect addTag('lead_1','auto-reply'), updateTask status not changed */ });
it("bounce moves to Bounced + tag when not closed", async () => { /* from MAILER-DAEMON; expect updateTask status 'Bounced' + addTag 'bounced' */ });
it("no matching task -> counted in noMatch, no writes", async () => { /* getTasks returns [] for the lookup; expect result.noMatch === 1 */ });
it("dry run performs no writes", async () => { /* config.dryRun = true; expect no updateTask/addComment/addTag */ });
it("Instantly failure alerts and surfaces an error", async () => { /* listEmails rejects; expect alerter.send called, result.errors >= 1 */ });
```

(Write the four sketched tests out fully in the same style as the two complete ones above — concrete inputs, concrete assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: FAIL — `runReplyPoll` not exported.

- [ ] **Step 3: Implement Phase A**

Add to `src/reply-poll.ts` (imports at top, then the orchestrator). Match the logger/run-id and try/catch style of `runSend`/`runDormancyCheck`:

```ts
import type { Config } from "./config.js";
import type { ClickUpClient } from "./clients/clickup.js";
import type { InstantlyClient } from "./clients/instantly.js";
import type { ClickUpTask } from "./types.js";
import type { Alerter } from "./alerting.js";
import type { Logger } from "./logger.js";

export interface ReplyPollDeps {
  config: Config;
  clickup: ClickUpClient;
  instantly: InstantlyClient;
  alerter: Alerter;
  logger: Logger;
}

export interface ReplyPollRunResult {
  runId: string;
  timestamp: string;
  campaignsPolled: number;
  emailsScanned: number;
  repliesFlagged: number;
  autoRepliesTagged: number;
  bounced: number;
  noMatch: number;
  dormant: number;
  errors: number;
}

const CLOSED_STATUSES = new Set(["Won", "Lost", "Unsubscribed", "Bounced"]);
const TERMINAL_FOR_REPLY = new Set([
  "Responded - Owner Follow-up", "Won", "Lost", "Unsubscribed", "Bounced",
]);

function statusOf(task: ClickUpTask): string {
  return task.status?.status ?? "";
}

async function findTaskByEmail(
  deps: ReplyPollDeps, email: string
): Promise<ClickUpTask | null> {
  const tasks = await deps.clickup.getTasks(deps.config.clickupListId, {
    customFields: [{ field_id: deps.config.fields.contactEmail, operator: "=", value: email }],
    includeClosed: true,
  });
  return tasks[0] ?? null;
}

export async function runReplyPoll(deps: ReplyPollDeps): Promise<ReplyPollRunResult> {
  const { config, clickup, instantly, alerter, logger } = deps;
  const now = new Date();
  const runId = `reply-poll-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  const result: ReplyPollRunResult = {
    runId, timestamp: now.toISOString(), campaignsPolled: 0, emailsScanned: 0,
    repliesFlagged: 0, autoRepliesTagged: 0, bounced: 0, noMatch: 0, dormant: 0, errors: 0,
  };

  // ---- Phase A: email events ----
  try {
    const campaigns = await instantly.listCampaigns();
    for (const campaign of campaigns) {
      result.campaignsPolled += 1;
      let cursor: string | undefined;
      do {
        const page = await instantly.listEmails(campaign.id, { startingAfter: cursor, limit: 100 });
        for (const raw of page.items) {
          result.emailsScanned += 1;
          try {
            const signal = classifyEmail(normalizeEmail(raw, config.instantlySendingDomains));
            if (signal.kind === "ignore") continue;
            await applySignal(deps, signal, result);
          } catch (itemErr) {
            result.errors += 1;
            logger.warn("Reply-poll item failed", { error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
        cursor = page.nextStartingAfter ?? undefined;
      } while (cursor);
    }
  } catch (err) {
    result.errors += 1;
    const msg = err instanceof Error ? err.message : String(err);
    logger.critical("Reply-poll Phase A failed", { error: msg });
    await alerter.send("Reply-poll agent error (Instantly polling)", msg);
  }

  // Phase B added in Task 8.
  logger.info("Reply-poll complete", { ...result });
  return result;
}

async function applySignal(
  deps: ReplyPollDeps, signal: Exclude<EmailSignal, { kind: "ignore" }>, result: ReplyPollRunResult
): Promise<void> {
  const { config, clickup, logger } = deps;
  const task = await findTaskByEmail(deps, signal.leadEmail);
  if (!task) { result.noMatch += 1; logger.info("No ClickUp task for lead", { email: signal.leadEmail }); return; }
  const status = statusOf(task);

  if (signal.kind === "reply") {
    if (TERMINAL_FOR_REPLY.has(status)) return;
    if (!config.dryRun) {
      await clickup.updateTask(task.id, {
        status: "Responded - Owner Follow-up",
        assignees: { add: [config.ownerUserId] },
        custom_fields: [{ id: config.outreachFields.lastReplyDate, value: Date.now() }],
      });
      await clickup.addComment(task.id, `Reply received — ${signal.subject}\n\n${signal.snippet}`);
    }
    result.repliesFlagged += 1;
  } else if (signal.kind === "auto_reply") {
    if (task.tags.some((t) => t.name === "auto-reply")) return;
    if (!config.dryRun) {
      await clickup.addTag(task.id, "auto-reply");
      await clickup.addComment(task.id, `Auto-reply: ${signal.snippet}`);
    }
    result.autoRepliesTagged += 1;
  } else if (signal.kind === "bounce") {
    if (CLOSED_STATUSES.has(status)) return;
    if (!config.dryRun) {
      await clickup.updateTask(task.id, { status: "Bounced" });
      await clickup.addTag(task.id, "bounced");
    }
    result.bounced += 1;
  }
}
```

(`ClickUpTask.tags` and `.status.status` already exist in `src/types.ts`; confirm field names while implementing.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/reply-poll.ts pipeline/tests/reply-poll.test.ts pipeline/tests/helpers.ts
git commit -m "feat: runReplyPoll Phase A — reconcile Instantly replies/bounces into ClickUp"
```

---

### Task 8: `runReplyPoll` — Phase B (time-based completion sweep)

**Files:**
- Modify: `pipeline/src/reply-poll.ts`
- Modify: `pipeline/tests/reply-poll.test.ts`

**Interfaces:**
- Consumes: `config.sequenceCompleteAfterDays`, `config.outreachFields.{outreachStartedDate,dormantDate,dormantReactivationDate,sequenceStatus}`.
- Produces: `isSequenceComplete(task, config, now): boolean`; Phase B body inside `runReplyPoll`.

- [ ] **Step 1: Write failing tests**

```ts
describe("runReplyPoll — Phase B sweep", () => {
  it("moves an Outreach Active lead past the threshold to Dormant with +90d reactivation", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([]); // skip Phase A
    // Phase B query for Outreach Active:
    (clickup.getTasks as Mock).mockResolvedValue([
      makeOutreachActiveLeadTask({ id: "old_1", startedDaysAgo: 20, outreachStartedFieldId: config.outreachFields.outreachStartedDate }),
    ]);
    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
    const upd = (clickup.updateTask as Mock).mock.calls.find((c) => c[0] === "old_1")![1];
    expect(upd.status).toBe("Dormant");
    const fids = upd.custom_fields.map((f: { id: string }) => f.id);
    expect(fids).toContain(config.outreachFields.dormantDate);
    expect(fids).toContain(config.outreachFields.dormantReactivationDate);
    expect(result.dormant).toBe(1);
  });

  it("leaves an Outreach Active lead within the threshold untouched", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([]);
    (clickup.getTasks as Mock).mockResolvedValue([
      makeOutreachActiveLeadTask({ id: "fresh_1", startedDaysAgo: 3, outreachStartedFieldId: config.outreachFields.outreachStartedDate }),
    ]);
    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(result.dormant).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: FAIL — no Dormant transition happens.

- [ ] **Step 3: Implement Phase B**

Add the predicate and the sweep. Add `isSequenceComplete`:

```ts
export function isSequenceComplete(task: ClickUpTask, config: Config, now: Date): boolean {
  if (statusOf(task) !== "Outreach Active") return false;
  const field = task.custom_fields.find((f) => f.id === config.outreachFields.outreachStartedDate);
  if (!field?.value) return false;
  const started = parseInt(String(field.value), 10);
  if (Number.isNaN(started)) return false;
  const ageMs = now.getTime() - started;
  return ageMs >= config.sequenceCompleteAfterDays * 24 * 60 * 60 * 1000;
}
```

In `runReplyPoll`, replace the `// Phase B added in Task 8.` line with:

```ts
// ---- Phase B: time-based completion sweep ----
try {
  const active = await clickup.getTasks(config.clickupListId, { statuses: ["Outreach Active"] });
  for (const task of active) {
    if (!isSequenceComplete(task, config, now)) continue;
    try {
      if (!config.dryRun) {
        const reactivation = now.getTime() + 90 * 24 * 60 * 60 * 1000;
        await clickup.updateTask(task.id, {
          status: "Dormant",
          custom_fields: [
            { id: config.outreachFields.dormantDate, value: now.getTime() },
            { id: config.outreachFields.dormantReactivationDate, value: reactivation },
          ],
        });
      }
      result.dormant += 1;
    } catch (sweepErr) {
      result.errors += 1;
      logger.warn("Phase B sweep item failed", { taskId: task.id, error: sweepErr instanceof Error ? sweepErr.message : String(sweepErr) });
    }
  }
} catch (err) {
  result.errors += 1;
  const msg = err instanceof Error ? err.message : String(err);
  logger.critical("Reply-poll Phase B failed", { error: msg });
  await alerter.send("Reply-poll agent error (completion sweep)", msg);
}
```

> Note: tests that exercise Phase A set `listCampaigns` to return campaigns AND must set the Phase B `getTasks(statuses:["Outreach Active"])` call to return `[]` (or account for it). Since the Phase A reply tests already mock `getTasks` broadly, add a `mockImplementation` that returns the Outreach-Active list only when `opts.statuses` includes `"Outreach Active"` and the matched lead otherwise — or keep Phase A tests' `listCampaigns` empty is not an option (they need it). Use `getTasks.mockImplementation((id, opts) => opts.customFields ? [theLead] : [])` in Phase A tests so the email lookup and the sweep query are disambiguated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reply-poll.test.ts`
Expected: PASS (Phase A + Phase B).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/reply-poll.ts pipeline/tests/reply-poll.test.ts
git commit -m "feat: runReplyPoll Phase B — time-based sequence-completion sweep to Dormant"
```

---

### Task 9: HTTP entry point + go-live validation note

**Files:**
- Modify: `pipeline/src/index.ts` (add the `ff.http("replyPoll", ...)` handler + import)
- Modify: `pipeline/package.json` (note the new function target in a comment is unnecessary; functions-framework targets are chosen at deploy)

**Interfaces:**
- Consumes: `runReplyPoll`, `ReplyPollDeps` from `./reply-poll.js`; existing `createInstantlyClient`, `createClickUpClient`, `createAlerter`, `loadConfig`, `createLogger`.

- [ ] **Step 1: Add the handler**

At the top of `index.ts`, add:

```ts
import { runReplyPoll } from "./reply-poll.js";
```

After the `ff.http("dormancyCheck", ...)` handler, append a `ff.http("replyPoll", ...)` handler that mirrors `dormancyCheck` exactly (load config, build logger `"reply-poll"`, alerter, clickup, **and** instantly via `createInstantlyClient`, honor a `dry_run` body override, call `runReplyPoll`, return 200 JSON, and on throw: `logger.critical`, `alerter.send`, 500). Use the dormancyCheck handler as the template:

```ts
ff.http("replyPoll", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("reply-poll");
  const alerter = createAlerter({ alertEmail: config.alertEmail, alertWebhookUrl: config.alertWebhookUrl });
  const clickup = createClickUpClient({ token: config.clickupApiToken, rateLimit: config.clickupRateLimit, logger });
  const instantly = createInstantlyClient({ apiKey: config.instantlyApiKey, logger });
  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;
    const effectiveConfig = dryRunOverride !== undefined ? { ...config, dryRun: dryRunOverride } : config;
    const result = await runReplyPoll({ config: effectiveConfig, clickup, instantly, alerter, logger });
    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Reply Poll", { error: errorMsg });
    await alerter.send("Unhandled error in reply-poll", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
```

- [ ] **Step 2: Typecheck + full suite + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests PASS; build emits `dist/`.

- [ ] **Step 3: Add the go-live validation note**

Append a short section to the design doc `docs/superpowers/specs/2026-06-29-instantly-reply-poll-agent-design.md` titled "Go-live validation" stating: once a campaign has real inbound traffic, run `scripts/spike-emails.ts`, confirm the `from_address_email` / `to_address_email_list` / `subject` / `body.text` field names, and adjust `normalizeEmail` + its fixtures if they differ; re-run `npx vitest run`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/index.ts docs/superpowers/specs/2026-06-29-instantly-reply-poll-agent-design.md
git commit -m "feat: add replyPoll HTTP entry point + go-live validation note"
```

---

### Task 10: Docs — data model, wiki, deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-06-08-clickup-data-model.md`
- Modify: `wiki/decisions/standalone-outreach-mailboxes.md` (or a new decision page) + `wiki/log.md` + `wiki/index.md`

**Interfaces:** none.

- [ ] **Step 1: Update the data model spec**

In `2026-06-08-clickup-data-model.md`: add **Last Reply Date** and **Outreach Started Date** (Date) fields to the Prospects field list; add the `Completed` option to **Sequence Status**; mark the Zapier section (6 zaps + the two Instantly-reply ClickUp automations) **superseded by the reply-poll agent (2026-06-29)**; note unsubscribe reflection is out of scope (Instantly handles suppression).

- [ ] **Step 2: Update the wiki**

Follow the wiki schema at `/mnt/ssd/projects/soq/os/templates/wiki-schema.md`. Append a `wiki/log.md` entry dated 2026-06-29 describing the reply-poll agent decision (polling on Growth, Zapier retired, time-based Dormant sweep). Add/adjust a decision page capturing "reply detection by API polling, not webhooks (Growth-plan constraint)" and update `wiki/index.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-08-clickup-data-model.md wiki/
git commit -m "docs: record reply-poll agent — data model fields, Zapier retirement, wiki decision"
```

---

## Deployment (post-implementation, manual — outside this plan's code tasks)

After merge, the `replyPoll` function deploys like the other four (gcloud functions deploy
with `--trigger-http`) and gets a Cloud Scheduler job (every ~20 min, business hours,
America/Vancouver) POSTing to it. New env vars (`CLICKUP_OWNER_USER_ID`,
`CLICKUP_FIELD_LAST_REPLY_DATE`, `CLICKUP_FIELD_OUTREACH_STARTED_DATE`, optional
`REPLY_POLL_LOOKBACK_MINUTES` / `SEQUENCE_COMPLETE_AFTER_DAYS`) must be set, and the two
new ClickUp custom fields + the `Completed` Sequence Status option created in the workspace.
This depends on the live ClickUp workspace and is tracked with the broader deployment step.

## Self-Review

- **Spec coverage:** client `listEmails` (T1), normalize/classify (T2), capture tool (T3), assignee (T4), config+env (T5), send-agent stamp (T6), Phase A mapping+idempotency+dry-run+error (T7), Phase B sweep (T8), HTTP entry+validation note (T9), docs/data-model/wiki/Zapier-retirement (T10). All spec sections map to a task.
- **Placeholders:** the four sketched Phase-A tests in T7 Step 1 are explicitly instructed to be written out fully in the shown style; all implementation steps contain complete code.
- **Type consistency:** `ReplyPollDeps`, `ReplyPollRunResult`, `NormalizedEmail`, `EmailSignal`, `normalizeEmail(raw, sendingDomains)`, `classifyEmail(n)`, `isSequenceComplete(task, config, now)`, `runReplyPoll(deps)` are used consistently across tasks; field ids reference `config.fields.contactEmail` and `config.outreachFields.*` as defined in T5.
- **Known real-world caveat:** raw `/emails` field names in `normalizeEmail` are validated live at T9/go-live (no live traffic exists during build); direction-by-sending-domain minimizes the blast radius of any field-name correction to `normalizeEmail` alone.
