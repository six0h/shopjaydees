import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { FirecrawlClient } from "../src/clients/firecrawl.js";
import type { GeminiClient, GeminiGenerateResult } from "../src/clients/gemini.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import {
  runPersonalization,
  extractLeadData,
  validateDrafts,
  buildPrompt,
} from "../src/index.js";
import {
  makeEnrichedClickUpTask,
  makeLeadData,
  makeMockDraftOutput,
  makePersonalizationConfig,
} from "./helpers.js";
import type { Config } from "../src/config.js";
import type { GeminiDraftOutput, LeadData } from "../src/types.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({ id: "t1", status: { status: "Personalizing" } }),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([]),
  };
}

function makeMockFirecrawl(): FirecrawlClient {
  return {
    scrape: vi.fn().mockResolvedValue({
      success: true,
      data: {
        markdown: "# ABC Plumbing\n\nServing Surrey since 2005.\n\n## About Us\nFamily-owned and operated.",
        metadata: { title: "ABC Plumbing", sourceURL: "https://abcplumbing.ca", statusCode: 200 },
        links: [
          "https://abcplumbing.ca/about",
          "https://abcplumbing.ca/services",
          "https://abcplumbing.ca/community",
        ],
      },
    }),
  };
}

function makeMockGemini(): GeminiClient {
  return {
    generateDrafts: vi.fn().mockResolvedValue({
      drafts: makeMockDraftOutput(),
      tokensUsed: 4000,
    } as GeminiGenerateResult),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("extractLeadData", () => {
  it("extracts all lead fields from a ClickUp task", () => {
    const task = makeEnrichedClickUpTask({});
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.taskId).toBe("task_lead_001");
    expect(lead.companyName).toBe("ABC Plumbing Ltd.");
    expect(lead.companyDomain).toBe("https://abcplumbing.ca");
    expect(lead.contactName).toBe("Mike Thompson");
    expect(lead.contactTitle).toBe("Owner");
    expect(lead.segment).toBe("Business");
    expect(lead.leadScore).toBe(4);
    expect(lead.isReEngagement).toBe(false);
  });

  it("detects re-engagement from tag", () => {
    const task = makeEnrichedClickUpTask({ tags: ["re-engagement"] });
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.isReEngagement).toBe(true);
  });

  it("resolves dropdown values to labels for segment", () => {
    const task = makeEnrichedClickUpTask({ segment: "School" });
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.segment).toBe("School");
  });
});

describe("validateDrafts", () => {
  it("passes valid drafts", () => {
    const drafts = makeMockDraftOutput();
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors).toHaveLength(0);
  });

  it("fails if touch 1 body is too short (< 100 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: "Hi Mike, short email.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_1_body"))).toBe(true);
  });

  it("fails if touch 2 body is too short (< 80 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_2_body: "Hi Mike, short.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_2_body"))).toBe(true);
  });

  it("fails if touch 3 body is too short (< 60 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_3_body: "Hi Mike, short.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_3_body"))).toBe(true);
  });

  it("fails if company name not in touch 1 body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body:
        "Hi Mike,\n\nI came across your company while looking into trades businesses in Surrey and really liked what I saw.\n\nI'm Ellie from ShopJaydees. We help trades businesses with branded work wear. Would it be worth a quick conversation?\n\nEllie",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("company name"))).toBe(true);
  });

  it("fails if contact first name not in touch 1 body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body:
        "Hello,\n\nI came across ABC Plumbing Ltd. while looking into trades businesses in Surrey.\n\nI'm Ellie from ShopJaydees. We help trades businesses with branded work wear. Would it be worth a quick conversation?\n\nEllie",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("first name"))).toBe(true);
  });

  it("fails if subject line is too short (< 3 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_subject: "Hi",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("subject"))).toBe(true);
  });

  it("fails if subject line is too long (> 80 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_subject: "A".repeat(81),
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("subject"))).toBe(true);
  });

  it("does not error on long linkedin_message (truncation handled at write time)", () => {
    const drafts = makeMockDraftOutput({
      linkedin_message: "X".repeat(350),
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors).toHaveLength(0);
    expect(drafts.linkedin_message).toHaveLength(350);
  });
});

