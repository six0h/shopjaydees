import type { ClickUpTask, HunterContact, LeadData, GeminiDraftOutput, DiscoverCompany } from "../src/types.js";
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

export function makeDiscoverCompany(overrides: Partial<DiscoverCompany> = {}): DiscoverCompany {
  return {
    domain: "abcplumbing.ca",
    organization: "ABC Plumbing",
    emails_count: { personal: 5, generic: 2, total: 7 },
    ...overrides,
  };
}

export function makeDiscoverResponse(companies: DiscoverCompany[]) {
  return {
    data: companies,
    meta: { results: companies.length, limit: 100, offset: 0, filters: {} },
  };
}

const COMPANY_SIZE_OPTIONS = [
  { id: "cs0", name: "Micro (1-10)", orderindex: 0 },
  { id: "cs1", name: "Small (11-50)", orderindex: 1 },
  { id: "cs2", name: "1-50 (small+micro)", orderindex: 2 },
];

export function makeProspectingRequestTask(opts: {
  id?: string;
  segment?: string;
  category?: string;
  city?: string;
  targetVolume?: number;
  status?: string;
  dateUpdated?: string;
  companySize?: string;
}): ClickUpTask {
  const segmentIndex = { Business: 0, School: 1, Team: 2 }[opts.segment ?? "Business"] ?? 0;
  const companySizeField =
    opts.companySize !== undefined
      ? [
          {
            id: "field-company-size",
            name: "Company Size",
            value:
              COMPANY_SIZE_OPTIONS.find((o) => o.name === opts.companySize)?.orderindex ?? 0,
            type: "drop_down",
            type_config: { options: COMPANY_SIZE_OPTIONS },
          },
        ]
      : [];
  return makeClickUpTask({
    id: opts.id ?? "req_001",
    name: `${opts.segment ?? "Business"} — ${opts.category ?? "Trades & Contractors"} in ${opts.city ?? "Surrey"}`,
    status: { status: opts.status ?? "Requested" },
    date_updated: opts.dateUpdated ?? String(Date.now()),
    custom_fields: [
      ...companySizeField,
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
        // Mirrors the live Prospecting list: the field is named "Max Results",
        // and ClickUp returns number-field values as strings.
        id: "field-max-results",
        name: "Max Results",
        value: String(opts.targetVolume ?? 25),
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
      { id: "f-lead-score", name: "Lead Score", value: String(opts.leadScore ?? 4), type: "number" },
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
      "Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward.",
    email_touch_1_subject: "Quick question for your crew",
    email_touch_1_body:
      "Hi Mike,\n\nI came across ABC Plumbing while looking into trades companies in Surrey and really liked what I saw. Twenty years serving the Fraser Valley is no small thing.\n\nI'm Ellie with Jaydees Apparel. We help trades businesses like yours with custom apparel that puts your brand front and centre. One thing that makes us a bit different is our Wear It Forward program, where a portion of every order goes back to community initiatives.\n\nWould it be worth a quick conversation? Happy to put a no-obligation quote together if you've got something in mind.\n\nEllie",
    email_touch_2_subject: "An idea for your team",
    email_touch_2_body:
      "Hi Mike,\n\nOne thing we hear from trades companies is that a consistent branded look across the crew makes a real difference on site. Clients notice, and it builds trust.\n\nWe make it easy to set that up without minimums or inventory headaches. Happy to share some examples if that would help.\n\nEllie",
    email_touch_3_subject: "Checking in",
    email_touch_3_body:
      "Hi Mike,\n\nJust a quick follow-up in case the timing is better now. If getting your crew set up is on the radar, I'd love to help. No pressure, happy to connect whenever it makes sense.\n\nEllie",
    linkedin_message:
      "Hi Mike, came across ABC Plumbing and love that you support Surrey minor hockey. Would love to connect!",
    casl_opt_out_check: true,
    casl_relevance_rationale:
      "As Owner of a 20-person plumbing company, Mike likely oversees purchasing of custom branded apparel for the crew.",
    ...overrides,
  };
}

export function makePersonalizationConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    firecrawlApiKey: "fc_test",
    geminiApiKey: "gemini_test",
    instantlyApiKey: "instantly_test",
    instantlySendingDomains: ["shopjaydees.ca", "shopjaydees.net"],
    instantlySendingAccounts: ["ellie@shopjaydees.ca", "ellie@shopjaydees.net"],
    businessName: "ShopJaydees",
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
    personalizationBatchSize: 15,
    personalizationDrainBudgetMs: 1_500_000,
    dryRun: false,
    alertEmail: "cody@sixohquad.com",
    alertWebhookUrl: "",
    hunterDefaultHeadcount: ["1-10", "11-50", "51-200"],
    hunterDefaultSeniority: ["executive", "senior"],
    ownerUserId: 42,
    replyPollLookbackMinutes: 90,
    sequenceCompleteAfterDays: 14,
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
    outreachFields: {
      instantlyCampaignId: "f-campaign-id",
      instantlyLeadId: "f-lead-id",
      sendingDomain: "f-sending-domain",
      sequenceStatus: "f-seq-status",
      dormantDate: "f-dormant-date",
      dormantReactivationDate: "f-dormant-react-date",
      lastReplyDate: "field-last-reply-date",
      outreachStartedDate: "field-outreach-started-date",
    },
    reportFields: {
      crmLeadsListId: "crm-leads-list",
      leadSource: "field-lead-source",
      estOrderValue: "field-est-order-value",
    },
  };
}

