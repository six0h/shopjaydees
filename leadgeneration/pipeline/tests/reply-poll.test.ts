import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { InstantlyClient } from "../src/clients/instantly.js";
import { InstantlyApiError } from "../src/clients/instantly.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { normalizeEmail, classifyEmail, runReplyPoll, isSequenceComplete } from "../src/reply-poll.js";
import { makeOutreachActiveLeadTask, makeSendConfig } from "./helpers.js";

const DOMAINS = ["shopjaydees.ca", "shopjaydees.net"];

vi.spyOn(console, "log").mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Local mock factories
// ---------------------------------------------------------------------------

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({
      id: "new_task",
      name: "Test",
      status: { status: "Enriched" },
      date_created: String(Date.now()),
      date_updated: String(Date.now()),
      custom_fields: [],
      tags: [],
    }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([]),
  };
}

function makeMockInstantly(): InstantlyClient {
  return {
    listCampaigns: vi.fn().mockResolvedValue([]),
    createCampaign: vi.fn().mockResolvedValue({ id: "camp_new_001", name: "Business - 2026-06", status: "active" }),
    addLeadToCampaign: vi.fn().mockResolvedValue({ upload_id: "upload_001", leads_uploaded: 1, leads_skipped: 0 }),
    listEmails: vi.fn().mockResolvedValue({ items: [], nextStartingAfter: null }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

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

  it("does NOT flag genuine reply about moving away from a vendor as auto-reply", () => {
    const n = normalizeEmail(
      { from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "moving away from our old vendor" },
      DOMAINS
    );
    expect(n.isAutoReply).toBe(false);
  });

  it("flags 'away from the office' subject as auto-reply", () => {
    const n = normalizeEmail(
      { from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Away from the office until Monday" },
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

// ---------------------------------------------------------------------------
// classifyEmail
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// isSequenceComplete
// ---------------------------------------------------------------------------

describe("isSequenceComplete", () => {
  const config = makeSendConfig();
  const now = new Date();

  it("returns false when status is NOT 'Outreach Active' (even with old start date)", () => {
    const task = makeOutreachActiveLeadTask({
      status: "Responded - Follow-up",
      startedDaysAgo: 20,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });
    expect(isSequenceComplete(task, config, now)).toBe(false);
  });

  it("returns false when 'Outreach Active' but outreachStartedDate field is absent", () => {
    // Pass a wrong field id so the field on the task doesn't match config.outreachFields.outreachStartedDate
    const task = makeOutreachActiveLeadTask({ outreachStartedFieldId: "wrong-field-id", startedDaysAgo: 20 });
    expect(isSequenceComplete(task, config, now)).toBe(false);
  });

  it("returns false when outreachStartedDate value is non-numeric", () => {
    const base = makeOutreachActiveLeadTask({ outreachStartedFieldId: config.outreachFields.outreachStartedDate });
    const task = {
      ...base,
      custom_fields: base.custom_fields.map((f) =>
        f.id === config.outreachFields.outreachStartedDate ? { ...f, value: "not-a-date" } : f
      ),
    };
    expect(isSequenceComplete(task, config, now)).toBe(false);
  });

  it("returns false when start date is within the threshold (3 days ago)", () => {
    const task = makeOutreachActiveLeadTask({
      startedDaysAgo: 3,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });
    expect(isSequenceComplete(task, config, now)).toBe(false);
  });

  it("returns true when start date is past the threshold (20 days ago)", () => {
    const task = makeOutreachActiveLeadTask({
      startedDaysAgo: 20,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });
    expect(isSequenceComplete(task, config, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runReplyPoll — Phase A
// ---------------------------------------------------------------------------

describe("runReplyPoll — Phase A", () => {
  it("flags a genuine reply: Responded + assign + last-reply date + comment", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const theLead = makeOutreachActiveLeadTask({
      id: "lead_1",
      email: "mike@acme.ca",
      contactEmailFieldId: config.fields.contactEmail,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([theLead]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{ from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re: hi", body: { text: "Yes, send pricing" } }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    const upd = (clickup.updateTask as Mock).mock.calls.find((c) => c[0] === "lead_1")![1];
    expect(upd.status).toBe("Responded - Follow-up");
    expect(upd.assignees).toEqual({ add: [config.ownerUserId] });
    expect(upd.custom_fields.find((f: { id: string }) => f.id === config.outreachFields.lastReplyDate)).toBeDefined();
    expect(clickup.addComment).toHaveBeenCalledWith("lead_1", expect.stringContaining("Yes, send pricing"));
    expect(result.repliesFlagged).toBe(1);
  });

  it("is idempotent: a reply on an already-Responded lead does nothing", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const theLead = makeOutreachActiveLeadTask({
      id: "lead_1",
      email: "mike@acme.ca",
      status: "Responded - Follow-up",
      contactEmailFieldId: config.fields.contactEmail,
    });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([theLead]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "c", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{ from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re", body: { text: "again" } }],
      nextStartingAfter: null,
    });

    await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(clickup.addComment).not.toHaveBeenCalled();
  });

  it("auto-reply only tags and comments, no status change", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const theLead = makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([theLead]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{
        from_address_email: "mike@acme.ca",
        to_address_email_list: "ellie@shopjaydees.ca",
        subject: "Out of office",
        body: { text: "I am out of office until Monday" },
      }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    expect(clickup.addTag).toHaveBeenCalledWith("lead_1", "auto-reply");
    expect(clickup.addComment).toHaveBeenCalledWith("lead_1", expect.stringContaining("I am out of office until Monday"));
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(result.autoRepliesTagged).toBe(1);
    expect(result.repliesFlagged).toBe(0);
  });

  it("auto-reply is idempotent: already-tagged task gets no addTag or addComment", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    // Task already has the auto-reply tag — the guard in applySignal returns early.
    const task = {
      ...makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail }),
      tags: [{ name: "auto-reply" }],
    };
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([task]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{
        from_address_email: "mike@acme.ca",
        to_address_email_list: "ellie@shopjaydees.ca",
        subject: "Out of office",
        body: { text: "I am out of office until next week" },
      }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    expect(clickup.addTag).not.toHaveBeenCalled();
    expect(clickup.addComment).not.toHaveBeenCalled();
    expect(result.autoRepliesTagged).toBe(0);
  });

  it("bounce from mail-daemon currently lands in noMatch (lead identity unresolved — pending Task 9 live validation)", async () => {
    // findTaskByEmail is called with MAILER-DAEMON@... as the email because normalizeEmail
    // sets leadEmail = from for inbound. The daemon address never matches a real lead task,
    // so the lookup returns [] and the signal falls through to noMatch. The Bounced branch in
    // applySignal is only reachable if a future Instantly payload carries the real lead address
    // instead — validate this during Task 9 live-traffic review.
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    // Email lookup for the daemon address finds nothing — mirrors production behavior.
    (clickup.getTasks as Mock).mockResolvedValue([]);
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{
        from_address_email: "MAILER-DAEMON@googlemail.com",
        to_address_email_list: "ellie@shopjaydees.ca",
        subject: "Delivery Status Notification (Failure)",
        body: { text: "Your message to mike@acme.ca could not be delivered." },
      }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(result.bounced).toBe(0);
    expect(result.noMatch).toBe(1);
  });

  it("no matching task -> counted in noMatch, no writes", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    (clickup.getTasks as Mock).mockResolvedValue([]); // no task found for this email
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{ from_address_email: "unknown@nowhere.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re: hey", body: { text: "Hi there" } }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    expect(result.noMatch).toBe(1);
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(clickup.addComment).not.toHaveBeenCalled();
    expect(clickup.addTag).not.toHaveBeenCalled();
  });

  it("dry run performs no writes", async () => {
    const config = { ...makeSendConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const theLead = makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([theLead]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{ from_address_email: "mike@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re: hi", body: { text: "I am interested in your products" } }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });

    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(clickup.addComment).not.toHaveBeenCalled();
    expect(clickup.addTag).not.toHaveBeenCalled();
    expect(result.repliesFlagged).toBe(1); // counter still increments in dry-run
  });

  // UPDATED (was: "Instantly failure alerts and surfaces an error")
  // With per-campaign isolation, listEmails failures do NOT alert — only listCampaigns failure does.
  it("listCampaigns failure alerts and surfaces an error", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockRejectedValue(new Error("Instantly API 503 Service Unavailable"));

    const result = await runReplyPoll({ config, clickup, instantly, alerter, logger: createLogger("test") });

    expect(alerter.send).toHaveBeenCalled();
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });

  // ADDED: per-campaign isolation — first campaign fails, second still processes its reply
  it("per-campaign isolation: first campaign error does not abort second campaign", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const theLead = makeOutreachActiveLeadTask({
      id: "lead_2",
      email: "jane@corp.ca",
      contactEmailFieldId: config.fields.contactEmail,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });
    // Phase A email lookups find the lead; Phase B sweep finds nothing.
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.customFields ? Promise.resolve([theLead]) : Promise.resolve([])
    );
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([
      { id: "camp_1", name: "Camp 1", status: "active" },
      { id: "camp_2", name: "Camp 2", status: "active" },
    ]);
    // First campaign's listEmails throws a non-429 error; second returns a reply.
    (instantly.listEmails as Mock)
      .mockRejectedValueOnce(new Error("Network error for camp_1"))
      .mockResolvedValueOnce({
        items: [{ from_address_email: "jane@corp.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "Re: your email", body: { text: "Sounds great" } }],
        nextStartingAfter: null,
      });

    const result = await runReplyPoll({ config, clickup, instantly, alerter, logger: createLogger("test") });

    // Second campaign's reply was still processed.
    expect(result.repliesFlagged).toBeGreaterThanOrEqual(1);
    // First campaign's error was counted.
    expect(result.errors).toBeGreaterThanOrEqual(1);
    // Non-429 campaign errors do NOT alert.
    expect(alerter.send).not.toHaveBeenCalled();
  });

  // ADDED: 429 rate-limit handling — stops campaigns, warns, does NOT alert
  it("429 from listEmails: stops campaigns, warns, does NOT alert", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Camp 1", status: "active" }]);
    (instantly.listEmails as Mock).mockRejectedValue(new InstantlyApiError("rate limit", 429));

    const result = await runReplyPoll({ config, clickup, instantly, alerter, logger: createLogger("test") });

    expect(alerter.send).not.toHaveBeenCalled();
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });

  // ADDED: Phase A/B race guard — a lead replied in Phase A must NOT be swept to Dormant in Phase B
  it("reply-wins race: lead replied in Phase A is skipped by Phase B dormant sweep", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();

    // The lead is Outreach Active and stale (20 days) — Phase B would normally sweep it to Dormant.
    // But Phase A will process a reply from it first, adding it to touchedInPhaseA.
    const staleLead = makeOutreachActiveLeadTask({
      id: "lead_race",
      email: "race@acme.ca",
      startedDaysAgo: 20,
      contactEmailFieldId: config.fields.contactEmail,
      outreachStartedFieldId: config.outreachFields.outreachStartedDate,
    });

    // Both Phase A's email-lookup (customFields) and Phase B's sweep query (statuses) return the
    // same stale lead — simulating ClickUp read-after-write staleness where Phase B's getTasks
    // query returns the pre-update "Outreach Active" status even after Phase A already replied.
    (clickup.getTasks as Mock).mockImplementation(() => Promise.resolve([staleLead]));

    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Camp 1", status: "active" }]);
    (instantly.listEmails as Mock).mockResolvedValue({
      items: [{ from_address_email: "race@acme.ca", to_address_email_list: "ellie@shopjaydees.ca", subject: "I'm interested", body: { text: "Let's talk" } }],
      nextStartingAfter: null,
    });

    const result = await runReplyPoll({ config, clickup, instantly, alerter, logger: createLogger("test") });

    // Phase A should have flagged the reply.
    expect(result.repliesFlagged).toBe(1);

    // Phase B must NOT have swept this lead to Dormant.
    const dormantCalls = (clickup.updateTask as Mock).mock.calls.filter(
      (c) => c[0] === "lead_race" && c[1]?.status === "Dormant"
    );
    expect(dormantCalls).toHaveLength(0);
    expect(result.dormant).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runReplyPoll — Phase B sweep
// ---------------------------------------------------------------------------

describe("runReplyPoll — Phase B sweep", () => {
  it("moves an Outreach Active lead past the threshold to Dormant with +90d reactivation", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([]); // skip Phase A
    const staleLead = makeOutreachActiveLeadTask({ id: "old_1", startedDaysAgo: 20, outreachStartedFieldId: config.outreachFields.outreachStartedDate });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.statuses?.includes("Outreach Active") ? Promise.resolve([staleLead]) : Promise.resolve([])
    );
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
    const freshLead = makeOutreachActiveLeadTask({ id: "fresh_1", startedDaysAgo: 3, outreachStartedFieldId: config.outreachFields.outreachStartedDate });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.statuses?.includes("Outreach Active") ? Promise.resolve([freshLead]) : Promise.resolve([])
    );
    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(result.dormant).toBe(0);
  });

  it("dry run: dormant counter increments but updateTask is NOT called", async () => {
    const config = { ...makeSendConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([]); // skip Phase A
    const staleLead = makeOutreachActiveLeadTask({ startedDaysAgo: 20, outreachStartedFieldId: config.outreachFields.outreachStartedDate });
    (clickup.getTasks as Mock).mockImplementation((_listId, opts) =>
      opts?.statuses?.includes("Outreach Active") ? Promise.resolve([staleLead]) : Promise.resolve([])
    );
    const result = await runReplyPoll({ config, clickup, instantly, alerter: makeMockAlerter(), logger: createLogger("test") });
    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(result.dormant).toBe(1);
  });
});