describe("buildPrompt", () => {
  it("includes prospect data in the prompt", () => {
    const lead = {
      companyName: "ABC Plumbing Ltd.",
      companyDomain: "https://abcplumbing.ca",
      contactName: "Mike Thompson",
      contactTitle: "Owner",
      segment: "Business",
      category: "Trades & Contractors",
      companyIndustry: "Construction",
      companyHeadcount: "11-50",
      companyCity: "Surrey",
      isReEngagement: false,
    } as LeadData;
    const scrapedContent = "# ABC Plumbing\n\nServing Surrey since 2005.";

    const prompt = buildPrompt(lead, scrapedContent);

    expect(prompt).toContain("ABC Plumbing Ltd.");
    expect(prompt).toContain("Mike Thompson");
    expect(prompt).toContain("Owner");
    expect(prompt).toContain("Business");
    expect(prompt).toContain("Trades & Contractors");
    expect(prompt).toContain("Surrey");
    expect(prompt).toContain("Serving Surrey since 2005");
    expect(prompt).toContain("ShopJaydees");
    expect(prompt).toContain("Wear It Forward");
    expect(prompt).toContain("Ellie");
  });

  it("includes re-engagement notice when isReEngagement is true", () => {
    const lead = {
      companyName: "Test Co",
      companyDomain: "https://test.com",
      contactName: "Jane Doe",
      contactTitle: "Manager",
      segment: "School",
      category: "Elementary & Secondary",
      companyIndustry: "Education",
      companyHeadcount: "51-200",
      companyCity: "Langley",
      isReEngagement: true,
    } as LeadData;

    const prompt = buildPrompt(lead, "");

    expect(prompt).toContain("RE-ENGAGEMENT NOTICE");
    expect(prompt).toContain("completely different angle");
    expect(prompt).toContain("Do NOT reference");
  });

  it("handles missing website content gracefully", () => {
    const lead = {
      companyName: "No Website Corp",
      companyDomain: "https://nowebsite.ca",
      contactName: "Bob Smith",
      contactTitle: "CEO",
      segment: "Business",
      category: "Fitness & Wellness",
      companyIndustry: "Fitness",
      companyHeadcount: "5-10",
      companyCity: "Burnaby",
      isReEngagement: false,
    } as LeadData;

    const prompt = buildPrompt(lead, "");

    expect(prompt).toContain("No website content available");
  });

  it("includes segment-appropriate social proof", () => {
    const schoolLead = { segment: "School" } as LeadData;
    const teamLead = { segment: "Team" } as LeadData;
    const businessLead = { segment: "Business" } as LeadData;

    expect(buildPrompt(schoolLead, "")).toContain("100 schools");
    expect(buildPrompt(teamLead, "")).toContain("raise thousands");
    expect(buildPrompt(businessLead, "")).toContain("12 to 250+");
  });
});

describe("runPersonalization", () => {
  it("processes an Enriched lead end-to-end", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // pre-step: no stuck Personalizing leads
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]); // step 1: one Enriched lead

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(1);
    expect(result.results.success).toBe(1);

    // Verify lead was locked to Personalizing
    expect(clickup.updateTask).toHaveBeenCalledWith("task_lead_001", {
      status: "Personalizing",
    });

    // Verify Firecrawl was called for homepage + secondary pages
    expect(firecrawl.scrape).toHaveBeenCalled();

    // Verify Gemini was called
    expect(gemini.generateDrafts).toHaveBeenCalledOnce();

    // Verify results were written to ClickUp with status "Ready for Review"
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const readyForReviewCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Ready for Review"
    );
    expect(readyForReviewCall).toBeDefined();
    const updateBody = readyForReviewCall![1] as { custom_fields: Array<{ id: string; value: unknown }> };
    expect(updateBody.custom_fields).toBeDefined();

    // Verify specific fields were set
    const fieldIds = updateBody.custom_fields.map((f: { id: string }) => f.id);
    expect(fieldIds).toContain("f-scrape-summary");
    expect(fieldIds).toContain("f-email-touch-1");
    expect(fieldIds).toContain("f-email-touch-1-subject");
    expect(fieldIds).toContain("f-linkedin-message");
    expect(fieldIds).toContain("f-casl-opt-out");
    expect(fieldIds).toContain("f-casl-relevance");
    expect(fieldIds).toContain("f-casl-consent");
    expect(fieldIds).toContain("f-casl-date");
    expect(fieldIds).toContain("f-review-decision");
  });

  it("resets leads stuck in Personalizing > 30 min", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const thirtyOneMinAgo = String(Date.now() - 31 * 60 * 1000);
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({
          id: "stuck_lead",
          status: "Personalizing",
          dateUpdated: thirtyOneMinAgo,
        }),
      ])
      .mockResolvedValueOnce([]); // no Enriched leads after reset

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(clickup.updateTask).toHaveBeenCalledWith("stuck_lead", {
      status: "Enriched",
    });
    expect(result.results.stuckLeadsReset).toBe(1);
  });

  it("exits cleanly when no Enriched leads found", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // no stuck leads
      .mockResolvedValueOnce([]); // no Enriched leads

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(0);
    expect(firecrawl.scrape).not.toHaveBeenCalled();
    expect(gemini.generateDrafts).not.toHaveBeenCalled();
  });

  it("tags no-scrape and proceeds when Firecrawl fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (firecrawl.scrape as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Timeout",
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.success).toBe(1);
    expect(result.results.scrapeFailedButProceeded).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "no-scrape");

    expect(gemini.generateDrafts).toHaveBeenCalledOnce();
  });

  it("tags generation-failed and resets to Enriched when Gemini fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed: 500,
      error: "Gemini SAFETY filter triggered",
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.generationFailed).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith(
      "task_lead_001",
      "generation-failed"
    );
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("defers remaining batch on Gemini 429 rate limit", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed: 0,
      error: "Gemini 429: rate limited",
      isRateLimited: true,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_1" }),
        makeEnrichedClickUpTask({ id: "lead_2" }),
        makeEnrichedClickUpTask({ id: "lead_3" }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(1);
    expect(result.deferredRemaining).toBe(2);
    expect(alerter.send).toHaveBeenCalled();

    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) =>
        call[0] === "lead_1" &&
        (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("blocks lead with casl_opt_out_check=false (tags casl-block, resets to Enriched)", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      drafts: makeMockDraftOutput({ casl_opt_out_check: false }),
      tokensUsed: 4000,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.caslBlocked).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "casl-block");
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("tags generation-failed when validation fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      drafts: makeMockDraftOutput({ email_touch_1_body: "Too short" }),
      tokensUsed: 4000,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.generationFailed).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith(
      "task_lead_001",
      "generation-failed"
    );
  });

  it("respects batch size limit", async () => {
    const config = { ...makePersonalizationConfig(), personalizationBatchSize: 2 };
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_1", leadScore: 5 }),
        makeEnrichedClickUpTask({ id: "lead_2", leadScore: 4 }),
        makeEnrichedClickUpTask({ id: "lead_3", leadScore: 3 }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsAvailable).toBe(3);
    expect(result.leadsProcessed).toBe(2);
    expect(result.batchSizeRequested).toBe(2);
  });

  it("sorts leads by score descending, then date_created ascending", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const now = Date.now();
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...makeEnrichedClickUpTask({ id: "lead_low", leadScore: 3 }), date_created: String(now) },
        { ...makeEnrichedClickUpTask({ id: "lead_high_new", leadScore: 5 }), date_created: String(now) },
        { ...makeEnrichedClickUpTask({ id: "lead_high_old", leadScore: 5 }), date_created: String(now - 86_400_000) },
      ]);

    await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const lockCalls = updateCalls.filter(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Personalizing"
    );
    expect(lockCalls[0][0]).toBe("lead_high_old");
    expect(lockCalls[1][0]).toBe("lead_high_new");
    expect(lockCalls[2][0]).toBe("lead_low");
  });

  it("scrapes secondary pages (about + community) when found in homepage links", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(firecrawl.scrape).toHaveBeenCalledTimes(3);
    expect(firecrawl.scrape).toHaveBeenCalledWith("https://abcplumbing.ca/about");
    expect(firecrawl.scrape).toHaveBeenCalledWith("https://abcplumbing.ca/community");
  });

  it("filters leads below score 3 client-side", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_good", leadScore: 4 }),
        makeEnrichedClickUpTask({ id: "lead_bad", leadScore: 2 }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(1);
    expect(clickup.updateTask).toHaveBeenCalledWith("lead_good", {
      status: "Personalizing",
    });
    expect(clickup.updateTask).not.toHaveBeenCalledWith("lead_bad", {
      status: "Personalizing",
    });
  });
});

