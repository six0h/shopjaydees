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
});
