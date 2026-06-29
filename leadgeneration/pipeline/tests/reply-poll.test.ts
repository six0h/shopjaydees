import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { InstantlyClient } from "../src/clients/instantly.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { normalizeEmail, classifyEmail, runReplyPoll } from "../src/reply-poll.js";
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
// runReplyPoll — Phase A
// ---------------------------------------------------------------------------

describe("runReplyPoll — Phase A", () => {
  it("flags a genuine reply: Responded + assign + last-reply date + comment", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    (clickup.getTasks as Mock).mockResolvedValue([
      makeOutreachActiveLeadTask({
        id: "lead_1",
        email: "mike@acme.ca",
        contactEmailFieldId: config.fields.contactEmail,
        outreachStartedFieldId: config.outreachFields.outreachStartedDate,
      }),
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
      makeOutreachActiveLeadTask({
        id: "lead_1",
        email: "mike@acme.ca",
        status: "Responded - Owner Follow-up",
        contactEmailFieldId: config.fields.contactEmail,
      }),
    ]);
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
    (clickup.getTasks as Mock).mockResolvedValue([
      makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail }),
    ]);
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
    (clickup.getTasks as Mock).mockResolvedValue([task]);
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
    (clickup.getTasks as Mock).mockResolvedValue([
      makeOutreachActiveLeadTask({ id: "lead_1", email: "mike@acme.ca", contactEmailFieldId: config.fields.contactEmail }),
    ]);
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

  it("Instantly failure alerts and surfaces an error", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const instantly = makeMockInstantly();
    (instantly.listCampaigns as Mock).mockResolvedValue([{ id: "camp_1", name: "Business - 2026-06", status: "active" }]);
    (instantly.listEmails as Mock).mockRejectedValue(new Error("Instantly API 503 Service Unavailable"));

    const result = await runReplyPoll({ config, clickup, instantly, alerter, logger: createLogger("test") });

    expect(alerter.send).toHaveBeenCalled();
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });
});
