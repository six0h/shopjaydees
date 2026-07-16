# Monthly Report — Metrics-Pull Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only module that produces a structured monthly summary of the ShopJayDees outreach — sends/opens/replies, prospects reached, warm handoffs, and AI-sourced opportunities + estimated value — from live Instantly and ClickUp data.

**Architecture:** Extend the existing `pipeline/` TypeScript codebase. Add an Instantly client method for campaign analytics and a ClickUp helper for arbitrary-list task fetches, a set of pure aggregation/date functions (unit-tested without network), an orchestrator that wires clients to the pure logic, and an on-demand script that prints the summary JSON. This is Plan 1 of 2; rendering the summary to a branded PDF + Gmail draft is a separate follow-up plan.

**Tech Stack:** TypeScript (ESM, `type: module`), Node ≥20, vitest, native `fetch` (injected as `fetchFn` in clients for tests).

## Global Constraints

- **Read-only. Zero external writes.** This module never calls a mutating endpoint; no `dry_run` needed because it only GETs.
- ClickUp dropdown custom-field value is the option **orderindex (number)**; "AI Outreach" is orderindex **`0`** — compare with `=== 0`, never truthiness.
- ClickUp currency/number custom-field values arrive as **strings** (`"1000"`) or `undefined` — coerce with `Number(...)` and guard `NaN`.
- ClickUp date custom-field values are **ms-epoch strings**; `date_created` on a task is also a ms-epoch string.
- Instantly analytics: `GET /api/v2/campaigns/analytics?ids=<id>&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`, Bearer auth, returns an array of per-campaign objects with `emails_sent_count`, `open_count`, `reply_count`, `bounced_count`, `contacted_count`.
- Exact IDs (verified live 2026-07-15): CRM Leads & Opportunities list `901416652272`; `Lead Source` field `fd42ddf6-ff11-45af-b8b5-6130f5558126` (AI Outreach = orderindex 0); `Est Order Value` field `aad67af7-7f18-4a60-be94-28e2efbd9d4f` (CAD); won status string is `"move to production"`. Prospects list is `config.clickupListId`; reached uses `config.outreachFields.outreachStartedDate`; warm handoff uses `config.fields.lastReplyDate` (`44553125-1969-4c2b-a032-2cade999bed8`).
- Follow existing patterns: clients built by `create*Client({ ..., fetchFn?, logger })`; config via `required()`/`process.env` in `src/config.ts`; tests colocated under `tests/`.

---

### Task 1: Config — CRM report fields

**Files:**
- Modify: `src/config.ts` (add `reportFields` to the `Config` interface and `loadConfig`)
- Modify: `tests/config.test.ts`
- Modify: `tests/helpers.ts` (add `reportFields` to both mock configs)
- Modify: `.env`, `.env.example`, `env.yaml`, `env.yaml.example`

**Interfaces:**
- Produces: `config.reportFields: { crmLeadsListId: string; leadSource: string; estOrderValue: string }` and the constant used later `AI_OUTREACH_ORDERINDEX = 0`, `WON_OPPORTUNITY_STATUS = "move to production"`.

- [ ] **Step 1: Write the failing test**

