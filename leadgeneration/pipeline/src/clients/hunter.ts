import type { Logger } from "../logger.js";

const BASE_URL = "https://api.hunter.io/v2";

export interface HunterDomainSearchResponse {
  data: {
    domain: string;
    organization: string;
    emails: Array<{
      value: string;
      type: "personal" | "generic";
      confidence: number;
      first_name: string | null;
      last_name: string | null;
      position: string | null;
      linkedin: string | null;
      phone_number: string | null;
      sources: Array<{ uri: string; domain: string }>;
    }>;
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
  };
}

export interface HunterAccountQuota {
  used: number;
  available: number;
}

export interface HunterClient {
  searchDomain(
    query: string,
    limit?: number
  ): Promise<HunterDomainSearchResponse>;
  getAccountQuota(): Promise<HunterAccountQuota>;
}

interface HunterClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function createHunterClient(options: HunterClientOptions): HunterClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function request(path: string): Promise<unknown> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}api_key=${options.apiKey}`;

    const response = await fetchFn(url);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }

    return response.json();
  }

  return {
    async searchDomain(query, limit = 10) {
      const params = new URLSearchParams({
        company: query,
        type: "personal",
        limit: String(limit),
      });
      return (await request(
        `/domain-search?${params.toString()}`
      )) as HunterDomainSearchResponse;
    },

    async getAccountQuota() {
      const data = (await request("/account")) as {
        data: { requests: { used: number; available: number } };
      };
      return data.data.requests;
    },
  };
}