export function makeApprovedLeadTask(opts: {
  id?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  segment?: string;
  leadScore?: number;
  touch1Body?: string;
  touch1Subject?: string;
  touch2Body?: string;
  touch2Subject?: string;
  touch3Body?: string;
  touch3Subject?: string;
} = {}): ClickUpTask {
  const segmentIndex = { Business: 0, School: 1, Team: 2 }[opts.segment ?? "Business"] ?? 0;
  return makeClickUpTask({
    id: opts.id ?? "task_approved_001",
    name: `${opts.companyName ?? "ABC Plumbing Ltd."} — ${opts.contactName ?? "Mike Thompson"}`,
    status: { status: "Approved" },
    custom_fields: [
      { id: "field-contact-email", name: "Contact Email", value: opts.contactEmail ?? "mike@abcplumbing.ca", type: "email" },
      { id: "field-contact-name", name: "Contact Name", value: opts.contactName ?? "Mike Thompson", type: "text" },
      { id: "field-company-name", name: "Company Name", value: opts.companyName ?? "ABC Plumbing Ltd.", type: "text" },
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
      { id: "field-lead-score", name: "Lead Score", value: String(opts.leadScore ?? 4), type: "number" },
      { id: "field-touch-1", name: "Email Touch 1", value: opts.touch1Body ?? "Hi Mike,\n\nI came across ABC Plumbing and loved your community work...", type: "text" },
      { id: "field-touch-1-subj", name: "Email Touch 1 Subject", value: opts.touch1Subject ?? "Quick question about your crew's gear", type: "text" },
      { id: "field-touch-2", name: "Email Touch 2", value: opts.touch2Body ?? "Hi Mike,\n\nOne thing we hear from trades companies...", type: "text" },
      { id: "field-touch-2-subj", name: "Email Touch 2 Subject", value: opts.touch2Subject ?? "An idea for your team", type: "text" },
      { id: "field-touch-3", name: "Email Touch 3", value: opts.touch3Body ?? "Hi Mike,\n\nJust a quick follow-up...", type: "text" },
      { id: "field-touch-3-subj", name: "Email Touch 3 Subject", value: opts.touch3Subject ?? "Checking in", type: "text" },
    ],
  });
}

export function makeDormantLeadTask(opts: {
  id?: string;
  companyName?: string;
  leadScore?: number;
  dormantDate?: string;
  reactivationDate?: string;
  tags?: string[];
} = {}): ClickUpTask {
  const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
  const yesterday = Date.now() - 1 * 24 * 60 * 60 * 1000;

  return makeClickUpTask({
    id: opts.id ?? "task_dormant_001",
    name: `${opts.companyName ?? "Old Lead Corp"} — Jane Doe`,
    status: { status: "Dormant" },
    tags: (opts.tags ?? []).map((t) => ({ name: t })),
    custom_fields: [
      { id: "field-lead-score", name: "Lead Score", value: String(opts.leadScore ?? 4), type: "number" },
      { id: "field-dormant-date", name: "Dormant Date", value: opts.dormantDate ?? String(ninetyOneDaysAgo), type: "date" },
      { id: "field-dormant-react-date", name: "Dormant Reactivation Date", value: opts.reactivationDate ?? String(yesterday), type: "date" },
      { id: "field-company-name", name: "Company Name", value: opts.companyName ?? "Old Lead Corp", type: "text" },
      { id: "field-touch-1", name: "Email Touch 1", value: "Old draft touch 1...", type: "text" },
      { id: "field-touch-1-subj", name: "Email Touch 1 Subject", value: "Old subject 1", type: "text" },
      { id: "field-touch-2", name: "Email Touch 2", value: "Old draft touch 2...", type: "text" },
      { id: "field-touch-2-subj", name: "Email Touch 2 Subject", value: "Old subject 2", type: "text" },
      { id: "field-touch-3", name: "Email Touch 3", value: "Old draft touch 3...", type: "text" },
      { id: "field-touch-3-subj", name: "Email Touch 3 Subject", value: "Old subject 3", type: "text" },
      { id: "field-linkedin-message", name: "LinkedIn Message", value: "Old LinkedIn msg", type: "text" },
      { id: "field-scrape-summary", name: "Website Scrape Summary", value: "Old summary", type: "text" },
      { id: "field-community-signals", name: "Community Signals", value: "Old signals", type: "text" },
      { id: "field-personalization-hooks", name: "Personalization Hooks", value: "Old hooks", type: "text" },
      { id: "field-campaign-id", name: "Instantly Campaign ID", value: "old_campaign_123", type: "text" },
      { id: "field-lead-id", name: "Instantly Lead ID", value: "old_lead_456", type: "text" },
      { id: "field-seq-status", name: "Sequence Status", value: 4, type: "drop_down", type_config: { options: [
        { id: "ss0", name: "Not Started", orderindex: 0 },
        { id: "ss1", name: "Touch 1 Sent", orderindex: 1 },
        { id: "ss2", name: "Touch 2 Sent", orderindex: 2 },
        { id: "ss3", name: "Touch 3 Sent", orderindex: 3 },
        { id: "ss4", name: "Sequence Complete", orderindex: 4 },
        { id: "ss5", name: "Paused", orderindex: 5 },
        { id: "ss6", name: "Cancelled", orderindex: 6 },
      ] } },
      { id: "field-review-decision", name: "Review Decision", value: 1, type: "drop_down", type_config: { options: [
        { id: "rd0", name: "Pending Review", orderindex: 0 },
        { id: "rd1", name: "Approved", orderindex: 1 },
        { id: "rd2", name: "Approved with Edits", orderindex: 2 },
        { id: "rd3", name: "Rejected", orderindex: 3 },
        { id: "rd4", name: "I Know This Person", orderindex: 4 },
      ] } },
    ],
  });
}

