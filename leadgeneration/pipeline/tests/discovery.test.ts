import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { HunterClient, HunterDomainSearchResponse } from "../src/clients/hunter.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runDiscovery, selectBestContact, extractCaslSourceUrl } from "../src/index.js";
import { makeProspectingRequestTask, makeHunterEmail, makeHunterDomainSearchResponse } from "./helpers.js";
import type { Config } from "../src/config.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
    dryRun: false,
    alertEmail: "cody@sixohquad.com",
    alertWebhookUrl: "",
    fields: {
      companyName: "f-company-name",
      companyDomain: "f-company-domain",
      companyIndustry: "f-company-industry",
      companyHeadcount: "f-company-headcount",
      companyCity: "f-company-city",
      contactName: "f-contact-name",
      contactTitle: "f-contact-title",
      contactEmail: "f-contact-email",
      emailConfidence: "f-email-confidence",
      contactLinkedin: "f-contact-linkedin",
      contactPhone: "f-contact-phone",
      segment: "f-segment",
      category: "f-category",
      leadScore: "f-lead-score",
      scoreRationale: "f-score-rationale",
      geographicPhase: "f-geo-phase",
      caslSourceUrl: "f-casl-source",
      importBatch: "f-import-batch",
    },
    prospectingFields: {
      resultsFound: "f-pr-results",
      leadsCreated: "f-pr-created",
      leadsParked: "f-pr-parked",
      duplicatesSkipped: "f-pr-dupes",
    },
  };
}

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([
      { id: "f-segment", name: "Segment", type: "drop_down", type_config: { options: [{ name: "Business", orderindex: 0 }, { name: "School", orderindex: 1 }, { name: "Team", orderindex: 2 }] } },
      { id: "f-category", name: "Category", type: "drop_down", type_config: { options: [{ name: "Trades & Contractors", orderindex: 0 }] } },
      { id: "f-company-city", name: "Company City", type: "drop_down", type_config: { options: [{ name: "Surrey", orderindex: 0 }, { name: "Langley", orderindex: 1 }] } },
      { id: "f-geo-phase", name: "Geographic Phase", type: "drop_down", type_config: { options: [{ name: "Phase 1 - Fraser Valley Core", orderindex: 0 }] } },
    ]),
  };
}

