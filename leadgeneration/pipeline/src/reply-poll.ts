import type { InstantlyRawEmail } from "./clients/instantly.js";
import { InstantlyApiError } from "./clients/instantly.js";
import type { Config } from "./config.js";
import type { ClickUpClient } from "./clients/clickup.js";
import type { InstantlyClient } from "./clients/instantly.js";
import type { GeminiClient, ReplyInterest } from "./clients/gemini.js";
import type { ClickUpTask, ProspectStatus } from "./types.js";
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
  gemini: GeminiClient;
  alerter: Alerter;
  logger: Logger;
}

export interface ReplyPollRunResult {
  runId: string;
  timestamp: string;
  campaignsPolled: number;
  emailsScanned: number;
  repliesFlagged: number;
  repliesDeclined: number;
  autoRepliesTagged: number;
  bounced: number;
  noMatch: number;
  dormant: number;
  errors: number;
}

export function isSequenceComplete(task: ClickUpTask, config: Config, now: Date): boolean {
  if (statusOf(task) !== normStatus("Outreach Active")) return false;
  const field = task.custom_fields.find((f) => f.id === config.outreachFields.outreachStartedDate);
  if (!field?.value) return false;
  const started = parseInt(String(field.value), 10);
  if (Number.isNaN(started)) return false;
  const ageMs = now.getTime() - started;
  return ageMs >= config.sequenceCompleteAfterDays * 24 * 60 * 60 * 1000;
}

// Typed against ProspectStatus so a status that does not exist on the ClickUp
// Leads list is a compile error, not a silent no-op. "Responded - Owner
// Follow-up" was neither a real status nor a real union member: the write was
// dropped and this set never matched, so every poll re-flagged the same lead.
const RESPONDED_STATUS: ProspectStatus = "Responded - Follow-up";

// The ClickUp v2 API returns status names LOWERCASED (e.g. "responded - follow-up"),
// while our constants are title-case for readable writes (writes are case-insensitive).
// Every status READ must be normalized before comparison, or these guards silently
// never match — which re-flagged the same reply on every 20-minute poll, spamming the
// client with a duplicate "Reply received" comment + owner re-assignment each time.
function normStatus(s: string): string {
  return s.toLowerCase();
}

const CLOSED_STATUSES: ReadonlySet<string> = new Set(
  (["Won", "Lost", "Unsubscribed", "Bounced"] satisfies ProspectStatus[]).map(normStatus)
);
const TERMINAL_FOR_REPLY: ReadonlySet<string> = new Set(
  ([RESPONDED_STATUS, "Won", "Lost", "Unsubscribed", "Bounced"] satisfies ProspectStatus[]).map(
    normStatus
  )
);