In `tests/config.test.ts`, inside the env-setup `beforeEach`, add:
```typescript
process.env.CLICKUP_CRM_LEADS_LIST_ID = "901416652272";
process.env.CLICKUP_FIELD_CRM_LEAD_SOURCE = "fd42ddf6-ff11-45af-b8b5-6130f5558126";
process.env.CLICKUP_FIELD_CRM_EST_ORDER_VALUE = "aad67af7-7f18-4a60-be94-28e2efbd9d4f";
```
And in the "loads all required environment variables" test body:
```typescript
expect(config.reportFields).toEqual({
  crmLeadsListId: "901416652272",
  leadSource: "fd42ddf6-ff11-45af-b8b5-6130f5558126",
  estOrderValue: "aad67af7-7f18-4a60-be94-28e2efbd9d4f",
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `config.reportFields` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/config.ts`, add to the `Config` interface:
```typescript
  reportFields: {
    crmLeadsListId: string;
    leadSource: string;
    estOrderValue: string;
  };
```
And in `loadConfig()`'s returned object:
```typescript
    reportFields: {
      crmLeadsListId: required("CLICKUP_CRM_LEADS_LIST_ID"),
      leadSource: required("CLICKUP_FIELD_CRM_LEAD_SOURCE"),
      estOrderValue: required("CLICKUP_FIELD_CRM_EST_ORDER_VALUE"),
    },
```
In `tests/helpers.ts`, add to BOTH mock config objects:
```typescript
    reportFields: {
      crmLeadsListId: "crm-leads-list",
      leadSource: "field-lead-source",
      estOrderValue: "field-est-order-value",
    },
```
Append to `.env` and `.env.example`:
```
CLICKUP_CRM_LEADS_LIST_ID=901416652272
CLICKUP_FIELD_CRM_LEAD_SOURCE=fd42ddf6-ff11-45af-b8b5-6130f5558126
CLICKUP_FIELD_CRM_EST_ORDER_VALUE=aad67af7-7f18-4a60-be94-28e2efbd9d4f
```
Append to `env.yaml` and `env.yaml.example`:
```
CLICKUP_CRM_LEADS_LIST_ID: "901416652272"
CLICKUP_FIELD_CRM_LEAD_SOURCE: "fd42ddf6-ff11-45af-b8b5-6130f5558126"
CLICKUP_FIELD_CRM_EST_ORDER_VALUE: "aad67af7-7f18-4a60-be94-28e2efbd9d4f"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts tests/helpers.ts .env.example env.yaml.example
git commit -m "feat(report): config for CRM opportunity fields"
```

---

### Task 2: Instantly client — getCampaignAnalytics

**Files:**
- Modify: `src/clients/instantly.ts`
- Modify: `tests/clients/instantly.test.ts`

**Interfaces:**
- Produces: `InstantlyClient.getCampaignAnalytics(campaignIds: string[], startDate: string, endDate: string): Promise<InstantlyCampaignAnalytics[]>` where
```typescript
export interface InstantlyCampaignAnalytics {
  campaignId: string;
  emailsSent: number;
  opens: number;
  replies: number;
  bounced: number;
}
```

- [ ] **Step 1: Write the failing test**

In `tests/clients/instantly.test.ts`, add a describe block:
```typescript
describe("getCampaignAnalytics", () => {
  it("GETs /campaigns/analytics with ids + date range and normalizes the rows", async () => {
    const mockFetch = mockFetchResponse(200, [
      { campaign_id: "c1", emails_sent_count: 40, open_count: 18, reply_count: 4, bounced_count: 1 },
      { campaign_id: "c2", emails_sent_count: 10, open_count: 3, reply_count: 0, bounced_count: 0 },
    ]);
    const client = createInstantlyClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

    const result = await client.getCampaignAnalytics(["c1", "c2"], "2026-07-01", "2026-07-31");

    expect(result).toEqual([
      { campaignId: "c1", emailsSent: 40, opens: 18, replies: 4, bounced: 1 },
      { campaignId: "c2", emailsSent: 10, opens: 3, replies: 0, bounced: 0 },
    ]);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("api.instantly.ai/api/v2/campaigns/analytics");
    expect(url).toContain("start_date=2026-07-01");
    expect(url).toContain("end_date=2026-07-31");
    expect(url).toContain("ids=c1");
    expect(url).toContain("ids=c2");
    expect(opts.headers["Authorization"]).toBe("Bearer test_key");
  });

  it("returns [] when given no campaign ids without calling the API", async () => {
    const mockFetch = mockFetchResponse(200, []);
    const client = createInstantlyClient({ apiKey: "test_key", fetchFn: mockFetch, logger });
    const result = await client.getCampaignAnalytics([], "2026-07-01", "2026-07-31");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clients/instantly.test.ts`
