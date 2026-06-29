import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInstantlyClient,
  type InstantlyClient,
  type InstantlyCampaign,
  type InstantlyAddLeadsResponse,
} from "../../src/clients/instantly.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({}),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("InstantlyClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("listCampaigns", () => {
    it("fetches active campaigns with Bearer auth", async () => {
      const campaigns: InstantlyCampaign[] = [
        { id: "camp_001", name: "Business - 2026-06", status: "active" },
        { id: "camp_002", name: "School - 2026-06", status: "active" },
      ];
      const mockFetch = mockFetchResponse(200, campaigns);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.listCampaigns();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Business - 2026-06");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/campaigns");
      expect(url).toContain("limit=100");
      expect(url).toContain("status=active");
      expect(opts.headers["Authorization"]).toBe("Bearer test_key");
    });
  });

  describe("createCampaign", () => {
    it("creates a campaign with weekday 8-17 Pacific schedule", async () => {
      const newCampaign: InstantlyCampaign = {
        id: "camp_new",
        name: "Team - 2026-06",
        status: "active",
      };
      const mockFetch = mockFetchResponse(200, newCampaign);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.createCampaign("Team - 2026-06");

      expect(result.id).toBe("camp_new");
      expect(result.name).toBe("Team - 2026-06");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/campaigns");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("Team - 2026-06");
      expect(body.campaign_schedule.schedules[0].timezone).toBe("America/Vancouver");
      expect(body.campaign_schedule.schedules[0].timing.from).toBe("08:00");
      expect(body.campaign_schedule.schedules[0].timing.to).toBe("17:00");
      expect(body.campaign_schedule.schedules[0].days["1"]).toBe(true);
      expect(body.campaign_schedule.schedules[0].days["5"]).toBe(true);
      expect(body.campaign_schedule.schedules[0].days["0"]).toBe(false);
      expect(body.campaign_schedule.schedules[0].days["6"]).toBe(false);
    });
  });

  describe("addLeadToCampaign", () => {
    it("adds a lead with custom variables for all 3 touches", async () => {
      const response: InstantlyAddLeadsResponse = {
        upload_id: "upload_xyz",
        leads_uploaded: 1,
        leads_skipped: 0,
      };
      const mockFetch = mockFetchResponse(200, response);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.addLeadToCampaign("camp_001", {
        email: "mike@abcplumbing.ca",
        firstName: "Mike",
        lastName: "Thompson",
        companyName: "ABC Plumbing Ltd.",
        customVariables: {
          touch_1_subject: "Quick question about your crew's gear",
          touch_1_body: "Hi Mike,\n\nI came across ABC Plumbing...",
          touch_2_subject: "An idea for your team",
          touch_2_body: "Hi Mike,\n\nOne thing we hear...",
          touch_3_subject: "Checking in",
          touch_3_body: "Hi Mike,\n\nJust a quick follow-up...",
          sending_domain: "shopjaydees.ca",
        },
      });

      expect(result.leads_uploaded).toBe(1);
      expect(result.leads_skipped).toBe(0);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/leads");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.campaign_id).toBe("camp_001");
      expect(body.skip_if_in_workspace).toBe(true);
      expect(body.leads).toHaveLength(1);
      expect(body.leads[0].email).toBe("mike@abcplumbing.ca");
      expect(body.leads[0].first_name).toBe("Mike");
      expect(body.leads[0].last_name).toBe("Thompson");
      expect(body.leads[0].company_name).toBe("ABC Plumbing Ltd.");
      expect(body.leads[0].custom_variables.touch_1_subject).toBe(
        "Quick question about your crew's gear"
      );
    });

    it("returns leads_skipped: 1 when lead already in workspace", async () => {
      const response: InstantlyAddLeadsResponse = {
        upload_id: "upload_dup",
        leads_uploaded: 0,
        leads_skipped: 1,
      };
      const mockFetch = mockFetchResponse(200, response);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.addLeadToCampaign("camp_001", {
        email: "duplicate@test.com",
        firstName: "Dup",
        lastName: "User",
        companyName: "Dup Corp",
        customVariables: {
          touch_1_subject: "s1",
          touch_1_body: "b1",
          touch_2_subject: "s2",
          touch_2_body: "b2",
          touch_3_subject: "s3",
          touch_3_body: "b3",
          sending_domain: "shopjaydees.ca",
        },
      });

      expect(result.leads_skipped).toBe(1);
      expect(result.leads_uploaded).toBe(0);
    });
  });

  describe("listEmails", () => {
    it("GETs /emails filtered by campaign and maps pagination", async () => {
      const mockFetch = mockFetchResponse(200, {
        items: [{ id: "e1", from_address_email: "lead@acme.ca" }],
        next_starting_after: "e1",
      });
      const client = createInstantlyClient({ apiKey: "k", fetchFn: mockFetch, logger });

      const page = await client.listEmails("camp_1", { limit: 50 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/emails");
      expect(url).toContain("campaign_id=camp_1");
      expect(url).toContain("limit=50");
      expect(options.method ?? "GET").toBe("GET");
      expect(page.items).toHaveLength(1);
      expect(page.nextStartingAfter).toBe("e1");
    });

    it("passes starting_after and null-coalesces missing cursor", async () => {
      const mockFetch = mockFetchResponse(200, { items: [] });
      const client = createInstantlyClient({ apiKey: "k", fetchFn: mockFetch, logger });

      const page = await client.listEmails("camp_1", { startingAfter: "e9" });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("starting_after=e9");
      expect(page.nextStartingAfter).toBeNull();
    });
  });

  describe("error handling", () => {
    it("throws on 401 (invalid API key)", async () => {
      const mockFetch = mockFetchResponse(401, { error: "Unauthorized" });
      const client = createInstantlyClient({
        apiKey: "bad_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.listCampaigns()).rejects.toThrow("401");
    });

    it("throws InstantlyApiError on 429", async () => {
      const mockFetch = mockFetchResponse(429, { error: "Rate limited" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.listCampaigns()).rejects.toThrow("429");
    });

    it("throws InstantlyApiError on 400 (invalid email)", async () => {
      const mockFetch = mockFetchResponse(400, { error: "Invalid email format" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(
        client.addLeadToCampaign("camp_001", {
          email: "not-an-email",
          firstName: "Bad",
          lastName: "Email",
          companyName: "Test",
          customVariables: {
            touch_1_subject: "s",
            touch_1_body: "b",
            touch_2_subject: "s",
            touch_2_body: "b",
            touch_3_subject: "s",
            touch_3_body: "b",
            sending_domain: "shopjaydees.ca",
          },
        })
      ).rejects.toThrow("400");
    });

    it("exposes error type via error.code property", async () => {
      const mockFetch = mockFetchResponse(429, { error: "Rate limited" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      try {
        await client.listCampaigns();
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as Error & { code: number };
        expect(error.code).toBe(429);
      }
    });
  });
});
