import type { Logger } from "../logger.js";

const BASE_URL = "https://api.instantly.ai/api/v2";

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: string;
}

/** Normalized result of a bulk /leads/add call. */
export interface InstantlyAddLeadsResponse {
  /** Instantly lead id of the first created lead, or null if none created. */
  leadId: string | null;
  uploaded: number;
  /** Skipped as already-in-workspace/campaign/list (skip_if_* flags). */
  skipped: number;
  /** Rejected as invalid or incomplete email. */
  invalid: number;
}

/** Raw shape returned by POST /api/v2/leads/add (verified live). */
interface InstantlyAddLeadsRaw {
  leads_uploaded?: number;
  skipped_count?: number;
  invalid_email_count?: number;
  incomplete_count?: number;
  created_leads?: Array<{ id?: string }>;
}

export interface InstantlyLeadInput {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  customVariables: Record<string, string>;
}

export interface InstantlyEmailVariant {
  subject: string;
  body: string;
}

export interface InstantlySequenceStep {
  type: "email";
  /** Days to wait before the NEXT step. 0 on the final step. */
  delay: number;
  variants: InstantlyEmailVariant[];
}

export interface InstantlySequence {
  steps: InstantlySequenceStep[];
}

export type InstantlyRawEmail = Record<string, unknown>;

export interface InstantlyEmailPage {
  items: InstantlyRawEmail[];
  nextStartingAfter: string | null;
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
  createCampaign(
    name: string,
    sequences: InstantlySequence[],
    emailList: string[]
  ): Promise<InstantlyCampaign>;
  activateCampaign(campaignId: string): Promise<InstantlyCampaign>;
  addLeadToCampaign(
    campaignId: string,
    lead: InstantlyLeadInput
  ): Promise<InstantlyAddLeadsResponse>;
  listEmails(
    campaignId: string,
    opts?: { startingAfter?: string; limit?: number }
  ): Promise<InstantlyEmailPage>;
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
      // Instantly v2 requires `status` as a numeric enum (1 = active), not the
      // string "active", and returns a paginated `{ items: [...] }` envelope.
      const params = new URLSearchParams({
        limit: "100",
        status: "1",
      });
      const page = (await request(
        "GET",
        `/campaigns?${params.toString()}`
      )) as { items?: InstantlyCampaign[] };
      return page.items ?? [];
    },

    async createCampaign(
      name: string,
      sequences: InstantlySequence[],
      emailList: string[]
    ): Promise<InstantlyCampaign> {
      return (await request("POST", "/campaigns", {
        name,
        sequences,
        email_list: emailList,
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
              // Instantly's schedule timezone is a fixed enum with no
              // America/Vancouver; America/Dawson is its only Pacific-offset
              // value (identical to Vancouver during PDT). Any other string
              // 400s the entire create-campaign call.
              timezone: "America/Dawson",
              timing: {
                from: "08:00",
                to: "17:00",
              },
            },
          ],
        },
      })) as InstantlyCampaign;
    },

    async activateCampaign(campaignId: string): Promise<InstantlyCampaign> {
      // Empty object, not undefined: Instantly 400s an empty body when the
      // Content-Type is application/json (which `request` always sets).
      return (await request(
        "POST",
        `/campaigns/${campaignId}/activate`,
        {}
      )) as InstantlyCampaign;
    },

    async addLeadToCampaign(
      campaignId: string,
      lead: InstantlyLeadInput
    ): Promise<InstantlyAddLeadsResponse> {
      // Bulk add endpoint: POST /leads/add (NOT /leads, which is single-lead
      // create with a different, top-level schema and no upload counts).
      const raw = (await request("POST", "/leads/add", {
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
      })) as InstantlyAddLeadsRaw;

      return {
        leadId: raw.created_leads?.[0]?.id ?? null,
        uploaded: raw.leads_uploaded ?? 0,
        skipped: raw.skipped_count ?? 0,
        invalid: (raw.invalid_email_count ?? 0) + (raw.incomplete_count ?? 0),
      };
    },

    async listEmails(campaignId, opts = {}): Promise<InstantlyEmailPage> {
      const params = new URLSearchParams({ campaign_id: campaignId });
      params.set("limit", String(opts.limit ?? 100));
      if (opts.startingAfter) params.set("starting_after", opts.startingAfter);
      const data = (await request("GET", `/emails?${params.toString()}`)) as {
        items?: InstantlyRawEmail[];
        next_starting_after?: string | null;
      };
      return {
        items: data.items ?? [],
        nextStartingAfter: data.next_starting_after ?? null,
      };
    },
  };
}