Expected: FAIL — `client.getCampaignAnalytics is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/clients/instantly.ts`, add the interface near the other exports:
```typescript
export interface InstantlyCampaignAnalytics {
  campaignId: string;
  emailsSent: number;
  opens: number;
  replies: number;
  bounced: number;
}
```
Add to the `InstantlyClient` interface:
```typescript
  getCampaignAnalytics(
    campaignIds: string[],
    startDate: string,
    endDate: string
  ): Promise<InstantlyCampaignAnalytics[]>;
```
Add the method to the returned object:
```typescript
    async getCampaignAnalytics(campaignIds, startDate, endDate): Promise<InstantlyCampaignAnalytics[]> {
      if (campaignIds.length === 0) return [];
      const params = new URLSearchParams();
      for (const id of campaignIds) params.append("ids", id);
      params.set("start_date", startDate);
      params.set("end_date", endDate);
      const rows = (await request("GET", `/campaigns/analytics?${params.toString()}`)) as Array<{
        campaign_id?: string;
        emails_sent_count?: number;
        open_count?: number;
        reply_count?: number;
        bounced_count?: number;
      }>;
      return (rows ?? []).map((r) => ({
        campaignId: r.campaign_id ?? "",
        emailsSent: r.emails_sent_count ?? 0,
        opens: r.open_count ?? 0,
        replies: r.reply_count ?? 0,
        bounced: r.bounced_count ?? 0,
      }));
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/clients/instantly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/instantly.ts tests/clients/instantly.test.ts
git commit -m "feat(report): Instantly campaign analytics client method"
```

---

### Task 3: Pure date-window helper

**Files:**
- Create: `src/report.ts`
- Create: `tests/report.test.ts`

**Interfaces:**
- Produces: `monthWindow(month: string): { startDate: string; endDate: string; startMs: number; endMs: number }` where `month` is `"YYYY-MM"`. `startDate`/`endDate` are inclusive `YYYY-MM-DD` strings (first and last day of the month, UTC); `startMs` is the ms epoch of the month start (UTC), `endMs` is the ms epoch of the first instant of the NEXT month (exclusive upper bound for `< endMs` comparisons).

- [ ] **Step 1: Write the failing test**

Create `tests/report.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { monthWindow } from "../src/report.js";

describe("monthWindow", () => {
  it("returns inclusive date strings and a half-open ms range for a 31-day month", () => {
    const w = monthWindow("2026-07");
    expect(w.startDate).toBe("2026-07-01");
    expect(w.endDate).toBe("2026-07-31");
    expect(w.startMs).toBe(Date.UTC(2026, 6, 1));
    expect(w.endMs).toBe(Date.UTC(2026, 7, 1));
  });

  it("handles February and December rollover", () => {
    expect(monthWindow("2026-02").endDate).toBe("2026-02-28");
    const dec = monthWindow("2026-12");
    expect(dec.endDate).toBe("2026-12-31");
    expect(dec.endMs).toBe(Date.UTC(2027, 0, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report.test.ts`
Expected: FAIL — cannot find `monthWindow` / `src/report.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/report.ts`:
```typescript
export interface MonthWindow {
  startDate: string;
  endDate: string;
  startMs: number;
  endMs: number;
}

/** Parse "YYYY-MM" into an inclusive date-string range and a half-open [startMs, endMs) UTC range. */
export function monthWindow(month: string): MonthWindow {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const startMs = Date.UTC(y, m - 1, 1);
  const endMs = Date.UTC(y, m, 1); // first instant of next month (exclusive)
  const lastDay = new Date(endMs - 1).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${y}-${pad(m)}-01`,
    endDate: `${y}-${pad(m)}-${pad(lastDay)}`,
    startMs,
    endMs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat(report): month-window date helper"
