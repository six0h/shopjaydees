import type { InstantlyRawEmail } from "./clients/instantly.js";
import type { Config } from "./config.js";
import type { ClickUpClient } from "./clients/clickup.js";
import type { InstantlyClient } from "./clients/instantly.js";
import type { ClickUpTask } from "./types.js";
import type { Alerter } from "./alerting.js";
import type { Logger } from "./logger.js";

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
const AUTO_REPLY_RE = /(out of office|automatic reply|auto-?reply|on vacation|away from (the |my )?(office|desk))/i;
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
  // Outbound: use first recipient — safe because outbound emails are classified as `ignore` downstream, so this value is never consumed.
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

// ---------------------------------------------------------------------------
// Phase A orchestrator — Instantly email events → ClickUp
// ---------------------------------------------------------------------------

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
  "Responded - Owner Follow-up",
  "Won",
  "Lost",
  "Unsubscribed",
  "Bounced",
]);

function statusOf(task: ClickUpTask): string {
  return task.status?.status ?? "";
}

async function findTaskByEmail(
  deps: ReplyPollDeps,
  email: string
): Promise<ClickUpTask | null> {
  const tasks = await deps.clickup.getTasks(deps.config.clickupListId, {
    customFields: [{ field_id: deps.config.fields.contactEmail, operator: "=", value: email }],
    includeClosed: true,
  });
  return tasks[0] ?? null;
}

export async function runReplyPoll(deps: ReplyPollDeps): Promise<ReplyPollRunResult> {
  const { config, instantly, alerter, logger } = deps;
  const now = new Date();
  const runId = `reply-poll-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  const result: ReplyPollRunResult = {
    runId,
    timestamp: now.toISOString(),
    campaignsPolled: 0,
    emailsScanned: 0,
    repliesFlagged: 0,
    autoRepliesTagged: 0,
    bounced: 0,
    noMatch: 0,
    dormant: 0,
    errors: 0,
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
            logger.warn("Reply-poll item failed", {
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
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
  deps: ReplyPollDeps,
  signal: Exclude<EmailSignal, { kind: "ignore" }>,
  result: ReplyPollRunResult
): Promise<void> {
  const { config, clickup, logger } = deps;
  const task = await findTaskByEmail(deps, signal.leadEmail);
  if (!task) {
    result.noMatch += 1;
    logger.info("No ClickUp task for lead", { email: signal.leadEmail });
    return;
  }
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
      // NOTE: bounce reconciliation depends on the bounced lead's address being recoverable from
      // the /emails payload. For mail-daemon bounces, `leadEmail` is the daemon address, so
      // `findTaskByEmail` above returns null and execution never reaches here — these bounces
      // currently land in `noMatch`. Revisit during Task 9 live validation once the real
      // Instantly /emails bounce shape is confirmed.
      await clickup.updateTask(task.id, { status: "Bounced" });
      await clickup.addTag(task.id, "bounced");
    }
    result.bounced += 1;
  }
}
