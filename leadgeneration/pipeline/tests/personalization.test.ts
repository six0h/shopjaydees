import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { FirecrawlClient } from "../src/clients/firecrawl.js";
import type { GeminiClient, GeminiGenerateResult } from "../src/clients/gemini.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import {
  runPersonalization,
  runPersonalizationDrain,
  extractLeadData,
  validateDrafts,
  buildPrompt,
  sanitizeDraftText,
  sanitizeDrafts,
} from "../src/index.js";
import type { PersonalizationRunResult } from "../src/types.js";
import {
  makeEnrichedClickUpTask,
  makeLeadData,
  makeMockDraftOutput,
  makePersonalizationConfig,
} from "./helpers.js";
import type { Config } from "../src/config.js";
import type { GeminiDraftOutput, LeadData } from "../src/types.js";
import { resolveSeasonalContext } from "../src/seasonality.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({ id: "t1", status: { status: "Personalizing" } }),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    removeTag: vi.fn().mockResolvedValue(undefined),
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

describe("sanitizeDraftText", () => {
  it("replaces a spaced em dash used as a clause separator with a comma", () => {
    expect(sanitizeDraftText("Our gear is durable — built for the trades.")).toBe(
      "Our gear is durable, built for the trades."
    );
  });

  it("replaces an unspaced em dash and en dash", () => {
    expect(sanitizeDraftText("hoodies—uniforms")).toBe("hoodies, uniforms");
    expect(sanitizeDraftText("spring–summer season")).toBe("spring, summer season");
  });

  it("keeps numeric ranges readable with a hyphen", () => {
    expect(sanitizeDraftText("12—250 employees")).toBe("12-250 employees");
  });

  it("straightens curly quotes, apostrophes, and ellipses", () => {
    expect(sanitizeDraftText("“Wear It Forward”")).toBe('"Wear It Forward"');
    expect(sanitizeDraftText("you’re")).toBe("you're");
    expect(sanitizeDraftText("just checking in…")).toBe("just checking in...");
  });

  it("leaves ordinary hyphens untouched", () => {
    expect(sanitizeDraftText("a co-op with year-round work")).toBe(
      "a co-op with year-round work"
    );
  });
});

describe("sanitizeDrafts", () => {
  it("sanitizes every prospect-facing field and leaves booleans intact", () => {
    const dirty = {
      website_scrape_summary: "s",
      community_signals: "c",
      personalization_hooks: "h",
      email_touch_1_subject: "Quick idea — for you",
      email_touch_1_body: "Hi Mike — I saw your site’s work.",
      email_touch_2_subject: "Following up—briefly",
      email_touch_2_body: "One more thought — gear.",
      email_touch_3_subject: "Checking in",
      email_touch_3_body: "Still keen — let me know.",
      linkedin_message: "Love your work — let’s connect.",
      casl_opt_out_check: true,
      casl_relevance_rationale: "r",
    } as GeminiDraftOutput;

    const clean = sanitizeDrafts(dirty);

    expect(clean.email_touch_1_subject).toBe("Quick idea, for you");
    expect(clean.email_touch_1_body).toBe("Hi Mike, I saw your site's work.");
    expect(clean.email_touch_2_subject).toBe("Following up, briefly");
    expect(clean.email_touch_3_body).toBe("Still keen, let me know.");
    expect(clean.linkedin_message).toBe("Love your work, let's connect.");
    // No em dashes survive anywhere in the outbound copy.
    const outbound = [
      clean.email_touch_1_subject, clean.email_touch_1_body,
      clean.email_touch_2_subject, clean.email_touch_2_body,
      clean.email_touch_3_subject, clean.email_touch_3_body,
      clean.linkedin_message,
    ].join(" ");
    expect(outbound).not.toContain("—");
    expect(clean.casl_opt_out_check).toBe(true);
  });
});

