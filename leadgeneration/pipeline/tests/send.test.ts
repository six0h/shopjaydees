import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { InstantlyClient } from "../src/clients/instantly.js";
import { InstantlyApiError } from "../src/clients/instantly.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runSend, extractSendData, getSegmentLabel, buildCampaignName, buildOutreachSequences } from "../src/index.js";
import { makeApprovedLeadTask, makeSendConfig } from "./helpers.js";
import type { Config } from "../src/config.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([
      {
        id: "field-sending-domain",
        name: "Sending Domain",
        type: "drop_down",
        type_config: {
          options: [
            { name: "shopjaydees.ca", orderindex: 0 },
            { name: "shopjaydees.net", orderindex: 1 },
          ],
        },
      },
      {
        id: "field-seq-status",
        name: "Sequence Status",
        type: "drop_down",
        type_config: {
          options: [
            { name: "Not Started", orderindex: 0 },
            { name: "Touch 1 Sent", orderindex: 1 },
          ],
        },
      },
    ]),
  };
}

function makeMockInstantly(): InstantlyClient {
  return {
    listCampaigns: vi.fn().mockResolvedValue([]),
    createCampaign: vi.fn().mockResolvedValue({
      id: "camp_new_001",
      name: "Business - 2026-06",
      status: "draft",
    }),
    activateCampaign: vi.fn().mockResolvedValue({
      id: "camp_new_001",
      name: "Business - 2026-06",
      status: "active",
    }),
    addLeadToCampaign: vi.fn().mockResolvedValue({
      leadId: "lead_001",
      uploaded: 1,
      skipped: 0,
      invalid: 0,
    }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("getSegmentLabel", () => {
  it("resolves segment dropdown index to label", () => {
    const task = makeApprovedLeadTask({ segment: "Business" });
    const label = getSegmentLabel(task, "field-segment");
    expect(label).toBe("Business");
  });

  it("defaults to Business when field not found", () => {
    const task = makeApprovedLeadTask();
    task.custom_fields = [];
    const label = getSegmentLabel(task, "field-segment");
    expect(label).toBe("Business");
  });
});

describe("buildCampaignName", () => {
  it("prefixes the business name so campaigns are identifiable in Instantly", () => {
    const name = buildCampaignName("Business", new Date("2026-06-08"), "ShopJaydees");
    expect(name).toBe("ShopJaydees - Business - 2026-06");
  });

  it("creates School campaign name", () => {
    const name = buildCampaignName("School", new Date("2026-12-15"), "ShopJaydees");
    expect(name).toBe("ShopJaydees - School - 2026-12");
  });
});

describe("extractSendData", () => {
  it("extracts all 3 email touches + subjects from ClickUp task", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({
      contactEmail: "test@example.com",
      contactName: "Jane Doe",
      companyName: "Test Corp",
      touch1Body: "Touch 1 body",
      touch1Subject: "Touch 1 subj",
      touch2Body: "Touch 2 body",
      touch2Subject: "Touch 2 subj",
      touch3Body: "Touch 3 body",
      touch3Subject: "Touch 3 subj",
    });

    const data = extractSendData(task, config);

    expect(data.contactEmail).toBe("test@example.com");
    expect(data.contactName).toBe("Jane Doe");
    expect(data.companyName).toBe("Test Corp");
    expect(data.touch1Body).toBe("Touch 1 body");
    expect(data.touch1Subject).toBe("Touch 1 subj");
    expect(data.touch2Body).toBe("Touch 2 body");
    expect(data.touch2Subject).toBe("Touch 2 subj");
    expect(data.touch3Body).toBe("Touch 3 body");
    expect(data.touch3Subject).toBe("Touch 3 subj");
  });

  it("splits contact name into first and last", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({ contactName: "Mike Thompson" });
    const data = extractSendData(task, config);
    expect(data.firstName).toBe("Mike");
    expect(data.lastName).toBe("Thompson");
  });

  it("handles single-word names", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({ contactName: "Jenn" });
    const data = extractSendData(task, config);
    expect(data.firstName).toBe("Jenn");
    expect(data.lastName).toBe("");
  });
});

