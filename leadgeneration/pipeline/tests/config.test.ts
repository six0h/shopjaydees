import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, type Config } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setRequiredEnv() {
    process.env.CLICKUP_API_TOKEN = "pk_test_token";
    process.env.HUNTER_API_KEY = "hunter_test_key";
    process.env.FIRECRAWL_API_KEY = "fc_test_key";
    process.env.GEMINI_API_KEY = "gemini_test_key";
    process.env.CLICKUP_LIST_ID = "111";
    process.env.CLICKUP_PROSPECTING_LIST_ID = "222";
    process.env.CLICKUP_FIELD_COMPANY_NAME = "field-company-name";
    process.env.CLICKUP_FIELD_COMPANY_DOMAIN = "field-company-domain";
    process.env.CLICKUP_FIELD_COMPANY_INDUSTRY = "field-company-industry";
    process.env.CLICKUP_FIELD_COMPANY_HEADCOUNT = "field-company-headcount";
    process.env.CLICKUP_FIELD_COMPANY_CITY = "field-company-city";
    process.env.CLICKUP_FIELD_CONTACT_NAME = "field-contact-name";
    process.env.CLICKUP_FIELD_CONTACT_TITLE = "field-contact-title";
    process.env.CLICKUP_FIELD_CONTACT_EMAIL = "field-contact-email";
    process.env.CLICKUP_FIELD_EMAIL_CONFIDENCE = "field-email-confidence";
    process.env.CLICKUP_FIELD_CONTACT_LINKEDIN = "field-contact-linkedin";
    process.env.CLICKUP_FIELD_CONTACT_PHONE = "field-contact-phone";
    process.env.CLICKUP_FIELD_SEGMENT = "field-segment";
    process.env.CLICKUP_FIELD_CATEGORY = "field-category";
    process.env.CLICKUP_FIELD_LEAD_SCORE = "field-lead-score";
    process.env.CLICKUP_FIELD_SCORE_RATIONALE = "field-score-rationale";
    process.env.CLICKUP_FIELD_GEOGRAPHIC_PHASE = "field-geo-phase";
    process.env.CLICKUP_FIELD_CASL_SOURCE_URL = "field-casl-source";
    process.env.CLICKUP_FIELD_IMPORT_BATCH = "field-import-batch";
    process.env.CLICKUP_FIELD_PR_RESULTS_FOUND = "field-pr-results";
    process.env.CLICKUP_FIELD_PR_LEADS_CREATED = "field-pr-created";
    process.env.CLICKUP_FIELD_PR_LEADS_PARKED = "field-pr-parked";
    process.env.CLICKUP_FIELD_PR_DUPLICATES_SKIPPED = "field-pr-dupes";
    process.env.ALERT_EMAIL = "cody@sixohquad.com";
    // Personalization fields
    process.env.CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY = "field-scrape-summary";
    process.env.CLICKUP_FIELD_COMMUNITY_SIGNALS = "field-community-signals";
    process.env.CLICKUP_FIELD_PERSONALIZATION_HOOKS = "field-personalization-hooks";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_1 = "field-email-touch-1";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT = "field-email-touch-1-subject";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_2 = "field-email-touch-2";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT = "field-email-touch-2-subject";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_3 = "field-email-touch-3";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT = "field-email-touch-3-subject";
    process.env.CLICKUP_FIELD_LINKEDIN_MESSAGE = "field-linkedin-message";
    process.env.CLICKUP_FIELD_CASL_OPT_OUT_CHECK = "field-casl-opt-out";
    process.env.CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE = "field-casl-relevance";
    process.env.CLICKUP_FIELD_CASL_CONSENT_BASIS = "field-casl-consent";
    process.env.CLICKUP_FIELD_CASL_DATE_VERIFIED = "field-casl-date";
    process.env.CLICKUP_FIELD_REVIEW_DECISION = "field-review-decision";
    // Instantly API
    process.env.INSTANTLY_API_KEY = "instantly_test_key";
    process.env.INSTANTLY_SENDING_DOMAINS = "shopjaydees.ca,shopjaydees.net";
    // Outreach Tracking Fields
    process.env.CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID = "field-campaign-id";
    process.env.CLICKUP_FIELD_INSTANTLY_LEAD_ID = "field-lead-id";
    process.env.CLICKUP_FIELD_SENDING_DOMAIN = "field-sending-domain";
    process.env.CLICKUP_FIELD_SEQUENCE_STATUS = "field-seq-status";
    process.env.CLICKUP_FIELD_DORMANT_DATE = "field-dormant-date";
    process.env.CLICKUP_FIELD_DORMANT_REACTIVATION_DATE = "field-dormant-react-date";
  }

  it("loads all required environment variables", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.clickupApiToken).toBe("pk_test_token");
    expect(config.hunterApiKey).toBe("hunter_test_key");
    expect(config.clickupListId).toBe("111");
    expect(config.clickupProspectingListId).toBe("222");
    expect(config.fields.companyName).toBe("field-company-name");
  });

  it("throws if a required env var is missing", () => {
    setRequiredEnv();
    delete process.env.CLICKUP_API_TOKEN;
    expect(() => loadConfig()).toThrow("CLICKUP_API_TOKEN");
  });

  it("defaults DRY_RUN to false", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.dryRun).toBe(false);
  });

  it("reads DRY_RUN=true", () => {
    setRequiredEnv();
    process.env.DRY_RUN = "true";
    const config = loadConfig();
    expect(config.dryRun).toBe(true);
  });

  it("defaults clickupRateLimit to 90", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.clickupRateLimit).toBe(90);
  });

  it("reads custom CLICKUP_RATE_LIMIT", () => {
    setRequiredEnv();
    process.env.CLICKUP_RATE_LIMIT = "50";
    const config = loadConfig();
    expect(config.clickupRateLimit).toBe(50);
  });

  it("loads Firecrawl and Gemini API keys", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.firecrawlApiKey).toBe("fc_test_key");
    expect(config.geminiApiKey).toBe("gemini_test_key");
  });

  it("throws if FIRECRAWL_API_KEY is missing", () => {
    setRequiredEnv();
    delete process.env.FIRECRAWL_API_KEY;
    expect(() => loadConfig()).toThrow("FIRECRAWL_API_KEY");
  });

  it("throws if GEMINI_API_KEY is missing", () => {
    setRequiredEnv();
    delete process.env.GEMINI_API_KEY;
    expect(() => loadConfig()).toThrow("GEMINI_API_KEY");
  });

  it("defaults personalizationBatchSize to 15", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.personalizationBatchSize).toBe(15);
  });

  it("reads custom PERSONALIZATION_BATCH_SIZE", () => {
    setRequiredEnv();
    process.env.PERSONALIZATION_BATCH_SIZE = "10";
    const config = loadConfig();
    expect(config.personalizationBatchSize).toBe(10);
  });

  it("loads all personalization ClickUp field IDs", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.personalizationFields.websiteScrapeSummary).toBe("field-scrape-summary");
    expect(config.personalizationFields.communitySignals).toBe("field-community-signals");
    expect(config.personalizationFields.personalizationHooks).toBe("field-personalization-hooks");
    expect(config.personalizationFields.emailTouch1).toBe("field-email-touch-1");
    expect(config.personalizationFields.emailTouch1Subject).toBe("field-email-touch-1-subject");
    expect(config.personalizationFields.emailTouch2).toBe("field-email-touch-2");
    expect(config.personalizationFields.emailTouch2Subject).toBe("field-email-touch-2-subject");
    expect(config.personalizationFields.emailTouch3).toBe("field-email-touch-3");
    expect(config.personalizationFields.emailTouch3Subject).toBe("field-email-touch-3-subject");
    expect(config.personalizationFields.linkedinMessage).toBe("field-linkedin-message");
    expect(config.personalizationFields.caslOptOutCheck).toBe("field-casl-opt-out");
    expect(config.personalizationFields.caslRelevanceRationale).toBe("field-casl-relevance");
    expect(config.personalizationFields.caslConsentBasis).toBe("field-casl-consent");
    expect(config.personalizationFields.caslDateVerified).toBe("field-casl-date");
    expect(config.personalizationFields.reviewDecision).toBe("field-review-decision");
  });

  it("loads Instantly API key", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.instantlyApiKey).toBe("instantly_test_key");
  });

  it("throws if INSTANTLY_API_KEY is missing", () => {
    setRequiredEnv();
    delete process.env.INSTANTLY_API_KEY;
    expect(() => loadConfig()).toThrow("INSTANTLY_API_KEY");
  });

  it("parses sending domains from comma-separated string", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.instantlySendingDomains).toEqual(["shopjaydees.ca", "shopjaydees.net"]);
  });

  it("loads Hunter ICP defaults from env", () => {
    setRequiredEnv();
    process.env.HUNTER_DEFAULT_HEADCOUNT = "1-10,11-50,51-200";
    process.env.HUNTER_DEFAULT_SENIORITY = "executive,senior";
    const config = loadConfig();
    expect(config.hunterDefaultHeadcount).toEqual(["1-10", "11-50", "51-200"]);
    expect(config.hunterDefaultSeniority).toEqual(["executive", "senior"]);
  });

  it("uses sensible ICP defaults when env vars are absent", () => {
    setRequiredEnv();
    delete process.env.HUNTER_DEFAULT_HEADCOUNT;
    delete process.env.HUNTER_DEFAULT_SENIORITY;
    const config = loadConfig();
    expect(config.hunterDefaultHeadcount).toEqual(["1-10", "11-50", "51-200"]);
    expect(config.hunterDefaultSeniority).toEqual(["executive", "senior"]);
  });

  it("loads outreach tracking field IDs", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.outreachFields.instantlyCampaignId).toBe("field-campaign-id");
    expect(config.outreachFields.instantlyLeadId).toBe("field-lead-id");
    expect(config.outreachFields.sendingDomain).toBe("field-sending-domain");
    expect(config.outreachFields.sequenceStatus).toBe("field-seq-status");
    expect(config.outreachFields.dormantDate).toBe("field-dormant-date");
    expect(config.outreachFields.dormantReactivationDate).toBe("field-dormant-react-date");
  });
});
