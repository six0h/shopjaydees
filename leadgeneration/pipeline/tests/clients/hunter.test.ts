import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHunterClient, type HunterClient } from "../../src/clients/hunter.js";
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
    it("queries domain-search with company parameter", async () => {
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

      const result = await client.searchDomain("plumbing Surrey BC");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("api.hunter.io/v2/domain-search");
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

      await client.searchDomain("test", 25);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("limit=25");
    });
  });

  describe("getAccountQuota", () => {
    it("returns quota usage", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: {
          requests: { used: 150, available: 350 },
        },
      });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const quota = await client.getAccountQuota();

      expect(quota.used).toBe(150);
      expect(quota.available).toBe(350);
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

      await expect(client.searchDomain("test")).rejects.toThrow("401");
    });

    it("throws on 429 (rate limit)", async () => {
      const mockFetch = mockFetchResponse(429, { errors: [{ details: "Rate limit" }] });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.searchDomain("test")).rejects.toThrow("429");
    });
  });
});
