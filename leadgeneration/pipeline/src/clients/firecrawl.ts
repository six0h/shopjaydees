import type { Logger } from "../logger.js";
import type { FirecrawlScrapeResult } from "../types.js";
import { ABOUT_PATH_KEYWORDS, COMMUNITY_PATH_KEYWORDS } from "../types.js";

const BASE_URL = "https://api.firecrawl.dev/v1";

export interface FirecrawlClient {
  scrape(url: string): Promise<FirecrawlScrapeResult & { error?: string }>;
}

interface FirecrawlClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
  /** Override retry delay in ms (default: retryAfter * 1000). Useful for testing. */
  retryDelayMs?: number;
}

export function findSecondaryPages(
  links: string[],
  baseDomain: string
): string[] {
  let baseHost: string;
  try {
    baseHost = new URL(baseDomain).hostname;
  } catch {
    baseHost = baseDomain.replace(/^https?:\/\//, "").split("/")[0];
  }

  const aboutPages: string[] = [];
  const communityPages: string[] = [];

  for (const link of links) {
    let linkHost: string;
    let linkPath: string;
    try {
      const parsed = new URL(link);
      linkHost = parsed.hostname;
      linkPath = parsed.pathname.toLowerCase().replace(/\/$/, "");
    } catch {
      continue;
    }

    if (linkHost !== baseHost) continue;

    const isAbout = ABOUT_PATH_KEYWORDS.some((kw) => linkPath === kw || linkPath.startsWith(kw + "/"));
    if (isAbout && aboutPages.length === 0) {
      aboutPages.push(link);
      continue;
    }

    const isCommunity = COMMUNITY_PATH_KEYWORDS.some((kw) => linkPath === kw || linkPath.startsWith(kw + "/"));
    if (isCommunity && communityPages.length === 0) {
      communityPages.push(link);
      continue;
    }
  }

  return [...aboutPages, ...communityPages].slice(0, 2);
}

export function createFirecrawlClient(
  options: FirecrawlClientOptions
): FirecrawlClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function doScrape(
    url: string,
    retries: number
  ): Promise<FirecrawlScrapeResult & { error?: string }> {
    try {
      const response = await fetchFn(`${BASE_URL}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 3000,
          timeout: 15000,
        }),
      });

      if ((response.status === 408 || response.status === 429) && retries > 0) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") ?? "5",
          10
        );
        options.logger.warn("Firecrawl retryable error", {
          url,
          status: response.status,
          retryAfter,
          retriesLeft: retries - 1,
        });
        const delayMs = options.retryDelayMs ?? retryAfter * 1000;
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        return doScrape(url, retries - 1);
      }

      if (!response.ok) {
        const text = await response.text();
        options.logger.warn("Firecrawl scrape failed", {
          url,
          status: response.status,
          response: text.slice(0, 200),
        });
        return {
          success: false,
          error: `Firecrawl ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const body = (await response.json()) as FirecrawlScrapeResult;

      if (!body.success) {
        options.logger.warn("Firecrawl returned success=false", { url });
        return { success: false, error: "Firecrawl returned success=false" };
      }

      return body;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      options.logger.error("Firecrawl network error", { url, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  return {
    async scrape(url: string) {
      return doScrape(url, 1);
    },
  };
}
