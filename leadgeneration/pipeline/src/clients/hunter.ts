import type { Logger } from "../logger.js";
import type { DiscoverCompany, DiscoverFilters } from "../types.js";

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
      seniority: string | null;
      department: string | null;
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

export interface HunterDiscoverResponse {
  data: DiscoverCompany[];
  meta: {
    results: number;
    limit: number;
    offset: number;
    filters: Record<string, unknown>;
  };
}

export interface DomainSearchOptions {
  limit?: number;
  seniority?: string[];
  department?: string[];
}

export interface HunterAccountQuota {
  searches: { used: number; available: number };
  verifications: { used: number; available: number };
}

export interface HunterClient {
  discover(filters: DiscoverFilters): Promise<HunterDiscoverResponse>;
  searchDomain(domain: string, options?: DomainSearchOptions): Promise<HunterDomainSearchResponse>;
  getAccountQuota(): Promise<HunterAccountQuota>;
}

interface HunterClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export class HunterRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HunterRateLimitError";
  }
}

export function createHunterClient(options: HunterClientOptions): HunterClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function get(path: string): Promise<unknown> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}api_key=${options.apiKey}`;
    const response = await fetchFn(url);

    if (response.status === 429) {
      const text = await response.text();
      throw new HunterRateLimitError(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function post(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}?api_key=${options.apiKey}`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const text = await response.text();
      throw new HunterRateLimitError(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  return {
    async discover(filters) {
      return (await post("/discover", filters)) as HunterDiscoverResponse;
    },

    async searchDomain(domain, options = {}) {
      const params = new URLSearchParams({
        domain,
        type: "personal",
        limit: String(options.limit ?? 10),
      });
      if (options.seniority?.length) {
        params.set("seniority", options.seniority.join(","));
      }
      if (options.department?.length) {
        params.set("department", options.department.join(","));
      }
      return (await get(`/domain-search?${params.toString()}`)) as HunterDomainSearchResponse;
    },

    async getAccountQuota() {
      const data = (await get("/account")) as {
        data: {
          requests: {
            searches: { used: number; available: number };
            verifications: { used: number; available: number };
          };
        };
      };
      return data.data.requests;
    },
  };
}
