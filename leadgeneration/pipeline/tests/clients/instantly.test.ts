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
      const mockFetch = mockFetchResponse(200, { items: campaigns });
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
      expect(url).toContain("status=1");
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

      const sequences = [
        {
          steps: [
            { type: "email" as const, delay: 4, variants: [{ subject: "{{touch_1_subject}}", body: "{{touch_1_body}}" }] },
            { type: "email" as const, delay: 5, variants: [{ subject: "{{touch_2_subject}}", body: "{{touch_2_body}}" }] },
            { type: "email" as const, delay: 0, variants: [{ subject: "{{touch_3_subject}}", body: "{{touch_3_body}}" }] },
          ],
        },
      ];

      const emailList = ["ellie@shopjaydees.ca", "ellie@shopjaydees.net"];
      const result = await client.createCampaign("Team - 2026-06", sequences, emailList);

      expect(result.id).toBe("camp_new");
      expect(result.name).toBe("Team - 2026-06");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/campaigns");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("Team - 2026-06");
      // Instantly's timezone enum has no America/Vancouver; America/Dawson is
      // the only Pacific-offset value it accepts (== Vancouver during PDT).
      // A non-enum value 400s the whole create call.
      expect(body.campaign_schedule.schedules[0].timezone).toBe("America/Dawson");
      expect(body.campaign_schedule.schedules[0].timing.from).toBe("08:00");
      expect(body.campaign_schedule.schedules[0].timing.to).toBe("17:00");
      expect(body.campaign_schedule.schedules[0].days["1"]).toBe(true);
      expect(body.campaign_schedule.schedules[0].days["5"]).toBe(true);
      expect(body.campaign_schedule.schedules[0].days["0"]).toBe(false);
      expect(body.campaign_schedule.schedules[0].days["6"]).toBe(false);
      // The 3-touch sequence must ship in the create body, or the campaign has
      // nothing to send and adding leads produces zero emails.
      expect(body.sequences).toEqual(sequences);
      // Without email_list the campaign has no sending mailboxes and sends
      // nothing even when active with leads.
      expect(body.email_list).toEqual(emailList);
    });
  });

  describe("activateCampaign", () => {
    it("POSTs to /campaigns/:id/activate with Bearer auth", async () => {
      const activated: InstantlyCampaign = {
        id: "camp_new",
        name: "Team - 2026-06",
        status: "active",
      };
      const mockFetch = mockFetchResponse(200, activated);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.activateCampaign("camp_new");

      expect(result.id).toBe("camp_new");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.instantly.ai/api/v2/campaigns/camp_new/activate");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer test_key");
      // Instantly rejects an empty body when Content-Type is application/json,
      // so activate must send a (non-empty) JSON object.
      expect(opts.body).toBe("{}");
    });
  });

  describe("addLeadToCampaign", () => {
    const lead = {
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
    };

    it("POSTs to /leads/add and normalizes the bulk response", async () => {
      // Real /leads/add success payload shape (verified live).
      const mockFetch = mockFetchResponse(200, {
        status: "success",
        leads_uploaded: 1,
        skipped_count: 0,
        invalid_email_count: 0,
        incomplete_count: 0,
        created_leads: [{ index: 0, id: "lead_abc", email: "mike@abcplumbing.ca" }],
      });
      const client = createInstantlyClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      const result: InstantlyAddLeadsResponse = await client.addLeadToCampaign("camp_001", lead);

      expect(result.uploaded).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.invalid).toBe(0);
      expect(result.leadId).toBe("lead_abc");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/leads/add");
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

    it("maps skipped_count to skipped when the lead is already in the workspace", async () => {
      const mockFetch = mockFetchResponse(200, {
        status: "success",
        leads_uploaded: 0,
        skipped_count: 1,
        invalid_email_count: 0,
        incomplete_count: 0,
        created_leads: [],
      });
      const client = createInstantlyClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      const result = await client.addLeadToCampaign("camp_001", lead);

      expect(result.skipped).toBe(1);
      expect(result.uploaded).toBe(0);
      expect(result.leadId).toBeNull();
    });

    it("sums invalid_email_count and incomplete_count into invalid", async () => {
      const mockFetch = mockFetchResponse(200, {
        status: "success",
        leads_uploaded: 0,
        skipped_count: 0,
        invalid_email_count: 1,
        incomplete_count: 0,
        created_leads: [],
      });
      const client = createInstantlyClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      const result = await client.addLeadToCampaign("camp_001", lead);

      expect(result.invalid).toBe(1);
      expect(result.uploaded).toBe(0);
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
