import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { HunterClient, HunterDomainSearchResponse } from "../src/clients/hunter.js";
import { HunterRateLimitError } from "../src/clients/hunter.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runDiscovery, selectBestContact, extractCaslSourceUrl } from "../src/index.js";
import {
  makeProspectingRequestTask,
  makeHunterEmail,
  makeHunterDomainSearchResponse,
  makeDiscoverCompany,
  makeDiscoverResponse,
  makePersonalizationConfig,
} from "./helpers.js";
import type { Config } from "../src/config.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeConfig(): Config {
  return makePersonalizationConfig();
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
    discover: vi.fn().mockResolvedValue(
      makeDiscoverResponse([makeDiscoverCompany()])
    ),
    searchDomain: vi.fn().mockResolvedValue(
      makeHunterDomainSearchResponse("abcplumbing.ca", "ABC Plumbing", [
        makeHunterEmail(),
      ])
    ),
    getAccountQuota: vi.fn().mockResolvedValue({
      searches: { used: 50, available: 450 },
      verifications: { used: 0, available: 1000 },
    }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("selectBestContact", () => {
  it("picks highest confidence among personal emails", () => {
    const contacts = [
      makeHunterEmail({ value: "mgr@test.com", position: "Manager", confidence: 95 }),
      makeHunterEmail({ value: "owner@test.com", position: "Owner", confidence: 80 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("mgr@test.com");
  });

  it("excludes generic emails", () => {
    const contacts = [
      makeHunterEmail({ value: "info@test.com", type: "generic", position: "Owner", confidence: 99 }),
      makeHunterEmail({ value: "jane@test.com", type: "personal", position: "Manager", confidence: 70 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("jane@test.com");
  });

  it("uses confidence to pick between contacts", () => {
    const contacts = [
      makeHunterEmail({ value: "a@test.com", position: "Manager", confidence: 80 }),
      makeHunterEmail({ value: "b@test.com", position: "Manager", confidence: 95 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("b@test.com");
  });

  it("returns null when no personal emails with confidence >= 40", () => {
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
  it("processes a Prospecting Request end-to-end (Discover -> Domain Search)", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset: no Running requests
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one Requested request
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requestsFound).toBe(1);
    expect(result.results.completed).toBe(1);
    expect(result.requests[0].companiesDiscovered).toBe(1);
    expect(result.requests[0].companiesSearched).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(1);

    // Verify discover was called once (free)
    expect(hunter.discover).toHaveBeenCalledOnce();
    // Verify searchDomain was called once per discovered company
    expect(hunter.searchDomain).toHaveBeenCalledOnce();
    // Verify request was locked to Running
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", { status: "Running" });
    // Verify lead was created
    expect(clickup.createTask).toHaveBeenCalledOnce();
    // Verify request was set to Complete
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", expect.objectContaining({ status: "Complete" }));
    // Verify completion comment was added
    expect(clickup.addComment).toHaveBeenCalled();
  });

  it("skips duplicate domains from Discover (saves credits)", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([{ // pre-fetch: existing prospect with matching domain
        id: "existing_task",
        custom_fields: [{ id: "f-company-domain", value: "https://abcplumbing.ca" }],
      }]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].duplicatesSkipped).toBe(1);
    expect(result.requests[0].companiesSearched).toBe(0);
    expect(result.requests[0].leadsCreated).toBe(0);
    // Domain Search should NOT be called since the domain was filtered out before spending credits
    expect(hunter.searchDomain).not.toHaveBeenCalled();
    expect(clickup.createTask).not.toHaveBeenCalled();
  });

  it("sets status to Parked for score 1-2 leads", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Hunter domain search returns a low-quality lead
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
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

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
    expect(hunter.discover).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.createTask).not.toHaveBeenCalled();
    expect(result.requests[0].leadsCreated).toBe(1);
  });

  it("sets request to Failed and alerts on error", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.discover as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Hunter.io /discover failed: 401 Invalid API key")
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

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

    const discoverMock = hunter.discover as ReturnType<typeof vi.fn>;
    discoverMock
      .mockRejectedValueOnce(new Error("Hunter.io error"))
      .mockResolvedValueOnce(
        makeDiscoverResponse([makeDiscoverCompany({ domain: "good.ca", organization: "Good Co" })])
      );

    const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
    searchMock
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
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.results.failed).toBe(1);
    expect(result.results.completed).toBe(1);
  });

  it("stops searching when search credits exhausted mid-batch", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Only 1 search credit available
    (hunter.getAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      searches: { used: 499, available: 1 },
      verifications: { used: 0, available: 1000 },
    });

    // Discover returns 2 companies
    (hunter.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDiscoverResponse([
        makeDiscoverCompany({ domain: "first.ca", organization: "First Co" }),
        makeDiscoverCompany({ domain: "second.ca", organization: "Second Co" }),
      ])
    );

    (hunter.searchDomain as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHunterDomainSearchResponse("first.ca", "First Co", [makeHunterEmail({ value: "a@first.ca" })])
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    // Discover is free, so it was called
    expect(hunter.discover).toHaveBeenCalledOnce();
    // Only 1 search credit, so only 1 domain searched
    expect(hunter.searchDomain).toHaveBeenCalledOnce();
    expect(result.requests[0].companiesDiscovered).toBe(2);
    expect(result.requests[0].companiesSearched).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(1);
  });

  it("Discover still runs when search credits are 0 (Discover is free)", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.getAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      searches: { used: 500, available: 0 },
      verifications: { used: 0, available: 1000 },
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    // Discover is free, so it was still called
    expect(hunter.discover).toHaveBeenCalledOnce();
    // No search credits, so no domains searched
    expect(hunter.searchDomain).not.toHaveBeenCalled();
    expect(result.requests[0].companiesDiscovered).toBe(1);
    expect(result.requests[0].companiesSearched).toBe(0);
    // Still completes (not failed)
    expect(result.results.completed).toBe(1);
  });

  it("aborts batch on Hunter 429 from searchDomain", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // First request: discover returns 1 company, searchDomain throws 429
    const discoverMock = hunter.discover as ReturnType<typeof vi.fn>;
    discoverMock
      .mockResolvedValueOnce(
        makeDiscoverResponse([makeDiscoverCompany({ domain: "first.ca", organization: "First Co" })])
      )
      .mockResolvedValueOnce(
        makeDiscoverResponse([makeDiscoverCompany({ domain: "second.ca", organization: "Second Co" })])
      );

    const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
    searchMock
      .mockRejectedValueOnce(new HunterRateLimitError("Hunter.io rate limited: 429"));

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req1" }),
        makeProspectingRequestTask({ id: "req2" }),
      ])
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.results.failed).toBe(1);
    expect(result.requestsProcessed).toBe(1);
    // Second request never processed because batch was aborted
    expect(hunter.searchDomain).toHaveBeenCalledTimes(1);
    expect(alerter.send).toHaveBeenCalledWith(
      "Hunter.io rate limited",
      "Discovery batch aborted due to 429. Remaining requests will be retried next run."
    );
  });

  it("catches within-run duplicate domains across requests", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Both requests discover the same domain
    const discoverMock = hunter.discover as ReturnType<typeof vi.fn>;
    discoverMock
      .mockResolvedValueOnce(
        makeDiscoverResponse([makeDiscoverCompany({ domain: "sameco.ca", organization: "Same Co" })])
      )
      .mockResolvedValueOnce(
        makeDiscoverResponse([makeDiscoverCompany({ domain: "sameco.ca", organization: "Same Co" })])
      );

    const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
    searchMock
      .mockResolvedValueOnce(
        makeHunterDomainSearchResponse("sameco.ca", "Same Co", [makeHunterEmail({ value: "a@sameco.ca" })])
      );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req1" }),
        makeProspectingRequestTask({ id: "req2" }),
      ])
      .mockResolvedValueOnce([]); // pre-fetch: no existing prospects

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    // discover called twice (once per request, free)
    expect(hunter.discover).toHaveBeenCalledTimes(2);
    // searchDomain only called once (second request deduplicates before searching)
    expect(hunter.searchDomain).toHaveBeenCalledTimes(1);
    expect(clickup.createTask).toHaveBeenCalledTimes(1);
    expect(result.requests[0].leadsCreated).toBe(1);
    expect(result.requests[1].duplicatesSkipped).toBe(1);
    expect(result.requests[1].companiesSearched).toBe(0);
  });
});