export function makeOutreachActiveLeadTask(opts: {
  id?: string;
  email?: string;
  status?: string;
  startedDaysAgo?: number;
  contactEmailFieldId?: string;
  outreachStartedFieldId?: string;
}): ClickUpTask {
  const started = Date.now() - (opts.startedDaysAgo ?? 0) * 24 * 60 * 60 * 1000;
  return makeClickUpTask({
    id: opts.id ?? "lead_1",
    status: { status: opts.status ?? "Outreach Active" } as ClickUpTask["status"],
    custom_fields: [
      { id: opts.contactEmailFieldId ?? "field-contact-email", name: "Contact Email", value: opts.email ?? "mike@acme.ca", type: "email" },
      { id: opts.outreachStartedFieldId ?? "field-outreach-started-date", name: "Outreach Started Date", value: started, type: "date" },
    ] as ClickUpTask["custom_fields"],
  });
}

export function makeSendConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    firecrawlApiKey: "fc_test",
    geminiApiKey: "gemini_test",
    instantlyApiKey: "instantly_test",
    instantlySendingDomains: ["shopjaydees.ca", "shopjaydees.net"],
    instantlySendingAccounts: ["ellie@shopjaydees.ca", "ellie@shopjaydees.net"],
    businessName: "ShopJaydees",
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
    personalizationBatchSize: 15,
    personalizationDrainBudgetMs: 1_500_000,
    dryRun: false,
    alertEmail: "cody@sixohquad.com",
    alertWebhookUrl: "",
    hunterDefaultHeadcount: ["1-10", "11-50", "51-200"],
    hunterDefaultSeniority: ["executive", "senior"],
    ownerUserId: 42,
    replyPollLookbackMinutes: 90,
    sequenceCompleteAfterDays: 14,
    fields: {
      companyName: "field-company-name",
      companyDomain: "field-company-domain",
      companyIndustry: "field-company-industry",
      companyHeadcount: "field-company-headcount",
      companyCity: "field-company-city",
      contactName: "field-contact-name",
      contactTitle: "field-contact-title",
      contactEmail: "field-contact-email",
      emailConfidence: "field-email-confidence",
      contactLinkedin: "field-contact-linkedin",
      contactPhone: "field-contact-phone",
      segment: "field-segment",
      category: "field-category",
      leadScore: "field-lead-score",
      scoreRationale: "field-score-rationale",
      geographicPhase: "field-geo-phase",
      caslSourceUrl: "field-casl-source",
      importBatch: "field-import-batch",
    },
    prospectingFields: {
      resultsFound: "field-pr-results",
      leadsCreated: "field-pr-created",
      leadsParked: "field-pr-parked",
      duplicatesSkipped: "field-pr-dupes",
    },
    personalizationFields: {
      websiteScrapeSummary: "field-scrape-summary",
      communitySignals: "field-community-signals",
      personalizationHooks: "field-personalization-hooks",
      emailTouch1: "field-touch-1",
      emailTouch1Subject: "field-touch-1-subj",
      emailTouch2: "field-touch-2",
      emailTouch2Subject: "field-touch-2-subj",
      emailTouch3: "field-touch-3",
      emailTouch3Subject: "field-touch-3-subj",
      linkedinMessage: "field-linkedin-message",
      caslOptOutCheck: "field-casl-opt-out",
      caslRelevanceRationale: "field-casl-relevance",
      caslConsentBasis: "field-casl-consent",
      caslDateVerified: "field-casl-date",
      reviewDecision: "field-review-decision",
    },
    outreachFields: {
      instantlyCampaignId: "field-campaign-id",
      instantlyLeadId: "field-lead-id",
      sendingDomain: "field-sending-domain",
      sequenceStatus: "field-seq-status",
      dormantDate: "field-dormant-date",
      dormantReactivationDate: "field-dormant-react-date",
      lastReplyDate: "field-last-reply-date",
      outreachStartedDate: "field-outreach-started-date",
    },
    reportFields: {
      crmLeadsListId: "crm-leads-list",
      leadSource: "field-lead-source",
      estOrderValue: "field-est-order-value",
    },
  };
}