```

---

### Task 4: Pure aggregation — summarizeMonth

**Files:**
- Modify: `src/report.ts`
- Modify: `tests/report.test.ts`

**Interfaces:**
- Consumes: `monthWindow` (Task 3), `InstantlyCampaignAnalytics` (Task 2), `ClickUpTask` (from `src/types.ts`).
- Produces:
```typescript
export interface MonthlyReportSummary {
  month: string;
  email: { sent: number; opens: number; replies: number; bounced: number; openRate: number; replyRate: number };
  prospectsReached: number;
  warmHandoffs: number;
  aiSourced: {
    openedThisMonth: number;
    estValueThisMonth: number;         // CAD
    byStage: Record<string, number>;   // status -> count, opened this month
    wonSnapshot: number;               // AI-sourced currently at WON_OPPORTUNITY_STATUS
    wonEstValueSnapshot: number;       // CAD
  };
}
export function summarizeMonth(input: {
  month: string;
  window: MonthWindow;
  analytics: InstantlyCampaignAnalytics[];
  reachedTasks: ClickUpTask[];        // prospects with Outreach Started Date in window
  warmTasks: ClickUpTask[];           // prospects with Last Reply Date in window
  opportunityTasks: ClickUpTask[];    // ALL CRM Leads & Opportunities tasks (any status/date)
  fields: { leadSource: string; estOrderValue: string };
}): MonthlyReportSummary;
```
Rules: an opportunity is AI-sourced when its `leadSource` custom-field value `=== 0`. `estValue` = `Number(estOrderValue value)` or `0` when missing/`NaN`. "Opened this month" = `Number(task.date_created)` in `[startMs, endMs)`. `wonSnapshot` counts AI-sourced tasks whose `status.status === "move to production"` regardless of date. `openRate`/`replyRate` are fractions of `sent` (0 when `sent === 0`).

- [ ] **Step 1: Write the failing test**

Add to `tests/report.test.ts`:
```typescript
import { summarizeMonth } from "../src/report.js";
import type { ClickUpTask } from "../src/types.js";

function oppTask(over: Partial<{ id: string; created: number; status: string; leadSource: number | undefined; est: string | undefined }>): ClickUpTask {
  return {
    id: over.id ?? "o1",
    name: over.id ?? "o1",
    status: { status: over.status ?? "new inquiry" },
    date_created: String(over.created ?? Date.UTC(2026, 6, 10)),
    tags: [],
    custom_fields: [
      { id: "field-lead-source", value: over.leadSource },
      { id: "field-est-order-value", value: over.est },
    ],
  } as unknown as ClickUpTask;
}

