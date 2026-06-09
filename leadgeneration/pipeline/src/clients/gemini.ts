import type { Logger } from "../logger.js";
import type { GeminiDraftOutput } from "../types.js";

const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface GeminiGenerateResult {
  drafts?: GeminiDraftOutput;
  tokensUsed: number;
  error?: string;
  isRateLimited?: boolean;
}

export interface GeminiClient {
  generateDrafts(prompt: string): Promise<GeminiGenerateResult>;
}

interface GeminiClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
  retryDelayMs?: number;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    website_scrape_summary: {
      type: "string",
      description:
        "2-3 sentence summary of the prospect's business based on their website. What they do, who they serve, their brand feel.",
    },
    community_signals: {
      type: "string",
      description:
        "Any community involvement, sponsorships, charity work, or causes found on the website. These bridge to Wear It Forward. Empty string if none found.",
    },
    personalization_hooks: {
      type: "string",
      description:
        "Key personalization elements: recent news, seasonal timing, specific services to reference, angles for outreach. Working notes explaining why the drafts say what they say.",
    },
    email_touch_1_subject: {
      type: "string",
      description:
        "Subject line for Touch 1 (intro + value prop). 4-8 words, no clickbait.",
    },
    email_touch_1_body: {
      type: "string",
      description:
        "Full email body for Touch 1. Personalized opening, segment-tailored value prop, Wear It Forward mention, soft CTA.",
    },
    email_touch_2_subject: {
      type: "string",
      description: "Subject line for Touch 2 (value-add follow-up). 4-8 words.",
    },
    email_touch_2_body: {
      type: "string",
      description:
        "Full email body for Touch 2. Lead with a useful insight or specific idea for their situation. Light mention of Jaydees.",
    },
    email_touch_3_subject: {
      type: "string",
      description:
        "Subject line for Touch 3 (friendly check-in). 4-8 words.",
    },
    email_touch_3_body: {
      type: "string",
      description:
        "Full email body for Touch 3. Brief, friendly, leaves door open. No pressure.",
    },
    linkedin_message: {
      type: "string",
      description:
        "LinkedIn connection request note. Short, personal, no sell. Under 300 characters.",
    },
    casl_opt_out_check: {
      type: "boolean",
      description:
        "true if no 'do not contact' or 'do not solicit' language was found on the prospect's website. false if such language was found.",
    },
    casl_relevance_rationale: {
      type: "string",
      description:
        "One sentence explaining why custom apparel outreach is relevant to this person's role. Reference their title and company.",
    },
  },
  required: [
    "website_scrape_summary",
    "community_signals",
    "personalization_hooks",
    "email_touch_1_subject",
    "email_touch_1_body",
    "email_touch_2_subject",
    "email_touch_2_body",
    "email_touch_3_subject",
    "email_touch_3_body",
    "linkedin_message",
    "casl_opt_out_check",
    "casl_relevance_rationale",
  ],
} as const;

export function createGeminiClient(
  options: GeminiClientOptions
): GeminiClient {
  const fetchFn = options.fetchFn ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 5000;

  async function doGenerate(
    prompt: string,
    retries: number
  ): Promise<GeminiGenerateResult> {
    try {
      const url = `${BASE_URL}?key=${options.apiKey}`;

      const response = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (response.status === 429) {
        const text = await response.text();
        options.logger.warn("Gemini 429 rate limited", {
          response: text.slice(0, 200),
        });
        return {
          tokensUsed: 0,
          error: `Gemini 429: ${text.slice(0, 200)}`,
          isRateLimited: true,
        };
      }

      if (
        (response.status === 500 || response.status === 503) &&
        retries > 0
      ) {
        options.logger.warn("Gemini server error — retrying", {
          status: response.status,
          retriesLeft: retries - 1,
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        return doGenerate(prompt, retries - 1);
      }

      if (!response.ok) {
        const text = await response.text();
        return {
          tokensUsed: 0,
          error: `Gemini ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const body = (await response.json()) as {
        candidates?: Array<{
          content: { parts: Array<{ text: string }> };
          finishReason: string;
        }>;
        usageMetadata?: { totalTokenCount?: number };
      };

      const tokensUsed = body.usageMetadata?.totalTokenCount ?? 0;
      const candidate = body.candidates?.[0];

      if (!candidate) {
        return {
          tokensUsed,
          error: "Gemini returned no candidates",
        };
      }

      if (candidate.finishReason === "SAFETY") {
        return {
          tokensUsed,
          error: "Gemini SAFETY filter triggered — content refused",
        };
      }

      if (candidate.finishReason === "MAX_TOKENS") {
        return {
          tokensUsed,
          error: "Gemini MAX_TOKENS — output truncated",
        };
      }

      const rawText = candidate.content.parts[0]?.text;
      if (!rawText) {
        return {
          tokensUsed,
          error: "Gemini returned empty text in response",
        };
      }

      let drafts: GeminiDraftOutput;
      try {
        drafts = JSON.parse(rawText) as GeminiDraftOutput;
      } catch (parseErr) {
        options.logger.error("Gemini JSON parse failure", {
          rawText: rawText.slice(0, 500),
        });
        return {
          tokensUsed,
          error: `Gemini JSON parse failure: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        };
      }

      return { drafts, tokensUsed };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      options.logger.error("Gemini network error", { error: errorMsg });
      return { tokensUsed: 0, error: errorMsg };
    }
  }

  return {
    async generateDrafts(prompt: string) {
      return doGenerate(prompt, 1);
    },
  };
}
