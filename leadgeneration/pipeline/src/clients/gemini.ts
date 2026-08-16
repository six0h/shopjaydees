import type { Logger } from "../logger.js";
import type { GeminiDraftOutput } from "../types.js";

// Pinned deliberately: an alias like gemini-flash-latest would silently change
// the model behind client outreach copy. Retirement surfaces as a 404 instead.
const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

export interface GeminiGenerateResult {
  drafts?: GeminiDraftOutput;
  tokensUsed: number;
  error?: string;
  isRateLimited?: boolean;
}

/** Interest categories for a single inbound reply to cold outreach. */
export type ReplyInterest =
  | "interested"
  | "not_interested"
  | "wrong_person"
  | "out_of_office"
  | "neutral";

export const REPLY_INTERESTS: readonly ReplyInterest[] = [
  "interested",
  "not_interested",
  "wrong_person",
  "out_of_office",
  "neutral",
] as const;

export interface GeminiClassifyResult {
  interest?: ReplyInterest;
  tokensUsed: number;
  error?: string;
  isRateLimited?: boolean;
}

export interface GeminiClient {
  generateDrafts(prompt: string): Promise<GeminiGenerateResult>;
  classifyReplyInterest(input: {
    subject: string;
    snippet: string;
  }): Promise<GeminiClassifyResult>;
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
        "Full email body for Touch 1. Personalized opening, segment-tailored value prop, Wear It Forward mention, and a why-now tied to the coming season. Ends with one specific question the reader can answer with a yes or no.",
    },
    email_touch_2_subject: {
      type: "string",
      description: "Subject line for Touch 2 (value-add follow-up). 4-8 words.",
    },
    email_touch_2_body: {
      type: "string",
      description:
        "Full email body for Touch 2. Lead with a useful insight or specific idea for their situation, then restate plainly that the seasonal ordering window is getting shorter. Light mention of Jaydees. Ends with one direct question.",
    },
    email_touch_3_subject: {
      type: "string",
      description:
        "Subject line for Touch 3 (friendly check-in). 4-8 words.",
    },
    email_touch_3_body: {
      type: "string",
      description:
        "Full email body for Touch 3. The break-up email: brief and warm, Ellie is closing the file for the season, one-line recap of the offer, an easy out, one final yes-or-no question.",
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

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    interest: {
      type: "string",
      enum: REPLY_INTERESTS as unknown as string[],
      description:
        "The recipient's interest level, inferred from their reply to a cold outreach email.",
    },
  },
  required: ["interest"],
} as const;

function buildClassifyPrompt(subject: string, snippet: string): string {
  return [
    'Classify the sentiment of a single reply to a cold outreach email sent by "Ellie" on behalf of Jaydees Apparel, a custom apparel company. Return exactly one interest category.',
    "",
    "Categories:",
    '- "interested": wants to learn more, asks about apparel, pricing, or a quote, or is open to a conversation.',
    '- "not_interested": declines, says no thanks, already has a supplier, or asks to stop.',
    '- "wrong_person": says they are not the right contact, or refers you to someone else.',
    '- "out_of_office": an automated out-of-office or vacation autoresponder.',
    '- "neutral": a genuine human reply that is none of the above, or is ambiguous.',
    "",
    `Reply subject: ${subject}`,
    `Reply body: ${snippet}`,
  ].join("\n");
}

export function createGeminiClient(
  options: GeminiClientOptions
): GeminiClient {
  const fetchFn = options.fetchFn ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 5000;

  interface GeminiCallResult {
    parsed?: unknown;
    tokensUsed: number;
    error?: string;
    isRateLimited?: boolean;
  }

  async function callModel(
    prompt: string,
    schema: unknown,
    generation: { temperature: number; maxOutputTokens: number },
    retries: number
  ): Promise<GeminiCallResult> {
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
            responseSchema: schema,
            temperature: generation.temperature,
            maxOutputTokens: generation.maxOutputTokens,
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
        return callModel(prompt, schema, generation, retries - 1);
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

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        options.logger.error("Gemini JSON parse failure", {
          rawText: rawText.slice(0, 500),
        });
        return {
          tokensUsed,
          error: `Gemini JSON parse failure: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        };
      }

      return { parsed, tokensUsed };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      options.logger.error("Gemini network error", { error: errorMsg });
      return { tokensUsed: 0, error: errorMsg };
    }
  }

  return {
    async generateDrafts(prompt: string): Promise<GeminiGenerateResult> {
      const result = await callModel(
        prompt,
        RESPONSE_SCHEMA,
        { temperature: 0.7, maxOutputTokens: 4096 },
        1
      );
      const { parsed, ...rest } = result;
      if (parsed === undefined) return rest;
      return { drafts: parsed as GeminiDraftOutput, tokensUsed: result.tokensUsed };
    },

    async classifyReplyInterest(input: {
      subject: string;
      snippet: string;
    }): Promise<GeminiClassifyResult> {
      const result = await callModel(
        buildClassifyPrompt(input.subject, input.snippet),
        CLASSIFY_SCHEMA,
        { temperature: 0, maxOutputTokens: 256 },
        1
      );
      const { parsed, ...rest } = result;
      if (parsed === undefined) return rest;

      const interest = (parsed as { interest?: unknown }).interest;
      if (
        typeof interest !== "string" ||
        !REPLY_INTERESTS.includes(interest as ReplyInterest)
      ) {
        return {
          tokensUsed: result.tokensUsed,
          error: `Gemini returned an unrecognized interest value: ${JSON.stringify(interest)}`,
        };
      }
      return { interest: interest as ReplyInterest, tokensUsed: result.tokensUsed };
    },
  };
}
