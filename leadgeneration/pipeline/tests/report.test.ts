import { describe, it, expect, vi } from "vitest";
import { monthWindow, summarizeMonth, buildMonthlyReport } from "../src/report.js";
import { createLogger } from "../src/logger.js";
import { makeSendConfig } from "./helpers.js";
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

describe("buildMonthlyReport", () => {
  it("wires clients and filters this month's campaigns", async () => {
    const config = {
      ...makeSendConfig(),
      businessName: "ShopJaydees",
      reportFields: { crmLeadsListId: "crm", leadSource: "field-lead-source", estOrderValue: "field-est-order-value" },
    };
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
    const replyField = config.outreachFields.lastReplyDate;
    const clickup = {
      getAllTasks: vi.fn(async (listId: string) => {
        if (listId === config.clickupListId) return [
          { id: "p1", status: { status: "Outreach Active" }, date_created: "1", tags: [], custom_fields: [{ id: outreachField, value: String(Date.UTC(2026, 6, 10)) }] },
          { id: "p2", status: { status: "Responded - Follow-up" }, date_created: "1", tags: [], custom_fields: [{ id: replyField, value: String(Date.UTC(2026, 6, 12)) }] },
        ];
        return [{ id: "o1", status: { status: "quote sent" }, date_created: String(Date.UTC(2026, 6, 11)), tags: [], custom_fields: [{ id: "field-lead-source", value: 0 }, { id: "field-est-order-value", value: "800" }] }];
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
});
