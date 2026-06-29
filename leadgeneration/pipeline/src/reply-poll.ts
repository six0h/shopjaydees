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
