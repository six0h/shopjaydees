import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFirecrawlClient,
  findSecondaryPages,
  type FirecrawlClient,
} from "../../src/clients/firecrawl.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "x-ratelimit-remaining": "50",
      "retry-after": "5",
    }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("FirecrawlClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("scrape", () => {
    it("scrapes a URL and returns markdown + links", async () => {
      const mockFetch = mockFetchResponse(200, {
        success: true,
        data: {
          markdown: "# ABC Plumbing\n\nServing Surrey since 2005.",
          metadata: {
            title: "ABC Plumbing Ltd.",
            sourceURL: "https://abcplumbing.ca",
            statusCode: 200,
          },
          links: [
            "https://abcplumbing.ca/about",
            "https://abcplumbing.ca/services",
            "https://abcplumbing.ca/community",
          ],
        },
      });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://abcplumbing.ca");

      expect(result.success).toBe(true);
      expect(result.data?.markdown).toContain("ABC Plumbing");
      expect(result.data?.links).toHaveLength(3);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.firecrawl.dev/v1/scrape");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer fc_test_key");
      const body = JSON.parse(opts.body);
      expect(body.url).toBe("https://abcplumbing.ca");
      expect(body.formats).toEqual(["markdown", "links"]);
      expect(body.onlyMainContent).toBe(true);
      expect(body.waitFor).toBe(3000);
      expect(body.timeout).toBe(15000);
    });

    it("returns success=false on HTTP 402 (quota exceeded)", async () => {
      const mockFetch = mockFetchResponse(402, {
        error: "Quota exceeded",
      });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("402");
    });

    it("returns success=false on HTTP 500", async () => {
      const mockFetch = mockFetchResponse(500, { error: "Internal server error" });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("retries once on HTTP 408 (timeout) then returns failure", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          headers: new Headers(),
          json: () => Promise.resolve({ error: "Timeout" }),
          text: () => Promise.resolve("Timeout"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          headers: new Headers(),
          json: () => Promise.resolve({ error: "Timeout" }),
          text: () => Promise.resolve("Timeout"),
        });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        retryDelayMs: 0,
        logger,
      });

      const result = await client.scrape("https://slow-site.com");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
    });

    it("retries once on HTTP 429 (rate limited) then returns failure", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          json: () => Promise.resolve({ error: "Rate limited" }),
          text: () => Promise.resolve("Rate limited"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          json: () => Promise.resolve({ error: "Rate limited" }),
          text: () => Promise.resolve("Rate limited"),
        });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        retryDelayMs: 0,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
    });

    it("handles Firecrawl returning success=false in body", async () => {
      const mockFetch = mockFetchResponse(200, {
        success: false,
        error: "Page not found",
      });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://no-such-site.com");

      expect(result.success).toBe(false);
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://unreachable.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  describe("findSecondaryPages", () => {
    it("identifies about, community, and contact pages from links", () => {
      const links = [
        "https://abcplumbing.ca/about",
        "https://abcplumbing.ca/services",
        "https://abcplumbing.ca/community",
        "https://abcplumbing.ca/contact",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(3);
      expect(pages[0]).toBe("https://abcplumbing.ca/about");
      expect(pages[1]).toBe("https://abcplumbing.ca/community");
      expect(pages[2]).toBe("https://abcplumbing.ca/contact");
    });

    it("returns at most 3 pages (one per bucket)", () => {
      const links = [
        "https://example.com/about",
        "https://example.com/about-us",
        "https://example.com/team",
        "https://example.com/community",
        "https://example.com/giving",
        "https://example.com/contact",
        "https://example.com/contact-us",
      ];

      const pages = findSecondaryPages(links, "https://example.com");

      expect(pages).toHaveLength(3);
    });

    it("prioritizes about pages over community pages", () => {
      const links = [
        "https://example.com/community",
        "https://example.com/about-us",
      ];

      const pages = findSecondaryPages(links, "https://example.com");

      expect(pages[0]).toBe("https://example.com/about-us");
      expect(pages[1]).toBe("https://example.com/community");
    });

    it("excludes external domain links", () => {
      const links = [
        "https://facebook.com/abcplumbing/about",
        "https://abcplumbing.ca/about",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe("https://abcplumbing.ca/about");
    });

    it("returns empty array when no matching pages found", () => {
      const links = [
        "https://abcplumbing.ca/services",
        "https://abcplumbing.ca/faq",
        "https://abcplumbing.ca/pricing",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(0);
    });

    it("handles links with trailing slashes and mixed case", () => {
      const links = [
        "https://abcplumbing.ca/About-Us/",
        "https://abcplumbing.ca/Community/",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(2);
    });
  });
});