describe("buildPrompt", () => {
  const seasonal = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z")); // fall

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

    const prompt = buildPrompt(lead, scrapedContent, seasonal);

    expect(prompt).toContain("ABC Plumbing Ltd.");
    expect(prompt).toContain("Mike Thompson");
    expect(prompt).toContain("Owner");
    expect(prompt).toContain("Business");
    expect(prompt).toContain("Trades & Contractors");
    expect(prompt).toContain("Surrey");
    expect(prompt).toContain("Serving Surrey since 2005");
    // Client rebranded 2026-07-16: the agent communicates as "Jaydees Apparel".
    expect(prompt).toContain("Jaydees Apparel");
    expect(prompt).not.toContain("ShopJaydees");
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

    const prompt = buildPrompt(lead, "", seasonal);

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

    const prompt = buildPrompt(lead, "", seasonal);

    expect(prompt).toContain("No website content available");
  });

  it("instructs the model to write like a human and avoid AI tells", () => {
    const lead = { segment: "Business", companyName: "X", contactName: "Y Z" } as LeadData;
    const prompt = buildPrompt(lead, "", seasonal);

    // The single most common AI tell we care about.
    expect(prompt.toLowerCase()).toContain("em dash");
    expect(prompt).toContain("—");
    // Signals the overall directive is present.
    expect(prompt.toLowerCase()).toContain("human");
  });

  it("frames Ellie as outreach staff, not the owner of Jaydees", () => {
    const lead = { segment: "Business", companyName: "X", contactName: "Y Z" } as LeadData;
    const prompt = buildPrompt(lead, "", seasonal);

    // Ellie works at Jaydees; she does not run/own it. The prompt must say so
    // and must not carry the old owner-implying tone line.
    expect(prompt.toLowerCase()).toContain("not the owner");
    expect(prompt).toContain('Do not write "I run"');
    expect(prompt).not.toContain("local business owner reaching out");
  });

  it("includes segment-appropriate social proof", () => {
    const schoolLead = { segment: "School" } as LeadData;
    const teamLead = { segment: "Team" } as LeadData;
    const businessLead = { segment: "Business" } as LeadData;

    expect(buildPrompt(schoolLead, "", seasonal)).toContain("100 schools");
    expect(buildPrompt(teamLead, "", seasonal)).toContain("raise thousands");
    expect(buildPrompt(businessLead, "", seasonal)).toContain("12 to 250+");
  });

  it("injects the resolved selling season and forbids the others", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt).toContain("FALL");
    expect(prompt).toContain("NEVER reference: spring, summer, winter");
    expect(prompt).toContain("Lock in your fall order early");
  });

  it("does NOT tell the model to offer a mockup or catalog", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt.toLowerCase()).not.toContain("mockup");
    expect(prompt.toLowerCase()).not.toContain("catalog");
  });

  it("instructs a no-obligation quote as the concrete offer", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt.toLowerCase()).toContain("no-obligation quote");
  });

  it("appends retry feedback when provided", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal, 'draft names a specific product');
    expect(prompt).toContain("YOUR PREVIOUS DRAFT WAS REJECTED");
    expect(prompt).toContain("draft names a specific product");
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
    ["The Langley Concrete Group of Companies", "Langley Concrete", "leading article stripped"],
    ["The Home Depot", "Home Depot", "leading article, two-token remainder"],
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