describe("validateDrafts — natural company-name mentions", () => {
  function draftsMentioning(body: string) {
    return makeMockDraftOutput({
      email_touch_1_body: body,
      email_touch_2_body: "B".repeat(90),
      email_touch_3_body: "C".repeat(70),
    });
  }

  const cases: Array<[string, string, string]> = [
    ["Blue Pine Enterprises", "Blue Pine", "distinctive two-token prefix"],
    ["LineStar Utility Supply", "LineStar", "distinctive single token"],
    ["Northcoast Lumber", "Northcoast", "single distinctive token"],
    ["A1 Doors & Mouldings", "A1 Doors", "short first token needs the second"],
    ["Monark", "Monark", "single-word name"],
    ["ABC Plumbing Ltd.", "ABC Plumbing", "legal suffix dropped"],
  ];

  for (const [companyName, mention, why] of cases) {
    it(`accepts "${mention}" for "${companyName}" (${why})`, () => {
      const lead = makeLeadData({ companyName, contactName: "Mike Thompson" });
      const body = `Hi Mike, I noticed ${mention} has been busy this spring. ${"x".repeat(100)}`;
      expect(validateDrafts(draftsMentioning(body), lead)).toEqual([]);
    });
  }

  it("still rejects a body that never names the company", () => {
    const lead = makeLeadData({ companyName: "Blue Pine Enterprises", contactName: "Mike Thompson" });
    const body = `Hi Mike, I noticed your company has been busy this spring. ${"x".repeat(100)}`;
    const errors = validateDrafts(draftsMentioning(body), lead);
    expect(errors.some((e) => e.includes("missing company name"))).toBe(true);
  });

  it("matches the company name case-insensitively", () => {
    const lead = makeLeadData({ companyName: "Northcoast Lumber", contactName: "Ron Sargeant" });
    const body = `Hi Ron, folks at NORTHCOAST have a great reputation. ${"x".repeat(100)}`;
    expect(validateDrafts(draftsMentioning(body), lead)).toEqual([]);
  });

  it("matches the contact first name case-insensitively", () => {
    const lead = makeLeadData({ companyName: "Monark", contactName: "Pardeep Dosanjh" });
    const body = `Hello PARDEEP, Monark caught my eye this week. ${"x".repeat(100)}`;
    expect(validateDrafts(draftsMentioning(body), lead)).toEqual([]);
  });
});