describe("buildOutreachSequences", () => {
  it("builds one sequence of three email steps with Day 0/4/9 delays", () => {
    const sequences = buildOutreachSequences();

    expect(sequences).toHaveLength(1);
    const steps = sequences[0].steps;
    expect(steps).toHaveLength(3);

    // Every step is an email step.
    expect(steps.every((s) => s.type === "email")).toBe(true);

    // Delay is days-until-next-step: touch1 +4 → Day 4, touch2 +5 → Day 9,
    // touch3 is terminal (0).
    expect(steps[0].delay).toBe(4);
    expect(steps[1].delay).toBe(5);
    expect(steps[2].delay).toBe(0);
  });

  it("references the per-lead touch custom variables, not literal copy", () => {
    const steps = buildOutreachSequences()[0].steps;

    expect(steps[0].variants[0].subject).toBe("{{touch_1_subject}}");
    expect(steps[0].variants[0].body).toBe("{{touch_1_body}}");
    expect(steps[1].variants[0].subject).toBe("{{touch_2_subject}}");
    expect(steps[1].variants[0].body).toBe("{{touch_2_body}}");
    expect(steps[2].variants[0].subject).toBe("{{touch_3_subject}}");
    expect(steps[2].variants[0].body).toBe("{{touch_3_body}}");
  });
});

