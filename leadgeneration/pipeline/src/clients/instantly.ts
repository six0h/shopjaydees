import type { Logger } from "../logger.js";

const BASE_URL = "https://api.instantly.ai/api/v2";

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: string;
}

export interface InstantlyAddLeadsResponse {
  upload_id: string;
  leads_uploaded: number;
  leads_skipped: number;
}

export interface InstantlyLeadInput {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  customVariables: Record<string, string>;
}

export class InstantlyApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "InstantlyApiError";
    this.code = code;
  }
}

export interface InstantlyClient {
  listCampaigns(): Promise<InstantlyCampaign[]>;
  createCampaign(name: string): Promise<InstantlyCampaign>;
  addLeadToCampaign(
    campaignId: string,
    lead: InstantlyLeadInput
  ): Promise<InstantlyAddLeadsResponse>;
}

interface InstantlyClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function createInstantlyClient(
  options: InstantlyClientOptions
): InstantlyClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const response = await fetchFn(url, opts);

    if (!response.ok) {
      const text = await response.text();
      throw new InstantlyApiError(
        `Instantly API ${method} ${path} failed: ${response.status} ${text}`,
        response.status
      );
    }

    return response.json();
  }

  return {
    async listCampaigns(): Promise<InstantlyCampaign[]> {
      const params = new URLSearchParams({
        limit: "100",
        status: "active",
      });
      return (await request(
        "GET",
        `/campaigns?${params.toString()}`
      )) as InstantlyCampaign[];
    },

    async createCampaign(name: string): Promise<InstantlyCampaign> {
      return (await request("POST", "/campaigns", {
        name,
        campaign_schedule: {
          schedules: [
            {
              name: "Weekdays",
              days: {
                "0": false,
                "1": true,
                "2": true,
                "3": true,
                "4": true,
                "5": true,
                "6": false,
              },
              timezone: "America/Vancouver",
              timing: {
                from: "08:00",
                to: "17:00",
              },
            },
          ],
        },
      })) as InstantlyCampaign;
    },

    async addLeadToCampaign(
      campaignId: string,
      lead: InstantlyLeadInput
    ): Promise<InstantlyAddLeadsResponse> {
      return (await request("POST", "/leads", {
        campaign_id: campaignId,
        skip_if_in_workspace: true,
        leads: [
          {
            email: lead.email,
            first_name: lead.firstName,
            last_name: lead.lastName,
            company_name: lead.companyName,
            custom_variables: lead.customVariables,
          },
        ],
      })) as InstantlyAddLeadsResponse;
    },
  };
}