function makeMockHunter(): HunterClient {
  return {
    searchDomain: vi.fn().mockResolvedValue(
      makeHunterDomainSearchResponse("abcplumbing.ca", "ABC Plumbing", [
        makeHunterEmail(),
      ])
    ),
    getAccountQuota: vi.fn().mockResolvedValue({ used: 50, available: 450 }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("selectBestContact", () => {
  it("prefers Owner over Manager", () => {
    const contacts = [
      makeHunterEmail({ value: "mgr@test.com", position: "Manager", confidence: 95 }),
      makeHunterEmail({ value: "owner@test.com", position: "Owner", confidence: 80 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("owner@test.com");
  });

  it("excludes generic emails", () => {
    const contacts = [
      makeHunterEmail({ value: "info@test.com", type: "generic", position: "Owner", confidence: 99 }),
      makeHunterEmail({ value: "jane@test.com", type: "personal", position: "Manager", confidence: 70 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("jane@test.com");
  });

  it("uses confidence as tiebreaker within same title priority", () => {
    const contacts = [
      makeHunterEmail({ value: "a@test.com", position: "Manager", confidence: 80 }),
      makeHunterEmail({ value: "b@test.com", position: "Manager", confidence: 95 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("b@test.com");
  });

  it("returns null when no personal emails with confidence >= 50", () => {
    const contacts = [
      makeHunterEmail({ value: "info@test.com", type: "generic", confidence: 99 }),
      makeHunterEmail({ value: "maybe@test.com", type: "personal", confidence: 30 }),
    ];
    const best = selectBestContact(contacts);
    expect(best).toBeNull();
  });
});

describe("extractCaslSourceUrl", () => {
  it("returns first source URL from the prospect's own domain", () => {
    const contact = makeHunterEmail({
      sources: [
        { uri: "https://directory.example.com/abc", domain: "directory.example.com" },
        { uri: "https://abcplumbing.ca/about", domain: "abcplumbing.ca" },
      ],
    });
    expect(extractCaslSourceUrl(contact, "abcplumbing.ca")).toBe(
      "https://abcplumbing.ca/about"
    );
  });

  it("returns empty string when no matching domain source", () => {
    const contact = makeHunterEmail({
      sources: [{ uri: "https://other.com/page", domain: "other.com" }],
    });
    expect(extractCaslSourceUrl(contact, "abcplumbing.ca")).toBe("");
  });
});

describe("runDiscovery", () => {
  it("processes a Prospecting Request end-to-end", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // First getTasks call: stale check (Running status) — none
    // Second getTasks call: Prospecting Requests (Requested status) — one request
    // Third getTasks call (dedup check) — no existing lead
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset: no Running requests
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one Requested request
      .mockResolvedValueOnce([]); // dedup: no existing lead for abcplumbing.ca

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requestsFound).toBe(1);
    expect(result.results.completed).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(1);

    // Verify request was locked to Running
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", { status: "Running" });
    // Verify lead was created
    expect(clickup.createTask).toHaveBeenCalledOnce();
    // Verify request was set to Complete
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", expect.objectContaining({ status: "Complete" }));
    // Verify completion comment was added
    expect(clickup.addComment).toHaveBeenCalled();
  });

  it("skips duplicate leads (same domain already in ClickUp)", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([{ id: "existing_task" }]); // dedup: existing lead found

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].duplicatesSkipped).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(0);
    expect(clickup.createTask).not.toHaveBeenCalled();
  });

  it("sets status to Parked for score 1-2 leads", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Hunter returns a low-quality lead
    (hunter.searchDomain as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHunterDomainSearchResponse("badlead.ca", "Bad Lead", [
        makeHunterEmail({
          value: "maybe@badlead.ca",
          confidence: 40,
          position: null,
          sources: [],
        }),
      ])
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].leadsParked).toBe(1);
    const createCall = (clickup.createTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(createCall[1].status).toBe("Parked");
  });

  it("exits cleanly when no Prospecting Requests exist", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([]); // no requests

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requestsFound).toBe(0);
    expect(hunter.searchDomain).not.toHaveBeenCalled();
  });

  it("resets stale Running requests before processing", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const thirtyMinAgo = String(Date.now() - 31 * 60 * 1000);
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "stale_req", status: "Running", dateUpdated: thirtyMinAgo }),
      ])
      .mockResolvedValueOnce([]) // no new requests after reset
      ;

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.updateTask).toHaveBeenCalledWith("stale_req", { status: "Requested" });
    expect(result.results.staleReset).toBe(1);
  });

  it("skips ClickUp task creation in DRY_RUN mode", async () => {
    const config = { ...makeConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.createTask).not.toHaveBeenCalled();
    expect(result.requests[0].leadsCreated).toBe(1);
  });

  it("sets request to Failed and alerts on Hunter.io 401", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.searchDomain as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Hunter.io /domain-search failed: 401 Invalid API key")
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(alerter.send).toHaveBeenCalled();
    expect(result.results.failed).toBe(1);
  });

  it("isolates per-request errors — one bad request doesn't kill others", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
    searchMock
      .mockRejectedValueOnce(new Error("Hunter.io error"))
      .mockResolvedValueOnce(
        makeHunterDomainSearchResponse("good.ca", "Good Co", [makeHunterEmail({ value: "a@good.ca" })])
      );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req_bad", category: "Restaurants & Hospitality" }),
        makeProspectingRequestTask({ id: "req_good", category: "Fitness & Wellness" }),
      ])
      .mockResolvedValueOnce([]); // dedup for good request

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.results.failed).toBe(1);
    expect(result.results.completed).toBe(1);
  });

  it("checks Hunter.io quota before processing and skips if insufficient", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.getAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      used: 498,
      available: 2,
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req1", maxResults: 25 }),
      ]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(alerter.send).toHaveBeenCalled();
    expect(hunter.searchDomain).not.toHaveBeenCalled();
  });
});
