import type { ClickUpTask, HunterContact, LeadData, GeminiDraftOutput } from "../src/types.js";
import type { Config } from "../src/config.js";

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

export function makeLeadData(overrides: Partial<LeadData> = {}): LeadData {
  return {
    taskId: "task_lead_001",
    companyName: "ABC Plumbing Ltd.",
    companyDomain: "https://abcplumbing.ca",
    contactName: "Mike Thompson",
    contactTitle: "Owner",
    segment: "Business",
    category: "Trades & Contractors",
    leadScore: 4,
    companyIndustry: "Construction",
    companyHeadcount: "11-50",
    companyCity: "Surrey",
    isReEngagement: false,
    ...overrides,
  };
}

export function makeEnrichedClickUpTask(opts: {
  id?: string;
  companyName?: string;
  companyDomain?: string;
  contactName?: string;
  contactTitle?: string;
  segment?: string;
  category?: string;
  leadScore?: number;
  companyIndustry?: string;
  companyHeadcount?: string;
  companyCity?: string;
  tags?: string[];
  status?: string;
  dateUpdated?: string;
}): ClickUpTask {
  return makeClickUpTask({
    id: opts.id ?? "task_lead_001",
    name: `${opts.companyName ?? "ABC Plumbing Ltd."} — ${opts.contactName ?? "Mike Thompson"}`,
    status: { status: opts.status ?? "Enriched" },
    date_updated: opts.dateUpdated ?? String(Date.now()),
    tags: (opts.tags ?? []).map((name) => ({ name })),
    custom_fields: [
      { id: "f-company-name", name: "Company Name", value: opts.companyName ?? "ABC Plumbing Ltd.", type: "text" },
      { id: "f-company-domain", name: "Company Domain", value: opts.companyDomain ?? "https://abcplumbing.ca", type: "url" },
      { id: "f-contact-name", name: "Contact Name", value: opts.contactName ?? "Mike Thompson", type: "text" },
      { id: "f-contact-title", name: "Contact Title", value: opts.contactTitle ?? "Owner", type: "text" },
      {
        id: "f-segment",
        name: "Segment",
        value: { Business: 0, School: 1, Team: 2 }[opts.segment ?? "Business"] ?? 0,
        type: "drop_down",
        type_config: {
          options: [
            { id: "s0", name: "Business", orderindex: 0 },
            { id: "s1", name: "School", orderindex: 1 },
            { id: "s2", name: "Team", orderindex: 2 },
          ],
        },
      },
      {
        id: "f-category",
        name: "Category",
        value: 0,
        type: "drop_down",
        type_config: {
          options: [{ id: "c0", name: opts.category ?? "Trades & Contractors", orderindex: 0 }],
        },
      },
      { id: "f-lead-score", name: "Lead Score", value: opts.leadScore ?? 4, type: "number" },
      { id: "f-company-industry", name: "Company Industry", value: opts.companyIndustry ?? "Construction", type: "text" },
      { id: "f-company-headcount", name: "Company Headcount", value: opts.companyHeadcount ?? "11-50", type: "text" },
      {
        id: "f-company-city",
        name: "Company City",
        value: 0,
        type: "drop_down",
        type_config: {
          options: [{ id: "city0", name: opts.companyCity ?? "Surrey", orderindex: 0 }],
        },
      },
    ],
  });
}

export function makeMockDraftOutput(
  overrides: Partial<GeminiDraftOutput> = {}
): GeminiDraftOutput {
  return {
    website_scrape_summary:
      "ABC Plumbing is a family-owned plumbing company serving Surrey and the Fraser Valley since 2005. They specialize in residential and commercial plumbing with 24/7 emergency service.",
    community_signals:
      "Sponsors Surrey Minor Hockey Association. Participated in Habitat for Humanity builds in 2025.",
    personalization_hooks:
      "Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward, trades segment seasonal ramp in spring.",
    email_touch_1_subject: "Quick question about your crew's gear",
    email_touch_1_body:
      "Hi Mike,\n\nI came across ABC Plumbing Ltd. while looking into trades companies in Surrey and really liked what I saw — 20 years of serving the Fraser Valley is no small thing.\n\nI'm Ellie from ShopJaydees. We help trades businesses like yours with branded work wear — everything from crew uniforms to safety vests with your logo. One thing that makes us a bit different is our Wear It Forward program, where a portion of every order goes back to community initiatives.\n\nWould it be worth a quick conversation about getting your team set up?\n\nEllie",
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
    ...overrides,
  };
}

export function makePersonalizationConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    firecrawlApiKey: "fc_test",
    geminiApiKey: "gemini_test",
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
    personalizationBatchSize: 15,
    dryRun: false,
    alertEmail: "cody@sixohquad.com",
    alertWebhookUrl: "",
    fields: {
      companyName: "f-company-name",
      companyDomain: "f-company-domain",
      companyIndustry: "f-company-industry",
      companyHeadcount: "f-company-headcount",
      companyCity: "f-company-city",
      contactName: "f-contact-name",
      contactTitle: "f-contact-title",
      contactEmail: "f-contact-email",
      emailConfidence: "f-email-confidence",
      contactLinkedin: "f-contact-linkedin",
      contactPhone: "f-contact-phone",
      segment: "f-segment",
      category: "f-category",
      leadScore: "f-lead-score",
      scoreRationale: "f-score-rationale",
      geographicPhase: "f-geo-phase",
      caslSourceUrl: "f-casl-source",
      importBatch: "f-import-batch",
    },
    prospectingFields: {
      resultsFound: "f-pr-results",
      leadsCreated: "f-pr-created",
      leadsParked: "f-pr-parked",
      duplicatesSkipped: "f-pr-dupes",
    },
    personalizationFields: {
      websiteScrapeSummary: "f-scrape-summary",
      communitySignals: "f-community-signals",
      personalizationHooks: "f-personalization-hooks",
      emailTouch1: "f-email-touch-1",
      emailTouch1Subject: "f-email-touch-1-subject",
      emailTouch2: "f-email-touch-2",
      emailTouch2Subject: "f-email-touch-2-subject",
      emailTouch3: "f-email-touch-3",
      emailTouch3Subject: "f-email-touch-3-subject",
      linkedinMessage: "f-linkedin-message",
      caslOptOutCheck: "f-casl-opt-out",
      caslRelevanceRationale: "f-casl-relevance",
      caslConsentBasis: "f-casl-consent",
      caslDateVerified: "f-casl-date",
      reviewDecision: "f-review-decision",
    },
  };
}
