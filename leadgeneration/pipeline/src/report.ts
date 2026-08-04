import type { InstantlyCampaignAnalytics, InstantlyClient } from "./clients/instantly.js";
import type { ClickUpClient } from "./clients/clickup.js";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
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

// The interest labels the reply-poll agent writes as `interest:<label>` tags.
// "unknown" covers replies from before interest tagging shipped, or a tag we
// don't recognize.
export const REPLY_INTEREST_LABELS = [
  "interested",
  "not_interested",
  "wrong_person",
  "out_of_office",
  "neutral",
] as const;
export type ReplyInterestLabel = (typeof REPLY_INTEREST_LABELS)[number];
export type ReplyBreakdown = Record<ReplyInterestLabel | "unknown", number>;

/** Read the interest:<label> tag a replied prospect carries; "unknown" if none. */
export function interestOf(task: ClickUpTask): ReplyInterestLabel | "unknown" {
  const tag = task.tags?.find((t) => t.name?.startsWith("interest:"));
  if (!tag) return "unknown";
  const label = tag.name.slice("interest:".length);
  return (REPLY_INTEREST_LABELS as readonly string[]).includes(label)
    ? (label as ReplyInterestLabel)
    : "unknown";
}

export interface MonthlyReportSummary {
  month: string;
  email: { sent: number; opens: number; replies: number; bounced: number; openRate: number; replyRate: number };
  prospectsReached: number;
  warmHandoffs: number;
  repliesThisMonth: number;
  replyBreakdown: ReplyBreakdown;
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
  replierTasks: ClickUpTask[];
  opportunityTasks: ClickUpTask[];
  fields: { leadSource: string; estOrderValue: string };
}): MonthlyReportSummary {
  const { window, analytics, replierTasks, opportunityTasks, fields } = input;

  const sent = analytics.reduce((a, r) => a + r.emailsSent, 0);
  const opens = analytics.reduce((a, r) => a + r.opens, 0);
  const replies = analytics.reduce((a, r) => a + r.replies, 0);
  const bounced = analytics.reduce((a, r) => a + r.bounced, 0);

  // Break this month's replies down by the interest the reply-poll agent tagged.
  // Only genuine interest is a warm handoff — a decline is not a warm lead.
  const replyBreakdown: ReplyBreakdown = {
    interested: 0,
    not_interested: 0,
    wrong_person: 0,
    out_of_office: 0,
    neutral: 0,
    unknown: 0,
  };
  for (const t of replierTasks) replyBreakdown[interestOf(t)] += 1;

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
    warmHandoffs: replyBreakdown.interested,
    repliesThisMonth: replierTasks.length,
    replyBreakdown,
    aiSourced: {
      openedThisMonth: openedThisMonth.length,
      estValueThisMonth: openedThisMonth.reduce((a, t) => a + estValue(t, fields.estOrderValue), 0),
      byStage,
      wonSnapshot: won.length,
      wonEstValueSnapshot: won.reduce((a, t) => a + estValue(t, fields.estOrderValue), 0),
    },
  };
}

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

  const campaigns = await instantly.listAllCampaigns();
  const namePattern = new RegExp(`^${config.businessName} - .+ - ${month}$`);
  const monthCampaignIds = campaigns.filter((c) => namePattern.test(c.name)).map((c) => c.id);
  const analytics = await instantly.getCampaignAnalytics(monthCampaignIds, window.startDate, window.endDate);

  const prospects = await clickup.getAllTasks(config.clickupListId);
  const reachedTasks = prospects.filter((t) => dateFieldInWindow(t, config.outreachFields.outreachStartedDate, window));
  // Every prospect that replied this month (warm or not); interest is read per-task.
  const replierTasks = prospects.filter((t) => dateFieldInWindow(t, config.outreachFields.lastReplyDate, window));

  const opportunityTasks = await clickup.getAllTasks(config.reportFields.crmLeadsListId);

  return summarizeMonth({
    month,
    window,
    analytics,
    reachedTasks,
    replierTasks,
    opportunityTasks,
    fields: { leadSource: config.reportFields.leadSource, estOrderValue: config.reportFields.estOrderValue },
  });
}
