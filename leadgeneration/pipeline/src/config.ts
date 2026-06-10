export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  firecrawlApiKey: string;
  geminiApiKey: string;
  instantlyApiKey: string;
  instantlySendingDomains: string[];
  clickupListId: string;
  clickupProspectingListId: string;
  clickupRateLimit: number;
  personalizationBatchSize: number;
  dryRun: boolean;
  alertEmail: string;
  alertWebhookUrl: string;
  fields: ClickUpFieldIds;
  prospectingFields: ProspectingRequestFieldIds;
  personalizationFields: PersonalizationFieldIds;
  outreachFields: OutreachTrackingFieldIds;
}

export interface ClickUpFieldIds {
  companyName: string;
  companyDomain: string;
  companyIndustry: string;
  companyHeadcount: string;
  companyCity: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  emailConfidence: string;
  contactLinkedin: string;
  contactPhone: string;
  segment: string;
  category: string;
  leadScore: string;
  scoreRationale: string;
  geographicPhase: string;
  caslSourceUrl: string;
  importBatch: string;
}

export interface ProspectingRequestFieldIds {
  resultsFound: string;
  leadsCreated: string;
  leadsParked: string;
  duplicatesSkipped: string;
}

export interface OutreachTrackingFieldIds {
  instantlyCampaignId: string;
  instantlyLeadId: string;
  sendingDomain: string;
  sequenceStatus: string;
  dormantDate: string;
  dormantReactivationDate: string;
}

export interface PersonalizationFieldIds {
  websiteScrapeSummary: string;
  communitySignals: string;
  personalizationHooks: string;
  emailTouch1: string;
  emailTouch1Subject: string;
  emailTouch2: string;
  emailTouch2Subject: string;
  emailTouch3: string;
  emailTouch3Subject: string;
  linkedinMessage: string;
  caslOptOutCheck: string;
  caslRelevanceRationale: string;
  caslConsentBasis: string;
  caslDateVerified: string;
  reviewDecision: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    clickupApiToken: required("CLICKUP_API_TOKEN"),
    hunterApiKey: required("HUNTER_API_KEY"),
    firecrawlApiKey: required("FIRECRAWL_API_KEY"),
    geminiApiKey: required("GEMINI_API_KEY"),
    instantlyApiKey: required("INSTANTLY_API_KEY"),
    instantlySendingDomains: required("INSTANTLY_SENDING_DOMAINS")
      .split(",")
      .map((d) => d.trim()),
    clickupListId: required("CLICKUP_LIST_ID"),
    clickupProspectingListId: required("CLICKUP_PROSPECTING_LIST_ID"),
    clickupRateLimit: parseInt(process.env.CLICKUP_RATE_LIMIT ?? "90", 10),
    personalizationBatchSize: parseInt(process.env.PERSONALIZATION_BATCH_SIZE ?? "15", 10),
    dryRun: process.env.DRY_RUN === "true",
    alertEmail: required("ALERT_EMAIL"),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
    fields: {
      companyName: required("CLICKUP_FIELD_COMPANY_NAME"),
      companyDomain: required("CLICKUP_FIELD_COMPANY_DOMAIN"),
      companyIndustry: required("CLICKUP_FIELD_COMPANY_INDUSTRY"),
      companyHeadcount: required("CLICKUP_FIELD_COMPANY_HEADCOUNT"),
      companyCity: required("CLICKUP_FIELD_COMPANY_CITY"),
      contactName: required("CLICKUP_FIELD_CONTACT_NAME"),
      contactTitle: required("CLICKUP_FIELD_CONTACT_TITLE"),
      contactEmail: required("CLICKUP_FIELD_CONTACT_EMAIL"),
      emailConfidence: required("CLICKUP_FIELD_EMAIL_CONFIDENCE"),
      contactLinkedin: required("CLICKUP_FIELD_CONTACT_LINKEDIN"),
      contactPhone: required("CLICKUP_FIELD_CONTACT_PHONE"),
      segment: required("CLICKUP_FIELD_SEGMENT"),
      category: required("CLICKUP_FIELD_CATEGORY"),
      leadScore: required("CLICKUP_FIELD_LEAD_SCORE"),
      scoreRationale: required("CLICKUP_FIELD_SCORE_RATIONALE"),
      geographicPhase: required("CLICKUP_FIELD_GEOGRAPHIC_PHASE"),
      caslSourceUrl: required("CLICKUP_FIELD_CASL_SOURCE_URL"),
      importBatch: required("CLICKUP_FIELD_IMPORT_BATCH"),
    },
    prospectingFields: {
      resultsFound: required("CLICKUP_FIELD_PR_RESULTS_FOUND"),
      leadsCreated: required("CLICKUP_FIELD_PR_LEADS_CREATED"),
      leadsParked: required("CLICKUP_FIELD_PR_LEADS_PARKED"),
      duplicatesSkipped: required("CLICKUP_FIELD_PR_DUPLICATES_SKIPPED"),
    },
    personalizationFields: {
      websiteScrapeSummary: required("CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY"),
      communitySignals: required("CLICKUP_FIELD_COMMUNITY_SIGNALS"),
      personalizationHooks: required("CLICKUP_FIELD_PERSONALIZATION_HOOKS"),
      emailTouch1: required("CLICKUP_FIELD_EMAIL_TOUCH_1"),
      emailTouch1Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT"),
      emailTouch2: required("CLICKUP_FIELD_EMAIL_TOUCH_2"),
      emailTouch2Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT"),
      emailTouch3: required("CLICKUP_FIELD_EMAIL_TOUCH_3"),
      emailTouch3Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT"),
      linkedinMessage: required("CLICKUP_FIELD_LINKEDIN_MESSAGE"),
      caslOptOutCheck: required("CLICKUP_FIELD_CASL_OPT_OUT_CHECK"),
      caslRelevanceRationale: required("CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE"),
      caslConsentBasis: required("CLICKUP_FIELD_CASL_CONSENT_BASIS"),
      caslDateVerified: required("CLICKUP_FIELD_CASL_DATE_VERIFIED"),
      reviewDecision: required("CLICKUP_FIELD_REVIEW_DECISION"),
    },
    outreachFields: {
      instantlyCampaignId: required("CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID"),
      instantlyLeadId: required("CLICKUP_FIELD_INSTANTLY_LEAD_ID"),
      sendingDomain: required("CLICKUP_FIELD_SENDING_DOMAIN"),
      sequenceStatus: required("CLICKUP_FIELD_SEQUENCE_STATUS"),
      dormantDate: required("CLICKUP_FIELD_DORMANT_DATE"),
      dormantReactivationDate: required("CLICKUP_FIELD_DORMANT_REACTIVATION_DATE"),
    },
  };
}