describe("summarizeMonth", () => {
  const window = monthWindow("2026-07");
  const fields = { leadSource: "field-lead-source", estOrderValue: "field-est-order-value" };

  it("computes email rates and counts", () => {
    const s = summarizeMonth({
      month: "2026-07", window, fields,
      analytics: [
        { campaignId: "c1", emailsSent: 40, opens: 18, replies: 4, bounced: 1 },
        { campaignId: "c2", emailsSent: 10, opens: 2, replies: 1, bounced: 0 },
      ],
      reachedTasks: [{} as ClickUpTask, {} as ClickUpTask, {} as ClickUpTask],
      warmTasks: [{} as ClickUpTask],
      opportunityTasks: [],
    });
    expect(s.email.sent).toBe(50);
    expect(s.email.opens).toBe(20);
    expect(s.email.replies).toBe(5);
    expect(s.email.bounced).toBe(1);
    expect(s.email.openRate).toBeCloseTo(0.4);
    expect(s.email.replyRate).toBeCloseTo(0.1);
    expect(s.prospectsReached).toBe(3);
    expect(s.warmHandoffs).toBe(1);
  });

  it("attributes only AI-sourced (orderindex 0) opportunities and sums CAD string values", () => {
    const s = summarizeMonth({
      month: "2026-07", window, fields, analytics: [],
      reachedTasks: [], warmTasks: [],
      opportunityTasks: [
        oppTask({ id: "ai-1", leadSource: 0, est: "1500", status: "quote sent" }),
        oppTask({ id: "ai-2", leadSource: 0, est: "500", status: "move to production" }),
        oppTask({ id: "ai-3-noval", leadSource: 0, est: undefined, status: "new inquiry" }),
        oppTask({ id: "referral", leadSource: 2, est: "9999", status: "new inquiry" }),
        oppTask({ id: "ai-old", leadSource: 0, est: "700", status: "new inquiry", created: Date.UTC(2026, 5, 10) }),
      ],
    });
    // opened this month: ai-1, ai-2, ai-3-noval (ai-old is June; referral is not AI)
    expect(s.aiSourced.openedThisMonth).toBe(3);
    expect(s.aiSourced.estValueThisMonth).toBe(2000); // 1500 + 500 + 0
    expect(s.aiSourced.byStage).toEqual({ "quote sent": 1, "move to production": 1, "new inquiry": 1 });
    // won snapshot counts AI-sourced at "move to production" regardless of month: ai-2 only
    expect(s.aiSourced.wonSnapshot).toBe(1);
    expect(s.aiSourced.wonEstValueSnapshot).toBe(500);
  });

  it("reports zero rates when nothing was sent", () => {
    const s = summarizeMonth({
      month: "2026-07", window, fields, analytics: [],
      reachedTasks: [], warmTasks: [], opportunityTasks: [],
    });
    expect(s.email.openRate).toBe(0);
    expect(s.email.replyRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report.test.ts`
Expected: FAIL — `summarizeMonth` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/report.ts`:
```typescript
import type { InstantlyCampaignAnalytics } from "./clients/instantly.js";
import type { ClickUpTask } from "./types.js";

export const AI_OUTREACH_ORDERINDEX = 0;
export const WON_OPPORTUNITY_STATUS = "move to production";

export interface MonthlyReportSummary {
  month: string;
  email: { sent: number; opens: number; replies: number; bounced: number; openRate: number; replyRate: number };
  prospectsReached: number;
  warmHandoffs: number;
  aiSourced: {
    openedThisMonth: number;
    estValueThisMonth: number;
    byStage: Record<string, number>;
    wonSnapshot: number;
    wonEstValueSnapshot: number;
  };
}

function fieldValue(task: ClickUpTask, fieldId: string): unknown {
  return task.custom_fields.find((f) => f.id === fieldId)?.value;
}

function estValue(task: ClickUpTask, fieldId: string): number {
  const n = Number(fieldValue(task, fieldId));
  return Number.isFinite(n) ? n : 0;
}

export function summarizeMonth(input: {
  month: string;
  window: MonthWindow;
  analytics: InstantlyCampaignAnalytics[];
  reachedTasks: ClickUpTask[];
  warmTasks: ClickUpTask[];
  opportunityTasks: ClickUpTask[];
  fields: { leadSource: string; estOrderValue: string };
}): MonthlyReportSummary {
  const { window, analytics, opportunityTasks, fields } = input;

  const sent = analytics.reduce((a, r) => a + r.emailsSent, 0);
  const opens = analytics.reduce((a, r) => a + r.opens, 0);
  const replies = analytics.reduce((a, r) => a + r.replies, 0);
  const bounced = analytics.reduce((a, r) => a + r.bounced, 0);

  const aiSourced = opportunityTasks.filter(
    (t) => fieldValue(t, fields.leadSource) === AI_OUTREACH_ORDERINDEX
  );
  const openedThisMonth = aiSourced.filter((t) => {
    const created = Number(t.date_created);
    return created >= window.startMs && created < window.endMs;
  });
  const byStage: Record<string, number> = {};
  for (const t of openedThisMonth) {
    const s = t.status?.status ?? "unknown";
    byStage[s] = (byStage[s] ?? 0) + 1;
  }
  const won = aiSourced.filter((t) => t.status?.status === WON_OPPORTUNITY_STATUS);

  return {
    month: input.month,
    email: {
      sent, opens, replies, bounced,
      openRate: sent === 0 ? 0 : opens / sent,
      replyRate: sent === 0 ? 0 : replies / sent,
    },
    prospectsReached: input.reachedTasks.length,
    warmHandoffs: input.warmTasks.length,
    aiSourced: {
      openedThisMonth: openedThisMonth.length,
      estValueThisMonth: openedThisMonth.reduce((a, t) => a + estValue(t, fields.estOrderValue), 0),
      byStage,
      wonSnapshot: won.length,
      wonEstValueSnapshot: won.reduce((a, t) => a + estValue(t, fields.estOrderValue), 0),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/report.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat(report): summarizeMonth pure aggregation"
```

---

### Task 5: ClickUp helper — fetch all tasks in a list (any status)

**Files:**
- Modify: `src/clients/clickup.ts`
- Modify: `tests/clients/clickup.test.ts`

**Interfaces:**
- Produces: `ClickUpClient.getAllTasks(listId: string): Promise<ClickUpTask[]>` — pages through `GET /list/{listId}/task?include_closed=true&subtasks=false&page=N` until a page returns fewer than 100 tasks (or `last_page`), returning every task with its `custom_fields`, `status`, and `date_created`. Use this instead of the status-filtered `getTasks` for the opportunities list.

- [ ] **Step 1: Write the failing test**

Look at the existing `getTasks` test in `tests/clients/clickup.test.ts` for the mock-fetch pattern and copy its style. Add:
```typescript
describe("getAllTasks", () => {
  it("pages until a short page and returns all tasks", async () => {
    const page0 = { tasks: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, custom_fields: [], status: { status: "new inquiry" }, date_created: "1" })), last_page: false };
    const page1 = { tasks: [{ id: "t100", custom_fields: [], status: { status: "lost" }, date_created: "2" }], last_page: true };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({}), json: () => Promise.resolve(page0), text: () => Promise.resolve(JSON.stringify(page0)) })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({}), json: () => Promise.resolve(page1), text: () => Promise.resolve(JSON.stringify(page1)) });
    const client = createClickUpClient({ token: "pk_test", rateLimit: 90, fetchFn: mockFetch, logger });

    const tasks = await client.getAllTasks("list_x");

    expect(tasks).toHaveLength(101);
    expect(mockFetch.mock.calls[0][0]).toContain("/list/list_x/task");
    expect(mockFetch.mock.calls[0][0]).toContain("include_closed=true");
    expect(mockFetch.mock.calls[0][0]).toContain("page=0");
    expect(mockFetch.mock.calls[1][0]).toContain("page=1");
  });
});
```
(If the existing ClickUp client test constructs the client differently — e.g. no `fetchFn` injection — mirror whatever `getTasks`'s test does; match the established seam rather than introducing a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clients/clickup.test.ts`
Expected: FAIL — `getAllTasks is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add `getAllTasks(listId: string): Promise<ClickUpTask[]>` to the `ClickUpClient` interface, and implement it in `src/clients/clickup.ts` following how `getTasks` issues requests (reuse its internal request/rate-limit helper). Logic:
```typescript
    async getAllTasks(listId: string): Promise<ClickUpTask[]> {
      const all: ClickUpTask[] = [];
      for (let page = 0; ; page++) {
        const params = new URLSearchParams({
          include_closed: "true",
          subtasks: "false",
          page: String(page),
        });
        const data = (await request("GET", `/list/${listId}/task?${params.toString()}`)) as {
          tasks?: ClickUpTask[];
          last_page?: boolean;
        };
        const batch = data.tasks ?? [];
        all.push(...batch);
        if (data.last_page || batch.length < 100) break;
      }
      return all;
    },
```
(Use the same `request`/auth/rate-limit mechanism the other methods use; do not hand-roll a second fetch path.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/clients/clickup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/clickup.ts tests/clients/clickup.test.ts
git commit -m "feat(report): ClickUp getAllTasks paginated fetch"
```

---

### Task 6: Orchestrator — buildMonthlyReport

**Files:**
- Modify: `src/report.ts`
- Modify: `tests/report.test.ts`

**Interfaces:**
- Consumes: `monthWindow`, `summarizeMonth` (Tasks 3-4); `InstantlyClient` (`listCampaigns`, `getCampaignAnalytics`), `ClickUpClient` (`getAllTasks`), `Config`.
- Produces:
```typescript
export async function buildMonthlyReport(deps: {
  config: Config;
  instantly: InstantlyClient;
  clickup: ClickUpClient;
  logger: Logger;
}, month: string): Promise<MonthlyReportSummary>;
```
Behaviour: (1) `listCampaigns()` and keep those whose `name` matches `^${config.businessName} - .+ - ${month}$`; (2) `getCampaignAnalytics(theirIds, window.startDate, window.endDate)`; (3) `getAllTasks(config.clickupListId)` → split into `reachedTasks` (Outreach Started Date in window) and `warmTasks` (Last Reply Date in window) using the date custom fields; (4) `getAllTasks(config.reportFields.crmLeadsListId)` → `opportunityTasks`; (5) return `summarizeMonth(...)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/report.test.ts` (build minimal mock clients inline, like other suites do):
```typescript
import { buildMonthlyReport } from "../src/report.js";
import { makeSendConfig } from "./helpers.js";

it("buildMonthlyReport wires clients and filters this month's campaigns", async () => {
  const config = { ...makeSendConfig(), businessName: "ShopJaydees",
    reportFields: { crmLeadsListId: "crm", leadSource: "field-lead-source", estOrderValue: "field-est-order-value" } };
  const instantly = {
    listCampaigns: vi.fn().mockResolvedValue([
      { id: "c-jul", name: "ShopJaydees - Business - 2026-07", status: 1 },
      { id: "c-jun", name: "ShopJaydees - Business - 2026-06", status: 1 },
    ]),
    getCampaignAnalytics: vi.fn().mockResolvedValue([
      { campaignId: "c-jul", emailsSent: 20, opens: 8, replies: 2, bounced: 0 },
    ]),
  } as any;
  const outreachField = config.outreachFields.outreachStartedDate;
  const replyField = config.fields.lastReplyDate;
  const clickup = {
    getAllTasks: vi.fn(async (listId: string) => {
      if (listId === config.clickupListId) return [
        { id: "p1", status: { status: "Outreach Active" }, date_created: "1", tags: [], custom_fields: [{ id: outreachField, value: String(Date.UTC(2026,6,10)) }] },
        { id: "p2", status: { status: "Responded - Follow-up" }, date_created: "1", tags: [], custom_fields: [{ id: replyField, value: String(Date.UTC(2026,6,12)) }] },
      ];
      return [{ id: "o1", status: { status: "quote sent" }, date_created: String(Date.UTC(2026,6,11)), tags: [], custom_fields: [{ id: "field-lead-source", value: 0 }, { id: "field-est-order-value", value: "800" }] }];
    }),
  } as any;

  const s = await buildMonthlyReport({ config, instantly, clickup, logger: createLogger("test") }, "2026-07");

  expect(instantly.getCampaignAnalytics).toHaveBeenCalledWith(["c-jul"], "2026-07-01", "2026-07-31");
  expect(s.email.sent).toBe(20);
  expect(s.prospectsReached).toBe(1);
  expect(s.warmHandoffs).toBe(1);
  expect(s.aiSourced.openedThisMonth).toBe(1);
  expect(s.aiSourced.estValueThisMonth).toBe(800);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/report.test.ts`
Expected: FAIL — `buildMonthlyReport` not exported.

- [ ] **Step 3: Write minimal implementation**

Add imports to `src/report.ts` (`Config`, `InstantlyClient`, `ClickUpClient`, `Logger`) and:
```typescript
function dateFieldInWindow(task: ClickUpTask, fieldId: string, w: MonthWindow): boolean {
  const v = task.custom_fields.find((f) => f.id === fieldId)?.value;
  if (v === undefined || v === null || v === "") return false;
  const ms = Number(v);
  return Number.isFinite(ms) && ms >= w.startMs && ms < w.endMs;
}

export async function buildMonthlyReport(
  deps: { config: Config; instantly: InstantlyClient; clickup: ClickUpClient; logger: Logger },
  month: string
): Promise<MonthlyReportSummary> {
  const { config, instantly, clickup } = deps;
  const window = monthWindow(month);

  const campaigns = await instantly.listCampaigns();
  const namePattern = new RegExp(`^${config.businessName} - .+ - ${month}$`);
  const monthCampaignIds = campaigns.filter((c) => namePattern.test(c.name)).map((c) => c.id);
  const analytics = await instantly.getCampaignAnalytics(monthCampaignIds, window.startDate, window.endDate);

  const prospects = await clickup.getAllTasks(config.clickupListId);
  const reachedTasks = prospects.filter((t) => dateFieldInWindow(t, config.outreachFields.outreachStartedDate, window));
  const warmTasks = prospects.filter((t) => dateFieldInWindow(t, config.fields.lastReplyDate, window));

  const opportunityTasks = await clickup.getAllTasks(config.reportFields.crmLeadsListId);

  return summarizeMonth({
    month, window, analytics, reachedTasks, warmTasks, opportunityTasks,
    fields: { leadSource: config.reportFields.leadSource, estOrderValue: config.reportFields.estOrderValue },
  });
}
```
Note: `config.fields.lastReplyDate` must exist on the `ClickUpFieldIds` type. If it is not already present, add `lastReplyDate: string` to that interface in `src/config.ts` and load it from `CLICKUP_FIELD_LAST_REPLY_DATE` (the env var already exists), plus add it to both mock configs in `tests/helpers.ts` as `"field-last-reply-date"`. Fold that into this task's commit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (whole suite), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts src/config.ts tests/report.test.ts tests/helpers.ts
git commit -m "feat(report): buildMonthlyReport orchestrator"
```

---

### Task 7: On-demand runner script

**Files:**
- Create: `scripts/monthly-report.ts`
- Modify: `package.json` (add a `report` script)

**Interfaces:**
- Consumes: `buildMonthlyReport`, `loadConfig`, the client factories, `createLogger`.
- Produces: a CLI that prints the `MonthlyReportSummary` JSON for a month argument (default: previous calendar month), for a human/Cody or the future render step to consume. Read-only.

- [ ] **Step 1: Write the script**

Create `scripts/monthly-report.ts`:
```typescript
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { createInstantlyClient } from "../src/clients/instantly.js";
import { createClickUpClient } from "../src/clients/clickup.js";
import { buildMonthlyReport } from "../src/report.js";

function previousMonth(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; previous month handles Jan rollover
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const month = process.argv[2] ?? previousMonth(new Date());
  const config = loadConfig();
  const logger = createLogger("monthly-report");
  const instantly = createInstantlyClient({ apiKey: config.instantlyApiKey, logger });
  const clickup = createClickUpClient({ token: config.clickupApiToken, rateLimit: config.clickupRateLimit, logger });
  const summary = await buildMonthlyReport({ config, instantly, clickup, logger }, month);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:
```json
    "report": "tsx scripts/monthly-report.ts",
```
If `tsx` is not a dependency, use the project's existing TS-run approach instead (check how other `scripts/*.ts` are run — e.g. `spike-emails.ts`; mirror that invocation rather than adding a new tool).

- [ ] **Step 3: Build and smoke-test against live July data (read-only)**

Run: `npm run build && node dist/../scripts/... ` — actually run via the same mechanism the script step chose, e.g.:
Run: `npx tsx scripts/monthly-report.ts 2026-07`
Expected: prints a JSON summary. With current data it should show `email.sent: 2`, `prospectsReached: 2` (Monark + Blue Pine have Outreach Started Date in July), `warmHandoffs` matching any July Last Reply Dates, and `aiSourced.openedThisMonth: 0` (no AI-Outreach-tagged opportunities exist yet). Confirm no thrown errors and the shape matches `MonthlyReportSummary`.

- [ ] **Step 4: Commit**

```bash
git add scripts/monthly-report.ts package.json
git commit -m "feat(report): on-demand monthly-report runner script"
```

---

## Self-Review

**Spec coverage:** The spec's data-source table maps to Tasks 2 (Instantly sends/opens/replies/bounces), 5-6 (ClickUp prospects reached + warm handoffs; opportunities), 4 (AI-sourced attribution via Lead Source orderindex 0 + Est Order Value; won snapshot). The report *contents/sections/PDF/Gmail* (spec §"Report contents" and "Production model" steps 2-3) are deliberately **out of scope for this plan** — this is the metrics-pull only (Plan 1); rendering + draft is Plan 2. Dependencies (open-tracking enablement, Lead Source hygiene) are operational, not code.

**Placeholder scan:** No TBD/TODO. Two tasks (5, 7) say "mirror the existing pattern" for the client fetch seam and the TS-run tool — that is a deliberate instruction to match established code, not a content gap; the logic and code are fully specified.

**Type consistency:** `MonthlyReportSummary`, `InstantlyCampaignAnalytics`, `summarizeMonth`, `buildMonthlyReport`, `monthWindow`, `getAllTasks`, `getCampaignAnalytics` are used with identical names/signatures across tasks. `AI_OUTREACH_ORDERINDEX = 0` and `WON_OPPORTUNITY_STATUS = "move to production"` are defined once (Task 4) and reused.

**Known v1 limitations (documented, acceptable):** `wonSnapshot` is a current-state snapshot (AI-sourced opps at "move to production"), not "won *this month*", because opportunity status-change dates require the time-in-status endpoint; revisit if month-attribution of wins is needed. Realized value uses `Est Order Value` (estimate), per the spec's caveat.
