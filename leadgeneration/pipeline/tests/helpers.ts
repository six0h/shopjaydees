import type { ClickUpTask, HunterContact } from "../src/types.js";

export function makeClickUpTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: "task_test_001",
    name: "Test Co — Jane Doe",
    status: { status: "Requested" },
    date_created: String(Date.now()),
    date_updated: String(Date.now()),
    custom_fields: [],
    tags: [],
    ...overrides,
  };
}

export function makeProspectingRequestTask(opts: {
  id?: string;
  segment?: string;
  category?: string;
  city?: string;
  maxResults?: number;
  status?: string;
  dateUpdated?: string;
}): ClickUpTask {
  const segmentIndex = { Business: 0, School: 1, Team: 2 }[opts.segment ?? "Business"] ?? 0;
  return makeClickUpTask({
    id: opts.id ?? "req_001",
    name: `${opts.segment ?? "Business"} — ${opts.category ?? "Trades & Contractors"} in ${opts.city ?? "Surrey"}`,
    status: { status: opts.status ?? "Requested" },
    date_updated: opts.dateUpdated ?? String(Date.now()),
    custom_fields: [
      {
        id: "field-segment",
        name: "Segment",
        value: segmentIndex,
        type: "drop_down",
        type_config: {
          options: [
            { id: "opt0", name: "Business", orderindex: 0 },
            { id: "opt1", name: "School", orderindex: 1 },
            { id: "opt2", name: "Team", orderindex: 2 },
          ],
        },
      },
      {
        id: "field-category",
        name: "Category",
        value: 0,
        type: "drop_down",
        type_config: {
          options: [{ id: "cat0", name: opts.category ?? "Trades & Contractors", orderindex: 0 }],
        },
      },
      {
        id: "field-city",
        name: "Target City",
        value: 0,
        type: "drop_down",
        type_config: {
          options: [{ id: "city0", name: opts.city ?? "Surrey", orderindex: 0 }],
        },
      },
      {
        id: "field-max-results",
        name: "Max Results",
        value: opts.maxResults ?? null,
        type: "number",
      },
    ],
  });
}

export function makeHunterEmail(overrides: Partial<HunterContact> = {}): HunterContact {
  return {
    value: "mike@abcplumbing.ca",
    type: "personal",
    confidence: 91,
    first_name: "Mike",
    last_name: "Thompson",
    full_name: "Mike Thompson",
    position: "Owner",
    linkedin: "https://linkedin.com/in/mike-thompson",
    phone_number: null,
    sources: [{ uri: "https://abcplumbing.ca/about", domain: "abcplumbing.ca" }],
    ...overrides,
  };
}

export function makeHunterDomainSearchResponse(
  domain: string,
  organization: string,
  emails: HunterContact[]
) {
  return {
    data: { domain, organization, emails },
    meta: { results: emails.length, limit: 10, offset: 0 },
  };
}
