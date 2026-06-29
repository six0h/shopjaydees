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