describe("Max Results (target volume) handling", () => {
  it("caps companies searched at the request's Max Results value", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDiscoverResponse([
        makeDiscoverCompany({ domain: "a.ca", organization: "A" }),
        makeDiscoverCompany({ domain: "b.ca", organization: "B" }),
        makeDiscoverCompany({ domain: "c.ca", organization: "C" }),
      ])
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({ targetVolume: 2 })])
      .mockResolvedValueOnce([]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].companiesDiscovered).toBe(3);
    expect(hunter.searchDomain).toHaveBeenCalledTimes(2);
    expect(result.requests[0].companiesSearched).toBe(2);
  });
});

describe("dry-run performs zero external writes", () => {
  it("never mutates the Prospecting Request or creates leads when dryRun is true", async () => {
    const config = { ...makeConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const staleTask = makeProspectingRequestTask({
      id: "stale_req",
      status: "Running",
      dateUpdated: String(Date.now() - 60 * 60_000), // 60 min stale
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([staleTask])
      .mockResolvedValueOnce([makeProspectingRequestTask({ targetVolume: 2 })])
      .mockResolvedValueOnce([]);

    await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.updateTask).not.toHaveBeenCalled();
    expect(clickup.createTask).not.toHaveBeenCalled();
    expect(clickup.addComment).not.toHaveBeenCalled();
  });
});
