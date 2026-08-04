import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGeminiClient,
  type GeminiClient,
} from "../../src/clients/gemini.js";
import { createLogger } from "../../src/logger.js";
import type { GeminiDraftOutput } from "../../src/types.js";

function makeMockDraftOutput(): GeminiDraftOutput {
  return {
    website_scrape_summary:
      "ABC Plumbing is a family-owned plumbing company serving Surrey and the Fraser Valley since 2005. They specialize in residential and commercial plumbing with 24/7 emergency service.",
    community_signals:
      "Sponsors Surrey Minor Hockey Association. Participated in Habitat for Humanity builds in 2025.",
    personalization_hooks:
      "Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward, trades segment seasonal ramp in spring.",
    email_touch_1_subject: "Quick question about your crew's gear",
    email_touch_1_body:
      "Hi Mike,\n\nI came across ABC Plumbing while looking into trades companies in Surrey and really liked what I saw — 20 years of serving the Fraser Valley is no small thing.\n\nI'm Ellie from ShopJaydees. We help trades businesses like yours with branded work wear — everything from crew uniforms to safety vests with your logo. One thing that makes us a bit different is our Wear It Forward program, where a portion of every order goes back to community initiatives.\n\nWould it be worth a quick conversation about getting your team set up?\n\nEllie",
    email_touch_2_subject: "An idea for your crew",
    email_touch_2_body:
      "Hi Mike,\n\nOne thing we hear from trades companies is that consistent branded gear across the crew makes a real difference at job sites — clients notice, and it builds trust.\n\nWe make it easy to set up a team store so you can order as you hire, without minimums or inventory headaches.\n\nHappy to share some examples if that would be useful.\n\nEllie",
    email_touch_3_subject: "Checking in",
    email_touch_3_body:
      "Hi Mike,\n\nJust a quick follow-up in case the timing is better now. If branded gear for your crew is on the radar, I'd love to help.\n\nNo pressure — happy to connect whenever it makes sense.\n\nEllie",
    linkedin_message:
      "Hi Mike — came across ABC Plumbing and love that you sponsor Surrey minor hockey. Would love to connect!",
    casl_opt_out_check: true,
    casl_relevance_rationale:
      "As Owner of a 20-person plumbing company, Mike likely oversees purchasing of branded work wear and crew uniforms.",
  };
}

function mockGeminiResponse(
  status: number,
  draftOutput?: GeminiDraftOutput,
  finishReason = "STOP"
) {
  const body =
    status >= 200 && status < 300
      ? {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(draftOutput) }],
              },
              finishReason,
            },
          ],
          usageMetadata: {
            promptTokenCount: 1200,
            candidatesTokenCount: 2800,
            totalTokenCount: 4000,
          },
        }
      : { error: { message: "Error", code: status } };

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("GeminiClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("generateDrafts", () => {
    it("sends prompt to Gemini with structured JSON output schema and returns parsed result", async () => {
      const draftOutput = makeMockDraftOutput();
      const mockFetch = mockGeminiResponse(200, draftOutput);
      const client = createGeminiClient({
        apiKey: "test_gemini_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("Test prompt here");

      expect(result.drafts).toBeDefined();
      expect(result.drafts!.website_scrape_summary).toContain("ABC Plumbing");
      expect(result.drafts!.email_touch_1_body).toContain("Mike");
      expect(result.tokensUsed).toBe(4000);
      expect(result.error).toBeUndefined();

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
      expect(url).toContain("key=test_gemini_key");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.contents[0].parts[0].text).toBe("Test prompt here");
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.generationConfig.responseSchema).toBeDefined();
      expect(body.generationConfig.temperature).toBe(0.7);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });

    it("returns error on HTTP 429 (rate limited)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: () => Promise.resolve({ error: { message: "Rate limited" } }),
        text: () => Promise.resolve("Rate limited"),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("429");
      expect(result.isRateLimited).toBe(true);
    });

    it("retries once on HTTP 500, then returns error", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Server error" } }),
          text: () => Promise.resolve("Server error"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Server error" } }),
          text: () => Promise.resolve("Server error"),
        });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
        retryDelayMs: 0,
      });

      const result = await client.generateDrafts("prompt");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.error).toContain("500");
    });

    it("retries once on HTTP 503 and succeeds on second attempt", async () => {
      const draftOutput = makeMockDraftOutput();
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Unavailable" } }),
          text: () => Promise.resolve("Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: { parts: [{ text: JSON.stringify(draftOutput) }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 1200,
                candidatesTokenCount: 2800,
                totalTokenCount: 4000,
              },
            }),
          text: () => Promise.resolve(""),
        });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
        retryDelayMs: 0,
      });

      const result = await client.generateDrafts("prompt");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.drafts).toBeDefined();
    });

    it("returns error on SAFETY finish reason", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: "" }] },
            finishReason: "SAFETY",
          },
        ],
        usageMetadata: { totalTokenCount: 500 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("SAFETY");
    });

    it("returns error on MAX_TOKENS finish reason", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: '{"partial": true}' }] },
            finishReason: "MAX_TOKENS",
          },
        ],
        usageMetadata: { totalTokenCount: 4096 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("MAX_TOKENS");
    });

    it("returns error on JSON parse failure", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: "This is not JSON {{{" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { totalTokenCount: 1000 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("parse");
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  describe("classifyReplyInterest", () => {
    function mockClassifyResponse(interest: string, status = 200) {
      const body =
        status >= 200 && status < 300
          ? {
              candidates: [
                {
                  content: { parts: [{ text: JSON.stringify({ interest }) }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: { totalTokenCount: 42 },
            }
          : { error: { message: "Error", code: status } };
      return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    }

    it("returns the interest label from a classified reply", async () => {
      const mockFetch = mockClassifyResponse("not_interested");
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.classifyReplyInterest({
        subject: "Re: Quick question about your crew's gear",
        snippet: "Thanks, but we already have a supplier. Not interested.",
      });

      expect(result.interest).toBe("not_interested");
      expect(result.error).toBeUndefined();
    });

    it("surfaces a 429 as rate limited without an interest label", async () => {
      const mockFetch = mockClassifyResponse("interested", 429);
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.classifyReplyInterest({
        subject: "Re: gear",
        snippet: "Yes please, tell me more.",
      });

      expect(result.interest).toBeUndefined();
      expect(result.isRateLimited).toBe(true);
    });

    it("returns an error when the model emits an unrecognized label", async () => {
      const mockFetch = mockClassifyResponse("maybe_later");
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.classifyReplyInterest({
        subject: "Re: gear",
        snippet: "Circle back next quarter.",
      });

      expect(result.interest).toBeUndefined();
      expect(result.error).toContain("unrecognized interest");
    });
  });
});
