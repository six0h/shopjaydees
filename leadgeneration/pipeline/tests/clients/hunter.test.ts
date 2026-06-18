import { describe, it, expect, vi } from "vitest";
import { createHunterClient, HunterRateLimitError } from "../../src/clients/hunter.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("HunterClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("searchDomain", () => {
    it("queries domain-search with domain parameter", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: {
          domain: "abcplumbing.ca",
          organization: "ABC Plumbing",
          emails: [
            {
              value: "mike@abcplumbing.ca",
              type: "personal",
              confidence: 91,
              first_name: "Mike",
              last_name: "Thompson",
              position: "Owner",
              seniority: "executive",
              department: "executive",
              linkedin: "https://linkedin.com/in/mike",
              phone_number: null,
              sources: [{ uri: "https://abcplumbing.ca/about", domain: "abcplumbing.ca" }],
            },
          ],
        },
        meta: { results: 1, limit: 10, offset: 0 },
      });

      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.searchDomain("abcplumbing.ca");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("api.hunter.io/v2/domain-search");
      expect(url).toContain("domain=abcplumbing.ca");
      expect(url).not.toContain("company=");
      expect(url).toContain("api_key=test_key");
      expect(result.data.emails).toHaveLength(1);
      expect(result.data.emails[0].value).toBe("mike@abcplumbing.ca");
    });

    it("passes limit parameter", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: { domain: "", organization: "", emails: [] },
        meta: { results: 0, limit: 25, offset: 0 },
      });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await client.searchDomain("test.ca", { limit: 25 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("limit=25");
    });

    it("passes seniority and department filters", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: { domain: "test.ca", organization: "Test", emails: [] },
        meta: { results: 0, limit: 10, offset: 0 },
      });
      const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      await client.searchDomain("test.ca", {
        limit: 10,
        seniority: ["executive", "senior"],
        department: ["executive", "management"],
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("seniority=executive%2Csenior");
      expect(url).toContain("department=executive%2Cmanagement");
    });
  });

  describe("discover", () => {
    it("posts structured filters to /discover", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: [
          {
            domain: "abcplumbing.ca",
            organization: "ABC Plumbing",
            emails_count: { personal: 5, generic: 2, total: 7 },
          },
        ],
        meta: { results: 1, limit: 100, offset: 0, filters: {} },
      });
      const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      const result = await client.discover({
        headcount: ["1-10", "11-50"],
        headquarters_location: { include: [{ country: "CA", city: "Surrey" }] },
        keywords: { include: ["plumbing", "HVAC"], match: "any" },
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("api.hunter.io/v2/discover");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.headcount).toEqual(["1-10", "11-50"]);
      expect(body.headquarters_location.include[0].city).toBe("Surrey");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].domain).toBe("abcplumbing.ca");
    });

    it("throws HunterRateLimitError on 429", async () => {
      const mockFetch = mockFetchResponse(429, { errors: [{ details: "Rate limit" }] });
      const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

      await expect(
        client.discover({ headcount: ["1-10"] })
      ).rejects.toBeInstanceOf(HunterRateLimitError);
    });
  });

  describe("getAccountQuota", () => {
    it("returns quota usage with searches and verifications", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: {
          requests: {
            searches: { used: 150, available: 350 },
            verifications: { used: 100, available: 20000 },
          },
        },
      });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const quota = await client.getAccountQuota();

      expect(quota.searches.used).toBe(150);
      expect(quota.searches.available).toBe(350);
      expect(quota.verifications.used).toBe(100);
      expect(quota.verifications.available).toBe(20000);
    });
  });

  describe("error handling", () => {
    it("throws on 401 (invalid API key)", async () => {
      const mockFetch = mockFetchResponse(401, { errors: [{ details: "Invalid API key" }] });
      const client = createHunterClient({
        apiKey: "bad_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.searchDomain("test.ca")).rejects.toThrow("401");
    });

    it("throws on 429 (rate limit) for searchDomain", async () => {
      const mockFetch = mockFetchResponse(429, { errors: [{ details: "Rate limit" }] });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.searchDomain("test.ca")).rejects.toBeInstanceOf(HunterRateLimitError);
    });
  });
});
