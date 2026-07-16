import type { InstantlyCampaignAnalytics } from "./clients/instantly.js";
import type { ClickUpTask } from "./types.js";

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
