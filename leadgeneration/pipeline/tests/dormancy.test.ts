import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runDormancyCheck, isDormantEligible, getReactivationCount } from "../src/index.js";
import { makeDormantLeadTask, makeSendConfig } from "./helpers.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task" }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([]),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("getReactivationCount", () => {
  it("returns 0 when no reactivation tags", () => {
    const task = makeDormantLeadTask({ tags: [] });
    expect(getReactivationCount(task)).toBe(0);
  });

  it("returns 1 when reactivation-1 tag exists", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1"] });
    expect(getReactivationCount(task)).toBe(1);
  });

  it("returns 2 when reactivation-2 tag exists", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-2"] });
    expect(getReactivationCount(task)).toBe(2);
  });

  it("returns highest reactivation count when multiple tags", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1", "reactivation-2"] });
    expect(getReactivationCount(task)).toBe(2);
  });
});

describe("isDormantEligible", () => {
  const config = makeSendConfig();

  it("returns eligible for standard dormant lead", () => {
    const task = makeDormantLeadTask({ leadScore: 4, tags: [] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(true);
  });

  it("returns ineligible when Lead Score < 3", () => {
    const task = makeDormantLeadTask({ leadScore: 2 });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("score_low");
  });

  it("returns ineligible when do-not-reactivate tag present", () => {
    const task = makeDormantLeadTask({ tags: ["do-not-reactivate"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("do_not_reactivate");
  });

  it("returns ineligible when reactivation-2 tag present (max attempts)", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-2"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("max_attempts");
  });

  it("returns ineligible when reactivation date is in the future", () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const task = makeDormantLeadTask({ reactivationDate: String(tomorrow) });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("not_yet_due");
  });

  it("returns eligible when reactivation-1 exists (second reactivation allowed)", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(true);
  });
});

describe("runDormancyCheck", () => {
  it("reactivates eligible dormant lead end-to-end", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({}),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(1);
    expect(result.reactivatedLeads).toHaveLength(1);
    expect(result.reactivatedLeads[0].reactivationNumber).toBe(1);

    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.objectContaining({ status: "Enriched" })
    );
    const updateCall = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls[0];
    const customFields = updateCall[1].custom_fields;
    const touch1Field = customFields.find(
      (f: { id: string }) => f.id === config.personalizationFields.emailTouch1
    );
    expect(touch1Field.value).toBe("");
    const campaignField = customFields.find(
      (f: { id: string }) => f.id === config.outreachFields.instantlyCampaignId
    );
    expect(campaignField.value).toBe("");
    const seqField = customFields.find(
      (f: { id: string }) => f.id === config.outreachFields.sequenceStatus
    );
    expect(seqField.value).toBe(0);
    const reviewField = customFields.find(
      (f: { id: string }) => f.id === config.personalizationFields.reviewDecision
    );
    expect(reviewField.value).toBe(0);

    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "re-engagement");
    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "reactivation-1");

    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Dormancy reactivation")
    );
    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Reactivation #1")
    );
  });

  it("increments reactivation tag from 1 to 2 on second reactivation", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["reactivation-1", "re-engagement"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(1);
    expect(result.reactivatedLeads[0].reactivationNumber).toBe(2);
    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "reactivation-2");
    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Reactivation #2")
    );
  });

  it("skips leads with low score", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ leadScore: 2 }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleScoreLow).toBe(1);
    expect(clickup.updateTask).not.toHaveBeenCalled();
  });

  it("skips leads with do-not-reactivate tag", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["do-not-reactivate"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleDoNotReactivate).toBe(1);
  });

  it("skips leads with reactivation-2 tag (max attempts reached)", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["reactivation-2"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleMaxAttempts).toBe(1);
  });

  it("skips leads whose reactivation date has not passed", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const futureDate = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ reactivationDate: futureDate }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notYetDue).toBe(1);
  });

  it("exits cleanly when no dormant leads exist", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.dormantTasksChecked).toBe(0);
    expect(result.results.reactivated).toBe(0);
  });

  it("processes multiple leads with mixed eligibility", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const futureDate = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ id: "eligible_1", companyName: "Eligible Corp" }),
      makeDormantLeadTask({ id: "low_score", leadScore: 1, companyName: "Low Score Co" }),
      makeDormantLeadTask({ id: "dnr", tags: ["do-not-reactivate"], companyName: "DNR Corp" }),
      makeDormantLeadTask({ id: "maxed", tags: ["reactivation-2"], companyName: "Max Attempts" }),
      makeDormantLeadTask({ id: "not_due", reactivationDate: futureDate, companyName: "Not Due Yet" }),
      makeDormantLeadTask({ id: "eligible_2", companyName: "Also Eligible" }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.dormantTasksChecked).toBe(6);
    expect(result.results.reactivated).toBe(2);
    expect(result.results.notEligibleScoreLow).toBe(1);
    expect(result.results.notEligibleDoNotReactivate).toBe(1);
    expect(result.results.notEligibleMaxAttempts).toBe(1);
    expect(result.results.notYetDue).toBe(1);
    expect(result.reactivatedLeads).toHaveLength(2);
  });

  it("continues processing when one lead fails", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ id: "fail_lead", companyName: "Fail Corp" }),
      makeDormantLeadTask({ id: "ok_lead", companyName: "OK Corp" }),
    ]);

    (clickup.updateTask as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("ClickUp error"))
      .mockResolvedValueOnce({});

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(1);
    expect(alerter.send).toHaveBeenCalled();
  });
});