describe("validateDrafts — catalog guardrail (Jaydees has no catalog)", () => {
  const lead = () => makeLeadData({ companyName: "Monark", contactName: "Pardeep Dosanjh" });
  const cleanBody = `Hi Pardeep, Monark's spring work caught my eye. ${"x".repeat(100)}`;

  it("rejects a draft body that offers to send a catalog", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark looks great. Happy to send over our catalog so you can browse styles. ${"x".repeat(80)}`,
    });
    const errors = validateDrafts(drafts, lead());
    expect(errors.some((e) => e.toLowerCase().includes("catalog"))).toBe(true);
  });

  it("rejects the British spelling 'catalogue' anywhere in a touch body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: cleanBody,
      email_touch_2_body: `Following up, Pardeep — our catalogue has a lot of options. ${"x".repeat(60)}`,
    });
    const errors = validateDrafts(drafts, lead());
    expect(errors.some((e) => e.toLowerCase().includes("catalog"))).toBe(true);
  });

  it("rejects a catalog mention in a subject line", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: cleanBody,
      email_touch_1_subject: "Our catalog for Monark",
    });
    const errors = validateDrafts(drafts, lead());
    expect(errors.some((e) => e.toLowerCase().includes("catalog"))).toBe(true);
  });

  it("passes a clean draft that never mentions a catalog", () => {
    const drafts = makeMockDraftOutput({ email_touch_1_body: cleanBody });
    expect(validateDrafts(drafts, lead())).toEqual([]);
  });
});

describe("stale generation-failed tag", () => {
  it("clears the tag when a previously-failed lead personalizes successfully", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const task = makeEnrichedClickUpTask({ tags: ["generation-failed"] });
    (clickup.getTasks as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // stuck Personalizing reset
      .mockResolvedValueOnce([task]); // eligible Enriched leads

    const result = await runPersonalization({ config, clickup, firecrawl, gemini, alerter, logger });

    expect(result.results.success).toBe(1);
    expect(clickup.removeTag).toHaveBeenCalledWith(task.id, "generation-failed");
  });

  it("does not remove the tag in dry-run mode", async () => {
    const config = { ...makePersonalizationConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const task = makeEnrichedClickUpTask({ tags: ["generation-failed"] });
    (clickup.getTasks as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([task]);

    await runPersonalization({ config, clickup, firecrawl, gemini, alerter, logger });

    expect(clickup.removeTag).not.toHaveBeenCalled();
  });
});

describe("runPersonalizationDrain — self-retriggering drain loop", () => {
  function passResult(over: Partial<PersonalizationRunResult> & {
    leadsAvailable: number;
    leadsProcessed: number;
    success?: number;
    deferredRemaining?: number;
    generationFailed?: number;
  }): PersonalizationRunResult {
    return {
      runId: "p",
      timestamp: "t",
      batchSizeRequested: 15,
      leadsAvailable: over.leadsAvailable,
      leadsProcessed: over.leadsProcessed,
      results: {
        success: over.success ?? over.leadsProcessed,
        generationFailed: over.generationFailed ?? 0,
        caslBlocked: 0,
        scrapeFailedButProceeded: 0,
        stuckLeadsReset: 0,
      },
      leads: [],
      deferredRemaining: over.deferredRemaining ?? 0,
    };
  }

  // A scripted runner that returns the next queued pass result on each call.
  function scriptedRunner(script: PersonalizationRunResult[]) {
    let i = 0;
    const fn = vi.fn(async () => script[Math.min(i++, script.length - 1)]);
    return fn;
  }

  const deps = () => ({
    config: makePersonalizationConfig(),
    clickup: {} as never,
    firecrawl: {} as never,
    gemini: {} as never,
    alerter: {} as never,
    logger: createLogger("test"),
  });

  it("keeps running while more leads wait, until the pipe empties", async () => {
    // 47 eligible, batch 15: three full batches then a short final batch.
    const runOnce = scriptedRunner([
      passResult({ leadsAvailable: 47, leadsProcessed: 15 }),
      passResult({ leadsAvailable: 32, leadsProcessed: 15 }),
      passResult({ leadsAvailable: 17, leadsProcessed: 15 }),
      passResult({ leadsAvailable: 2, leadsProcessed: 2 }), // moreWaiting=false -> stop
    ]);
    const out = await runPersonalizationDrain(deps(), { runOnce });
    expect(runOnce).toHaveBeenCalledTimes(4);
    expect(out.passes).toHaveLength(4);
    expect(out.totalProcessed).toBe(47);
    expect(out.totalSuccess).toBe(47);
    expect(out.stoppedReason).toBe("pipe_empty");
  });

  it("stops (does not loop forever) when a pass makes no progress — poison leads", async () => {
    // A full batch where every lead fails generation, with more still queued behind
    // them. Without the no-progress guard this would re-pick the same failures forever.
    const runOnce = scriptedRunner([
      passResult({ leadsAvailable: 20, leadsProcessed: 15, success: 0, generationFailed: 15 }),
    ]);
    const out = await runPersonalizationDrain(deps(), { runOnce, maxPasses: 50 });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(out.stoppedReason).toBe("no_progress");
  });

  it("stops immediately when Gemini rate-limits (deferredRemaining > 0)", async () => {
    const runOnce = scriptedRunner([
      passResult({ leadsAvailable: 40, leadsProcessed: 5, success: 5, deferredRemaining: 10 }),
    ]);
    const out = await runPersonalizationDrain(deps(), { runOnce });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(out.stoppedReason).toBe("rate_limited");
  });

  it("stops when the wall-clock budget is exhausted, even with leads remaining", async () => {
    const runOnce = scriptedRunner([passResult({ leadsAvailable: 100, leadsProcessed: 15 })]);
    let t = 0;
    const now = () => (t += 60_000); // each call advances 60s; budget 30s -> stop after pass 1
    const out = await runPersonalizationDrain(deps(), { runOnce, budgetMs: 30_000, now });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(out.stoppedReason).toBe("budget");
  });

  it("runs exactly once when the whole pipe fits in one batch", async () => {
    const runOnce = scriptedRunner([passResult({ leadsAvailable: 8, leadsProcessed: 8 })]);
    const out = await runPersonalizationDrain(deps(), { runOnce });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(out.stoppedReason).toBe("pipe_empty");
    expect(out.totalSuccess).toBe(8);
  });
});

describe("validateDrafts — product & price guardrails (zero product talk)", () => {
  const lead = () => makeLeadData({ companyName: "Monark", contactName: "Pardeep Dosanjh" });
  const cleanBody = `Hi Pardeep, Monark caught my eye. We do custom apparel for local teams. ${"x".repeat(80)}`;

  it("passes a clean draft that names no product", () => {
    expect(validateDrafts(makeMockDraftOutput({ email_touch_1_body: cleanBody }), lead())).toEqual([]);
  });

  it("rejects a specific garment noun in a body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we can do tri-blend hoodies for your team. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects 'spirit wear' and 'team gear' phrases", () => {
    const d1 = makeMockDraftOutput({ email_touch_2_body: `Following up, our spirit wear is great. ${"x".repeat(60)}` });
    const d2 = makeMockDraftOutput({ email_touch_2_body: `Following up, our team gear is great. ${"x".repeat(60)}` });
    expect(validateDrafts(d1, lead()).some((e) => e.includes("product"))).toBe(true);
    expect(validateDrafts(d2, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects a product noun in a subject line", () => {
    const drafts = makeMockDraftOutput({ email_touch_1_body: cleanBody, email_touch_1_subject: "Custom polos for Monark" });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects a stated price ($ + digit)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we can start around $28 a piece. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(true);
  });

  it("rejects 'per unit' / 'per shirt' pricing language", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, pricing is great per unit. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(true);
  });

  it("does NOT false-positive on the Business social-proof number range", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we work with businesses of 12 to 250+ employees. ${"x".repeat(60)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(false);
  });
});