function statusOf(task: ClickUpTask): string {
  // Normalized (lowercased) for comparison — never written back to ClickUp.
  return normStatus(task.status?.status ?? "");
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
    repliesDeclined: 0,
    autoRepliesTagged: 0,
    bounced: 0,
    noMatch: 0,
    dormant: 0,
    errors: 0,
  };

  // Fix 3: track leads touched in Phase A to prevent Phase B from clobbering them.
  const touchedInPhaseA = new Set<string>();

  // ---- Phase A: email events ----

  // Fix 1: listCampaigns in its own try/catch — a failure here alerts and skips Phase A's loop.
  let campaigns: Awaited<ReturnType<typeof instantly.listCampaigns>> = [];
  try {
    campaigns = await instantly.listCampaigns();
  } catch (err) {
    result.errors += 1;
    const msg = err instanceof Error ? err.message : String(err);
    logger.critical("Reply-poll Phase A: listCampaigns failed", { error: msg });
    await alerter.send("Reply-poll agent error (Instantly polling)", msg);
    // campaigns stays [] — skip the campaign loop below; Phase B still runs.
  }

  // Fix 1: per-campaign try/catch so one campaign's failure does not abort the others.
  for (const campaign of campaigns) {
    result.campaignsPolled += 1;
    try {
      // Fix 2: pagination page cap to prevent infinite loop on non-advancing cursor.
      const MAX_PAGES = 50;
      let pageCount = 0;
      let cursor: string | undefined;
      do {
        pageCount += 1;
        if (pageCount > MAX_PAGES) {
          logger.warn("Pagination cap reached — stopping poll for this campaign", { campaign, MAX_PAGES });
          break;
        }
        const page = await instantly.listEmails(campaign.id, { startingAfter: cursor, limit: 100 });
        for (const raw of page.items) {
          result.emailsScanned += 1;
          try {
            const signal = classifyEmail(normalizeEmail(raw, config.instantlySendingDomains));
            if (signal.kind === "ignore") continue;
            await applySignal(deps, signal, result, touchedInPhaseA);
          } catch (itemErr) {
            result.errors += 1;
            logger.warn("Reply-poll item failed", {
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
          }
        }
        cursor = page.nextStartingAfter ?? undefined;
      } while (cursor);
    } catch (err) {
      result.errors += 1;
      if (err instanceof InstantlyApiError && err.code === 429) {
        // 429 is expected/transient — warn and stop polling campaigns this run; do NOT alert.
        logger.warn("Instantly rate limited — will retry next run", { campaign });
        break; // stop all remaining campaigns this run
      } else {
        logger.error("Campaign poll failed", {
          campaign,
          error: err instanceof Error ? err.message : String(err),
        });
        // continue to next campaign
      }
    }
  }

  // ---- Phase B: time-based completion sweep ----
  try {
    // Fix 4: destructure clickup from deps.
    const { clickup } = deps;
    const active = await clickup.getTasks(config.clickupListId, { statuses: ["Outreach Active"] });
    for (const task of active) {
      // Fix 3: skip leads already touched in Phase A ("reply wins" race guard).
      if (touchedInPhaseA.has(task.id)) continue;
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

  logger.info("Reply-poll complete", { ...result });
  return result;
}

async function applySignal(
  deps: ReplyPollDeps,
  signal: Exclude<EmailSignal, { kind: "ignore" }>,
  result: ReplyPollRunResult,
  touchedInPhaseA: Set<string>
): Promise<void> {
  const { config, clickup, gemini, logger } = deps;
  const task = await findTaskByEmail(deps, signal.leadEmail);
  if (!task) {
    result.noMatch += 1;
    logger.info("No ClickUp task for lead", { email: signal.leadEmail });
    return;
  }
  const status = statusOf(task);

  if (signal.kind === "reply") {
    if (TERMINAL_FOR_REPLY.has(status)) return;
    // Fix 3: mark as touched before any write so Phase B skips this lead even on dry-run.
    touchedInPhaseA.add(task.id);

    // Classify the reply's interest so a decline is not recorded as a warm lead.
    const classification = await gemini.classifyReplyInterest({
      subject: signal.subject,
      snippet: signal.snippet,
    });
    if (classification.error) {
      // Fail safe: an unclassifiable reply is flagged warm for a human to judge,
      // never silently dropped.
      logger.warn("Reply interest classification failed — treating as warm", {
        email: signal.leadEmail,
        error: classification.error,
      });
    }
    const interest: ReplyInterest = classification.interest ?? "neutral";

    // A subtle out-of-office the subject-line regex missed: tag, do not flag.
    if (interest === "out_of_office") {
      if (!config.dryRun) {
        await clickup.addTag(task.id, "auto-reply");
        await clickup.addComment(task.id, `Auto-reply: ${signal.snippet}`);
      }
      result.autoRepliesTagged += 1;
      return;
    }

    const declined = interest === "not_interested" || interest === "wrong_person";
    const newStatus: ProspectStatus = declined ? "Lost" : RESPONDED_STATUS;

    if (!config.dryRun) {
      const update: {
        status: string;
        custom_fields: Array<{ id: string; value: unknown }>;
        assignees?: { add?: number[]; rem?: number[] };
      } = {
        status: newStatus,
        custom_fields: [{ id: config.outreachFields.lastReplyDate, value: Date.now() }],
      };
      // Only genuine interest becomes a warm handoff assigned to the owner.
      if (!declined) update.assignees = { add: [config.ownerUserId] };
      await clickup.updateTask(task.id, update);
      await clickup.addTag(task.id, `interest:${interest}`);
      await clickup.addComment(
        task.id,
        `Reply received (${interest}) — ${signal.subject}\n\n${signal.snippet}`
      );
    }
    if (declined) {
      result.repliesDeclined += 1;
    } else {
      result.repliesFlagged += 1;
    }
  } else if (signal.kind === "auto_reply") {
    if (task.tags.some((t) => t.name === "auto-reply")) return;
    if (!config.dryRun) {
      await clickup.addTag(task.id, "auto-reply");
      await clickup.addComment(task.id, `Auto-reply: ${signal.snippet}`);
    }
    result.autoRepliesTagged += 1;
  } else if (signal.kind === "bounce") {
    if (CLOSED_STATUSES.has(status)) return;
    // Fix 3: mark as touched so Phase B skips this lead.
    touchedInPhaseA.add(task.id);
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