describe("runSend", () => {
  it("processes an approved lead end-to-end", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(1);
    expect(result.results.sent).toBe(1);

    expect(instantly.listCampaigns).toHaveBeenCalledOnce();
    expect(instantly.createCampaign).toHaveBeenCalledWith(
      `ShopJaydees - Business - ${new Date().toISOString().slice(0, 7)}`,
      buildOutreachSequences(),
      config.instantlySendingAccounts
    );
    // A freshly created campaign is a draft; it must be activated or the
    // sequence never sends.
    expect(instantly.activateCampaign).toHaveBeenCalledWith("camp_new_001");

    expect(instantly.addLeadToCampaign).toHaveBeenCalledOnce();
    const addLeadCall = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLeadCall[0]).toBe("camp_new_001");
    expect(addLeadCall[1].email).toBe("mike@abcplumbing.ca");
    expect(addLeadCall[1].customVariables.touch_1_subject).toBe(
      "Quick question about your crew's gear"
    );

    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({
        status: "Outreach Active",
      })
    );

    const updateArg = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[1])
      .find((u) => u.status === "Outreach Active");
    const startedField = updateArg.custom_fields.find(
      (f: { id: string }) => f.id === "field-outreach-started-date"
    );
    expect(startedField).toBeDefined();
    expect(typeof startedField.value).toBe("number");
  });

  it("reuses existing campaign when one matches segment-month", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (instantly.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "camp_existing",
        name: `ShopJaydees - Business - ${new Date().toISOString().slice(0, 7)}`,
        status: "active",
      },
    ]);

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    await runSend({ config, clickup, instantly, alerter, logger });

    expect(instantly.createCampaign).not.toHaveBeenCalled();
    // A reused campaign is already active; do not re-activate it.
    expect(instantly.activateCampaign).not.toHaveBeenCalled();
    const addLeadCall = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLeadCall[0]).toBe("camp_existing");
  });

  it("sorts leads by Lead Score descending before processing", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "low_score", leadScore: 3, companyName: "Low Score" }),
      makeApprovedLeadTask({ id: "high_score", leadScore: 5, companyName: "High Score" }),
    ]);

    let callOrder: string[] = [];
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockImplementation(
      async (_campaignId: string, lead: { companyName: string }) => {
        callOrder.push(lead.companyName);
        return { leadId: "u", uploaded: 1, skipped: 0, invalid: 0 };
      }
    );

    await runSend({ config, clickup, instantly, alerter, logger });

    expect(callOrder[0]).toBe("High Score");
    expect(callOrder[1]).toBe("Low Score");
  });

  it("limits the run to sendBatchSize approved leads, highest score first", async () => {
    const config = { ...makeSendConfig(), sendBatchSize: 1 };
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "low", leadScore: 3, companyName: "Low", contactEmail: "low@test.com" }),
      makeApprovedLeadTask({ id: "high", leadScore: 5, companyName: "High", contactEmail: "high@test.com" }),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    // Only the single highest-scored lead is sent this run.
    expect(result.leadsQueued).toBe(1);
    expect(instantly.addLeadToCampaign).toHaveBeenCalledOnce();
    expect((instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls[0][1].companyName).toBe("High");
  });

  it("sends all approved leads when sendBatchSize is unset", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "a", contactEmail: "a@test.com" }),
      makeApprovedLeadTask({ id: "b", contactEmail: "b@test.com" }),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(2);
    expect(instantly.addLeadToCampaign).toHaveBeenCalledTimes(2);
  });

  it("round-robins the tracked sending domain across active accounts by lead index", async () => {
    // Instantly distributes actual sends across all email_list mailboxes; the
    // per-lead sending_domain custom variable records an index-based rotation
    // over the active accounts' domains for ClickUp tracking.
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "lead_0", contactEmail: "a@test.com" }),
      makeApprovedLeadTask({ id: "lead_1", contactEmail: "b@test.com" }),
      makeApprovedLeadTask({ id: "lead_2", contactEmail: "c@test.com" }),
    ]);

    await runSend({ config, clickup, instantly, alerter, logger });

    const addLeadCalls = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls;
    expect(addLeadCalls[0][1].customVariables.sending_domain).toBe("shopjaydees.ca");
    expect(addLeadCalls[1][1].customVariables.sending_domain).toBe("shopjaydees.net");
    expect(addLeadCalls[2][1].customVariables.sending_domain).toBe("shopjaydees.ca");
  });

  it("handles instantly-duplicate: tags task and sets Outreach Active", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leadId: null,
      uploaded: 0,
      skipped: 1,
      invalid: 0,
    });

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.instantlyDuplicate).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_approved_001", "instantly-duplicate");
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({ status: "Outreach Active" })
    );
  });

  it("handles invalid email (200 with invalid_email_count): tags task and sets Bounced", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    // /leads/add returns 200 and reports the invalid email in the counts — it
    // is NOT a thrown 400.
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      leadId: null,
      uploaded: 0,
      skipped: 0,
      invalid: 1,
    });

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.invalidEmail).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_approved_001", "invalid-email");
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({ status: "Bounced" })
    );
  });

  it("leaves a lead Approved (error, not Bounced) when /leads/add throws a 400", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new InstantlyApiError("Bad Request", 400)
    );

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    // A genuine 400 is an error, not an invalid-email — do not mark Bounced.
    expect(result.results.errors).toBe(1);
    expect(result.results.invalidEmail).toBe(0);
    expect(clickup.addTag).not.toHaveBeenCalledWith("task_approved_001", "invalid-email");
    expect(clickup.updateTask).not.toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({ status: "Bounced" })
    );
  });

  it("handles Instantly 429: stops processing remaining leads", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "lead_1", contactEmail: "a@test.com" }),
      makeApprovedLeadTask({ id: "lead_2", contactEmail: "b@test.com" }),
      makeApprovedLeadTask({ id: "lead_3", contactEmail: "c@test.com" }),
    ]);

    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ leadId: "u1", uploaded: 1, skipped: 0, invalid: 0 })
      .mockRejectedValueOnce(new InstantlyApiError("Rate limited", 429));

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.sent).toBe(1);
    expect(result.results.deferredRateLimit).toBe(2);
    expect(instantly.addLeadToCampaign).toHaveBeenCalledTimes(2);
  });

  it("retries ClickUp PUT 3x with backoff when it fails after Instantly succeeds", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    (clickup.updateTask as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("ClickUp 500"))
      .mockRejectedValueOnce(new Error("ClickUp 500"))
      .mockRejectedValueOnce(new Error("ClickUp 500"));

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(clickup.updateTask).toHaveBeenCalledTimes(3);
    expect(alerter.send).toHaveBeenCalledWith(
      expect.stringContaining("ClickUp/Instantly sync mismatch"),
      expect.any(String)
    );
    expect(result.results.errors).toBe(1);
  });

  it("skips leads with missing email", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ contactEmail: "" }),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.invalidEmail).toBe(1);
    expect(instantly.addLeadToCampaign).not.toHaveBeenCalled();
    expect(clickup.addTag).toHaveBeenCalledWith("task_approved_001", "invalid-email");
  });

  it("exits cleanly when no approved leads exist", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(0);
    expect(instantly.listCampaigns).not.toHaveBeenCalled();
  });

  it("skips ClickUp writes and Instantly calls in DRY_RUN mode", async () => {
    const config = { ...makeSendConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(1);
    expect(result.results.sent).toBe(1);
    expect(instantly.addLeadToCampaign).not.toHaveBeenCalled();
    expect(clickup.updateTask).not.toHaveBeenCalled();
  });
});
