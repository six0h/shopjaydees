export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  firecrawlApiKey: string;
  geminiApiKey: string;
  instantlyApiKey: string;
  instantlySendingDomains: string[];
  /** Active sending mailboxes assigned to the campaign; Instantly rotates sends across them. Narrow via config (e.g. drop .ca if its health drops). */
  instantlySendingAccounts: string[];
  /** Optional cap on approved leads sent per run (start-small batching). Unset = all approved. */
  sendBatchSize?: number;
  /** Client business name, prefixed to Instantly campaign names for human troubleshooting. */
  businessName: string;
  /**
   * Prior business-name prefixes still present on live Instantly campaigns. The
   * monthly report matches campaigns named with `businessName` OR any of these, so
   * a mid-stream rename (e.g. ShopJaydees -> Jaydees Apparel) does not orphan the
   * campaigns created under the old prefix during the transition month.
   */
  legacyBusinessNames?: string[];
  clickupListId: string;
  clickupProspectingListId: string;
  clickupRateLimit: number;
  personalizationBatchSize: number;
  /**
   * Wall-clock budget (ms) for the personalization drain loop: keep processing
   * batches until the eligible pool empties or this budget is hit. Kept below the
   * function timeout so a run exits cleanly instead of being killed mid-lead.
   */
  personalizationDrainBudgetMs: number;
  dryRun: boolean;
  alertEmail: string;
  alertWebhookUrl: string;
  hunterDefaultHeadcount: string[];
  hunterDefaultSeniority: string[];
  ownerUserId: number;
  replyPollLookbackMinutes: number;
  sequenceCompleteAfterDays: number;
  fields: ClickUpFieldIds;
  prospectingFields: ProspectingRequestFieldIds;
  personalizationFields: PersonalizationFieldIds;
  outreachFields: OutreachTrackingFieldIds;
  reportFields: {
    crmLeadsListId: string;
    leadSource: string;
    estOrderValue: string;
  };
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
  lastReplyDate: string;
  outreachStartedDate: string;
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
    instantlySendingAccounts: required("INSTANTLY_SENDING_ACCOUNTS")
      .split(",")
      .map((a) => a.trim()),
    sendBatchSize: process.env.SEND_BATCH_SIZE
      ? parseInt(process.env.SEND_BATCH_SIZE, 10)
      : undefined,
    businessName: process.env.CAMPAIGN_BUSINESS_NAME?.trim() || "ShopJaydees",
    legacyBusinessNames: (process.env.CAMPAIGN_LEGACY_BUSINESS_NAMES ?? "ShopJaydees")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
    clickupListId: required("CLICKUP_LIST_ID"),
    clickupProspectingListId: required("CLICKUP_PROSPECTING_LIST_ID"),
    clickupRateLimit: parseInt(process.env.CLICKUP_RATE_LIMIT ?? "90", 10),
    personalizationBatchSize: parseInt(process.env.PERSONALIZATION_BATCH_SIZE ?? "15", 10),
    personalizationDrainBudgetMs: parseInt(
      process.env.PERSONALIZATION_DRAIN_BUDGET_MS ?? "1500000",
      10
    ),
    dryRun: process.env.DRY_RUN === "true",
    alertEmail: required("ALERT_EMAIL"),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
    hunterDefaultHeadcount: (process.env.HUNTER_DEFAULT_HEADCOUNT ?? "1-10,11-50,51-200")
      .split(",")
      .map((s) => s.trim()),
    hunterDefaultSeniority: (process.env.HUNTER_DEFAULT_SENIORITY ?? "executive,senior")
      .split(",")
      .map((s) => s.trim()),
    ownerUserId: parseInt(required("CLICKUP_OWNER_USER_ID"), 10),
    replyPollLookbackMinutes: parseInt(process.env.REPLY_POLL_LOOKBACK_MINUTES ?? "90", 10),
    sequenceCompleteAfterDays: parseInt(process.env.SEQUENCE_COMPLETE_AFTER_DAYS ?? "14", 10),
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
      lastReplyDate: required("CLICKUP_FIELD_LAST_REPLY_DATE"),
      outreachStartedDate: required("CLICKUP_FIELD_OUTREACH_STARTED_DATE"),
    },
    reportFields: {
      crmLeadsListId: required("CLICKUP_CRM_LEADS_LIST_ID"),
      leadSource: required("CLICKUP_FIELD_CRM_LEAD_SOURCE"),
      estOrderValue: required("CLICKUP_FIELD_CRM_EST_ORDER_VALUE"),
    },
  };
}
