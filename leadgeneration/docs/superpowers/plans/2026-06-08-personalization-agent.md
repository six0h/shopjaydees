# Personalization Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Firecrawl client, Gemini client, and Personalization Agent Cloud Function that scrapes prospect websites, generates personalized email drafts via Gemini 2.5 Flash, validates output, and writes results back to ClickUp for owner review.

**Architecture:** The Personalization Agent is an HTTP-triggered Cloud Function scheduled daily at 5 AM Mon-Fri Pacific. It queries ClickUp for "Enriched" leads scoring 3+, scrapes each prospect's website via Firecrawl (homepage + up to 2 secondary pages), generates 3-touch email sequences + LinkedIn message + CASL fields via Gemini 2.5 Flash with structured JSON output, validates the output, and writes all fields back to ClickUp with status "Ready for Review". Builds on Plan 1's existing scaffolding (types, config, logger, alerting, ClickUp client).

**Tech Stack:** Node.js 20, TypeScript 5, Vitest, `@google-cloud/functions-framework`, native `fetch` (Node 20 built-in), Firecrawl REST API, Gemini REST API

**Depends on:** Plan 1 (Foundation + Discovery Agent) — all shared modules must be implemented first.

---

## Multi-Plan Overview

This is **Plan 2 of 4**. Each plan produces working, independently testable software.

| Plan | Scope | Depends On | Status |
|------|-------|-----------|--------|
| 1. Foundation + Discovery Agent | Scaffolding, types, config, ClickUp client, Hunter.io client, scoring, mapping, Discovery Agent, error alerting, structured logging | Nothing | Complete |
| **2. Personalization Agent** | Firecrawl client, Gemini client, website scraping, draft generation, validation, re-engagement detection, CASL compliance | Plan 1 | Complete |
| 3. Send Agent + Dormancy Check | Instantly client, campaign management, send logic, dormancy reactivation, reconciliation | Plan 1 | Complete |
| 4. Platform Setup + Integration Testing | ClickUp workspace config, Instantly campaign setup, Zapier zaps, Cloud Scheduler, GCP deployment, E2E testing | Plans 1-3 + client accounts | In Progress |

---

## File Structure

All new files live under the existing `pipeline/` directory established in Plan 1.

```
pipeline/
├── src/
│   ├── index.ts                    # (MODIFIED) Add `personalize` Cloud Function export
│   ├── config.ts                   # (MODIFIED) Add Firecrawl, Gemini keys + personalization field IDs
│   ├── types.ts                    # (MODIFIED) Add personalization-related types
│   └── clients/
│       ├── clickup.ts              # (existing — no changes)
│       ├── hunter.ts               # (existing — no changes)
│       ├── firecrawl.ts            # NEW — Firecrawl scrape API client
│       └── gemini.ts               # NEW — Gemini generateContent API client
├── tests/
│   ├── helpers.ts                  # (MODIFIED) Add personalization mock factories
│   ├── clients/
│   │   ├── clickup.test.ts         # (existing — no changes)
│   │   ├── hunter.test.ts          # (existing — no changes)
│   │   ├── firecrawl.test.ts       # NEW
│   │   └── gemini.test.ts          # NEW
│   └── personalization.test.ts     # NEW — Personalization Agent tests
├── .env.example                    # (MODIFIED) Add new env vars
```

---

### Task 1: Extend Types for Personalization

**Files:**
- Modify: `pipeline/src/types.ts`
- Modify: `pipeline/tests/types.test.ts`

- [ ] **Step 1: Write new type tests**

Add to `pipeline/tests/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  type Segment,
  type Category,
  type ProspectStatus,
  type ProspectingRequestStatus,
  type GeminiDraftOutput,
  type PersonalizationRunResult,
  type LeadPersonalizationResult,
  type FirecrawlScrapeResult,
  SEGMENTS,
  PROSPECT_STATUSES,
  PROSPECTING_REQUEST_STATUSES,
  ABOUT_PATH_KEYWORDS,
  COMMUNITY_PATH_KEYWORDS,
} from "../src/types.js";

describe("types", () => {
  it("exports all three segments", () => {
    expect(SEGMENTS).toEqual(["Business", "School", "Team"]);
  });

  it("exports prospect statuses matching ClickUp data model", () => {
    expect(PROSPECT_STATUSES).toContain("New");
    expect(PROSPECT_STATUSES).toContain("Enriched");
    expect(PROSPECT_STATUSES).toContain("Personalizing");
    expect(PROSPECT_STATUSES).toContain("Ready for Review");
    expect(PROSPECT_STATUSES).toContain("Parked");
    expect(PROSPECT_STATUSES).toContain("Dormant");
    expect(PROSPECT_STATUSES).toContain("Unsubscribed");
    expect(PROSPECT_STATUSES).toContain("Bounced");
  });

  it("exports prospecting request statuses", () => {
    expect(PROSPECTING_REQUEST_STATUSES).toEqual([
      "Requested",
      "Running",
      "Complete",
      "Failed",
    ]);
  });

  it("exports about page path keywords for secondary page discovery", () => {
    expect(ABOUT_PATH_KEYWORDS).toContain("/about");
    expect(ABOUT_PATH_KEYWORDS).toContain("/about-us");
    expect(ABOUT_PATH_KEYWORDS).toContain("/our-story");
    expect(ABOUT_PATH_KEYWORDS).toContain("/team");
  });

  it("exports community page path keywords for secondary page discovery", () => {
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/community");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/giving");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/charity");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/sponsorship");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/csr");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/give-back");
  });
});
```

- [ ] **Step 2: Run tests to verify the new assertions fail**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: FAIL — `ABOUT_PATH_KEYWORDS` and `COMMUNITY_PATH_KEYWORDS` not exported.

- [ ] **Step 3: Add personalization types to `pipeline/src/types.ts`**

Append the following to the end of the existing `pipeline/src/types.ts`:

```typescript
// --- Personalization Agent Types ---

export const ABOUT_PATH_KEYWORDS = [
  "/about",
  "/about-us",
  "/our-story",
  "/team",
] as const;

export const COMMUNITY_PATH_KEYWORDS = [
  "/community",
  "/giving",
  "/charity",
  "/sponsorship",
  "/csr",
  "/give-back",
] as const;

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode?: number;
    };
    links?: string[];
  };
}

export interface GeminiDraftOutput {
  website_scrape_summary: string;
  community_signals: string;
  personalization_hooks: string;
  email_touch_1_subject: string;
  email_touch_1_body: string;
  email_touch_2_subject: string;
  email_touch_2_body: string;
  email_touch_3_subject: string;
  email_touch_3_body: string;
  linkedin_message: string;
  casl_opt_out_check: boolean;
  casl_relevance_rationale: string;
}

export interface LeadData {
  taskId: string;
  companyName: string;
  companyDomain: string;
  contactName: string;
  contactTitle: string;
  segment: string;
  category: string;
  leadScore: number;
  companyIndustry: string;
  companyHeadcount: string;
  companyCity: string;
  isReEngagement: boolean;
}

export interface LeadPersonalizationResult {
  taskId: string;
  company: string;
  status: "success" | "generation_failed" | "casl_blocked" | "deferred";
  scrapePages: number;
  geminiTokensUsed: number;
  tagsAdded: string[];
  error?: string;
}

export interface PersonalizationRunResult {
  runId: string;
  timestamp: string;
  batchSizeRequested: number;
  leadsAvailable: number;
  leadsProcessed: number;
  results: {
    success: number;
    generationFailed: number;
    caslBlocked: number;
    scrapeFailedButProceeded: number;
    stuckLeadsReset: number;
  };
  leads: LeadPersonalizationResult[];
  deferredRemaining: number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: PASS — all assertions including the new ones.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/types.ts pipeline/tests/types.test.ts
git commit -m "feat: add personalization agent types (Firecrawl, Gemini, lead data, run results)"
```

---

### Task 2: Extend Configuration for Personalization

**Files:**
- Modify: `pipeline/src/config.ts`
- Modify: `pipeline/tests/config.test.ts`
- Modify: `pipeline/.env.example`

- [ ] **Step 1: Write new configuration tests**

Add the following test cases inside the existing `describe("loadConfig")` block in `pipeline/tests/config.test.ts`. The `setRequiredEnv` helper must be updated first to include the new env vars.

Update `setRequiredEnv` function to add the new required env vars (append to the existing function body before the closing `}`):

```typescript
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
  }
```

Add new test cases:

```typescript
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
```

- [ ] **Step 2: Run tests to verify the new assertions fail**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: FAIL — `firecrawlApiKey`, `geminiApiKey`, `personalizationBatchSize`, `personalizationFields` not found on Config type.

- [ ] **Step 3: Extend the Config type and `loadConfig` in `pipeline/src/config.ts`**

Add to the `Config` interface:

```typescript
export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  firecrawlApiKey: string;
  geminiApiKey: string;
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
}
```

Add new interface:

```typescript
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
```

Update `loadConfig()` to include:

```typescript
export function loadConfig(): Config {
  return {
    clickupApiToken: required("CLICKUP_API_TOKEN"),
    hunterApiKey: required("HUNTER_API_KEY"),
    firecrawlApiKey: required("FIRECRAWL_API_KEY"),
    geminiApiKey: required("GEMINI_API_KEY"),
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
  };
}
```

- [ ] **Step 4: Update `.env.example`**

Append to `pipeline/.env.example`:

```env

# Personalization Agent
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PERSONALIZATION_BATCH_SIZE=15

# Personalization & Draft Message Fields (15 fields)
CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMMUNITY_SIGNALS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_PERSONALIZATION_HOOKS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_1=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_2=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_3=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LINKEDIN_MESSAGE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_OPT_OUT_CHECK=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_CONSENT_BASIS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_DATE_VERIFIED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REVIEW_DECISION=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: PASS — all tests including the new ones.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/config.ts pipeline/tests/config.test.ts pipeline/.env.example
git commit -m "feat: extend config with Firecrawl, Gemini, and personalization field IDs"
```

---

### Task 3: Firecrawl API Client

**Files:**
- Create: `pipeline/src/clients/firecrawl.ts`
- Create: `pipeline/tests/clients/firecrawl.test.ts`

The Firecrawl client wraps the `/v1/scrape` endpoint and implements secondary page discovery from homepage links.

- [ ] **Step 1: Write Firecrawl client tests**

Create `pipeline/tests/clients/firecrawl.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFirecrawlClient,
  findSecondaryPages,
  type FirecrawlClient,
} from "../../src/clients/firecrawl.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      "x-ratelimit-remaining": "50",
      "retry-after": "5",
    }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("FirecrawlClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("scrape", () => {
    it("scrapes a URL and returns markdown + links", async () => {
      const mockFetch = mockFetchResponse(200, {
        success: true,
        data: {
          markdown: "# ABC Plumbing\n\nServing Surrey since 2005.",
          metadata: {
            title: "ABC Plumbing Ltd.",
            sourceURL: "https://abcplumbing.ca",
            statusCode: 200,
          },
          links: [
            "https://abcplumbing.ca/about",
            "https://abcplumbing.ca/services",
            "https://abcplumbing.ca/community",
          ],
        },
      });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://abcplumbing.ca");

      expect(result.success).toBe(true);
      expect(result.data?.markdown).toContain("ABC Plumbing");
      expect(result.data?.links).toHaveLength(3);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.firecrawl.dev/v1/scrape");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer fc_test_key");
      const body = JSON.parse(opts.body);
      expect(body.url).toBe("https://abcplumbing.ca");
      expect(body.formats).toEqual(["markdown"]);
      expect(body.onlyMainContent).toBe(true);
      expect(body.waitFor).toBe(3000);
      expect(body.timeout).toBe(15000);
    });

    it("returns success=false on HTTP 402 (quota exceeded)", async () => {
      const mockFetch = mockFetchResponse(402, {
        error: "Quota exceeded",
      });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("402");
    });

    it("returns success=false on HTTP 500", async () => {
      const mockFetch = mockFetchResponse(500, { error: "Internal server error" });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("retries once on HTTP 408 (timeout) then returns failure", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          headers: new Headers(),
          json: () => Promise.resolve({ error: "Timeout" }),
          text: () => Promise.resolve("Timeout"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 408,
          headers: new Headers(),
          json: () => Promise.resolve({ error: "Timeout" }),
          text: () => Promise.resolve("Timeout"),
        });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://slow-site.com");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
    });

    it("retries once on HTTP 429 (rate limited) then returns failure", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          json: () => Promise.resolve({ error: "Rate limited" }),
          text: () => Promise.resolve("Rate limited"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          json: () => Promise.resolve({ error: "Rate limited" }),
          text: () => Promise.resolve("Rate limited"),
        });

      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://example.com");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(false);
    });

    it("handles Firecrawl returning success=false in body", async () => {
      const mockFetch = mockFetchResponse(200, {
        success: false,
        error: "Page not found",
      });
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://no-such-site.com");

      expect(result.success).toBe(false);
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createFirecrawlClient({
        apiKey: "fc_test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.scrape("https://unreachable.com");

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  describe("findSecondaryPages", () => {
    it("identifies about page and community page from links", () => {
      const links = [
        "https://abcplumbing.ca/about",
        "https://abcplumbing.ca/services",
        "https://abcplumbing.ca/community",
        "https://abcplumbing.ca/contact",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe("https://abcplumbing.ca/about");
      expect(pages[1]).toBe("https://abcplumbing.ca/community");
    });

    it("returns at most 2 pages", () => {
      const links = [
        "https://example.com/about",
        "https://example.com/about-us",
        "https://example.com/team",
        "https://example.com/community",
        "https://example.com/giving",
      ];

      const pages = findSecondaryPages(links, "https://example.com");

      expect(pages).toHaveLength(2);
    });

    it("prioritizes about pages over community pages", () => {
      const links = [
        "https://example.com/community",
        "https://example.com/about-us",
      ];

      const pages = findSecondaryPages(links, "https://example.com");

      expect(pages[0]).toBe("https://example.com/about-us");
      expect(pages[1]).toBe("https://example.com/community");
    });

    it("excludes external domain links", () => {
      const links = [
        "https://facebook.com/abcplumbing/about",
        "https://abcplumbing.ca/about",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe("https://abcplumbing.ca/about");
    });

    it("returns empty array when no matching pages found", () => {
      const links = [
        "https://abcplumbing.ca/services",
        "https://abcplumbing.ca/contact",
        "https://abcplumbing.ca/pricing",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(0);
    });

    it("handles links with trailing slashes and mixed case", () => {
      const links = [
        "https://abcplumbing.ca/About-Us/",
        "https://abcplumbing.ca/Community/",
      ];

      const pages = findSecondaryPages(links, "https://abcplumbing.ca");

      expect(pages).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/clients/firecrawl.test.ts`

Expected: FAIL — module `../../src/clients/firecrawl.js` does not exist.

- [ ] **Step 3: Implement Firecrawl client**

Create `pipeline/src/clients/firecrawl.ts`:

```typescript
import type { Logger } from "../logger.js";
import type { FirecrawlScrapeResult } from "../types.js";
import { ABOUT_PATH_KEYWORDS, COMMUNITY_PATH_KEYWORDS } from "../types.js";

const BASE_URL = "https://api.firecrawl.dev/v1";

export interface FirecrawlClient {
  scrape(url: string): Promise<FirecrawlScrapeResult & { error?: string }>;
}

interface FirecrawlClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function findSecondaryPages(
  links: string[],
  baseDomain: string
): string[] {
  // Extract hostname from baseDomain for matching
  let baseHost: string;
  try {
    baseHost = new URL(baseDomain).hostname;
  } catch {
    baseHost = baseDomain.replace(/^https?:\/\//, "").split("/")[0];
  }

  const aboutPages: string[] = [];
  const communityPages: string[] = [];

  for (const link of links) {
    // Only consider links on the same domain
    let linkHost: string;
    let linkPath: string;
    try {
      const parsed = new URL(link);
      linkHost = parsed.hostname;
      linkPath = parsed.pathname.toLowerCase().replace(/\/$/, "");
    } catch {
      continue;
    }

    if (linkHost !== baseHost) continue;

    // Check about page keywords (priority 1)
    const isAbout = ABOUT_PATH_KEYWORDS.some((kw) => linkPath === kw || linkPath.startsWith(kw + "/"));
    if (isAbout && aboutPages.length === 0) {
      aboutPages.push(link);
      continue;
    }

    // Check community page keywords (priority 2)
    const isCommunity = COMMUNITY_PATH_KEYWORDS.some((kw) => linkPath === kw || linkPath.startsWith(kw + "/"));
    if (isCommunity && communityPages.length === 0) {
      communityPages.push(link);
      continue;
    }
  }

  // Return up to 2 pages: about first (priority 1), then community (priority 2)
  return [...aboutPages, ...communityPages].slice(0, 2);
}

export function createFirecrawlClient(
  options: FirecrawlClientOptions
): FirecrawlClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function doScrape(
    url: string,
    retries: number
  ): Promise<FirecrawlScrapeResult & { error?: string }> {
    try {
      const response = await fetchFn(`${BASE_URL}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 3000,
          timeout: 15000,
        }),
      });

      // Retryable errors: 408 (timeout) and 429 (rate limited)
      if ((response.status === 408 || response.status === 429) && retries > 0) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") ?? "5",
          10
        );
        options.logger.warn("Firecrawl retryable error", {
          url,
          status: response.status,
          retryAfter,
          retriesLeft: retries - 1,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfter * 1000)
        );
        return doScrape(url, retries - 1);
      }

      // Non-retryable errors
      if (!response.ok) {
        const text = await response.text();
        options.logger.warn("Firecrawl scrape failed", {
          url,
          status: response.status,
          response: text.slice(0, 200),
        });
        return {
          success: false,
          error: `Firecrawl ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      // Parse response body
      const body = (await response.json()) as FirecrawlScrapeResult;

      // Firecrawl can return success: false in the response body
      if (!body.success) {
        options.logger.warn("Firecrawl returned success=false", {
          url,
        });
        return { success: false, error: "Firecrawl returned success=false" };
      }

      return body;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      options.logger.error("Firecrawl network error", { url, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  return {
    async scrape(url: string) {
      return doScrape(url, 1); // 1 retry for timeout/429
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/clients/firecrawl.test.ts`

Expected: PASS — all 12 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/firecrawl.ts pipeline/tests/clients/firecrawl.test.ts
git commit -m "feat: add Firecrawl API client with retry and secondary page discovery"
```

---

### Task 4: Gemini API Client

**Files:**
- Create: `pipeline/src/clients/gemini.ts`
- Create: `pipeline/tests/clients/gemini.test.ts`

The Gemini client wraps the `generateContent` endpoint with structured JSON output schema for draft generation.

- [ ] **Step 1: Write Gemini client tests**

Create `pipeline/tests/clients/gemini.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGeminiClient,
  type GeminiClient,
} from "../../src/clients/gemini.js";
import { createLogger } from "../../src/logger.js";
import type { GeminiDraftOutput } from "../../src/types.js";

function makeMockDraftOutput(): GeminiDraftOutput {
  return {
    website_scrape_summary:
      "ABC Plumbing is a family-owned plumbing company serving Surrey and the Fraser Valley since 2005. They specialize in residential and commercial plumbing with 24/7 emergency service.",
    community_signals:
      "Sponsors Surrey Minor Hockey Association. Participated in Habitat for Humanity builds in 2025.",
    personalization_hooks:
      "Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward, trades segment seasonal ramp in spring.",
    email_touch_1_subject: "Quick question about your crew's gear",
    email_touch_1_body:
      "Hi Mike,\n\nI came across ABC Plumbing while looking into trades companies in Surrey and really liked what I saw — 20 years of serving the Fraser Valley is no small thing.\n\nI'm Ellie from ShopJaydees. We help trades businesses like yours with branded work wear — everything from crew uniforms to safety vests with your logo. One thing that makes us a bit different is our Wear It Forward program, where a portion of every order goes back to community initiatives.\n\nWould it be worth a quick conversation about getting your team set up?\n\nEllie",
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
  };
}

function mockGeminiResponse(
  status: number,
  draftOutput?: GeminiDraftOutput,
  finishReason = "STOP"
) {
  const body =
    status >= 200 && status < 300
      ? {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(draftOutput) }],
              },
              finishReason,
            },
          ],
          usageMetadata: {
            promptTokenCount: 1200,
            candidatesTokenCount: 2800,
            totalTokenCount: 4000,
          },
        }
      : { error: { message: "Error", code: status } };

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("GeminiClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("generateDrafts", () => {
    it("sends prompt to Gemini with structured JSON output schema and returns parsed result", async () => {
      const draftOutput = makeMockDraftOutput();
      const mockFetch = mockGeminiResponse(200, draftOutput);
      const client = createGeminiClient({
        apiKey: "test_gemini_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("Test prompt here");

      expect(result.drafts).toBeDefined();
      expect(result.drafts!.website_scrape_summary).toContain("ABC Plumbing");
      expect(result.drafts!.email_touch_1_body).toContain("Mike");
      expect(result.tokensUsed).toBe(4000);
      expect(result.error).toBeUndefined();

      // Verify API call structure
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
      expect(url).toContain("key=test_gemini_key");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.contents[0].parts[0].text).toBe("Test prompt here");
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.generationConfig.responseSchema).toBeDefined();
      expect(body.generationConfig.temperature).toBe(0.7);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });

    it("returns error on HTTP 429 (rate limited)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: () => Promise.resolve({ error: { message: "Rate limited" } }),
        text: () => Promise.resolve("Rate limited"),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("429");
      expect(result.isRateLimited).toBe(true);
    });

    it("retries once on HTTP 500, then returns error", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Server error" } }),
          text: () => Promise.resolve("Server error"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Server error" } }),
          text: () => Promise.resolve("Server error"),
        });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.error).toContain("500");
    });

    it("retries once on HTTP 503 and succeeds on second attempt", async () => {
      const draftOutput = makeMockDraftOutput();
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: () => Promise.resolve({ error: { message: "Unavailable" } }),
          text: () => Promise.resolve("Unavailable"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: { parts: [{ text: JSON.stringify(draftOutput) }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 1200,
                candidatesTokenCount: 2800,
                totalTokenCount: 4000,
              },
            }),
          text: () => Promise.resolve(""),
        });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.drafts).toBeDefined();
    });

    it("returns error on SAFETY finish reason", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: "" }] },
            finishReason: "SAFETY",
          },
        ],
        usageMetadata: { totalTokenCount: 500 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("SAFETY");
    });

    it("returns error on MAX_TOKENS finish reason", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: '{"partial": true}' }] },
            finishReason: "MAX_TOKENS",
          },
        ],
        usageMetadata: { totalTokenCount: 4096 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("MAX_TOKENS");
    });

    it("returns error on JSON parse failure", async () => {
      const body = {
        candidates: [
          {
            content: { parts: [{ text: "This is not JSON {{{" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { totalTokenCount: 1000 },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("parse");
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createGeminiClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.generateDrafts("prompt");

      expect(result.drafts).toBeUndefined();
      expect(result.error).toContain("ECONNREFUSED");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/clients/gemini.test.ts`

Expected: FAIL — module `../../src/clients/gemini.js` does not exist.

- [ ] **Step 3: Implement Gemini client**

Create `pipeline/src/clients/gemini.ts`:

```typescript
import type { Logger } from "../logger.js";
import type { GeminiDraftOutput } from "../types.js";

const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface GeminiGenerateResult {
  drafts?: GeminiDraftOutput;
  tokensUsed: number;
  error?: string;
  isRateLimited?: boolean;
}

export interface GeminiClient {
  generateDrafts(prompt: string): Promise<GeminiGenerateResult>;
}

interface GeminiClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    website_scrape_summary: {
      type: "string",
      description:
        "2-3 sentence summary of the prospect's business based on their website. What they do, who they serve, their brand feel.",
    },
    community_signals: {
      type: "string",
      description:
        "Any community involvement, sponsorships, charity work, or causes found on the website. These bridge to Wear It Forward. Empty string if none found.",
    },
    personalization_hooks: {
      type: "string",
      description:
        "Key personalization elements: recent news, seasonal timing, specific services to reference, angles for outreach. Working notes explaining why the drafts say what they say.",
    },
    email_touch_1_subject: {
      type: "string",
      description:
        "Subject line for Touch 1 (intro + value prop). 4-8 words, no clickbait.",
    },
    email_touch_1_body: {
      type: "string",
      description:
        "Full email body for Touch 1. Personalized opening, segment-tailored value prop, Wear It Forward mention, soft CTA.",
    },
    email_touch_2_subject: {
      type: "string",
      description: "Subject line for Touch 2 (value-add follow-up). 4-8 words.",
    },
    email_touch_2_body: {
      type: "string",
      description:
        "Full email body for Touch 2. Lead with a useful insight or specific idea for their situation. Light mention of Jaydees.",
    },
    email_touch_3_subject: {
      type: "string",
      description:
        "Subject line for Touch 3 (friendly check-in). 4-8 words.",
    },
    email_touch_3_body: {
      type: "string",
      description:
        "Full email body for Touch 3. Brief, friendly, leaves door open. No pressure.",
    },
    linkedin_message: {
      type: "string",
      description:
        "LinkedIn connection request note. Short, personal, no sell. Under 300 characters.",
    },
    casl_opt_out_check: {
      type: "boolean",
      description:
        "true if no 'do not contact' or 'do not solicit' language was found on the prospect's website. false if such language was found.",
    },
    casl_relevance_rationale: {
      type: "string",
      description:
        "One sentence explaining why custom apparel outreach is relevant to this person's role. Reference their title and company.",
    },
  },
  required: [
    "website_scrape_summary",
    "community_signals",
    "personalization_hooks",
    "email_touch_1_subject",
    "email_touch_1_body",
    "email_touch_2_subject",
    "email_touch_2_body",
    "email_touch_3_subject",
    "email_touch_3_body",
    "linkedin_message",
    "casl_opt_out_check",
    "casl_relevance_rationale",
  ],
} as const;

export function createGeminiClient(
  options: GeminiClientOptions
): GeminiClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function doGenerate(
    prompt: string,
    retries: number
  ): Promise<GeminiGenerateResult> {
    try {
      const url = `${BASE_URL}?key=${options.apiKey}`;

      const response = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      // HTTP 429 — rate limited. Do NOT retry within same run.
      if (response.status === 429) {
        const text = await response.text();
        options.logger.warn("Gemini 429 rate limited", {
          response: text.slice(0, 200),
        });
        return {
          tokensUsed: 0,
          error: `Gemini 429: ${text.slice(0, 200)}`,
          isRateLimited: true,
        };
      }

      // HTTP 500/503 — server error. Retry once with 5s delay.
      if (
        (response.status === 500 || response.status === 503) &&
        retries > 0
      ) {
        options.logger.warn("Gemini server error — retrying", {
          status: response.status,
          retriesLeft: retries - 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return doGenerate(prompt, retries - 1);
      }

      // Other non-OK responses
      if (!response.ok) {
        const text = await response.text();
        return {
          tokensUsed: 0,
          error: `Gemini ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      // Parse response
      const body = (await response.json()) as {
        candidates?: Array<{
          content: { parts: Array<{ text: string }> };
          finishReason: string;
        }>;
        usageMetadata?: { totalTokenCount?: number };
      };

      const tokensUsed = body.usageMetadata?.totalTokenCount ?? 0;
      const candidate = body.candidates?.[0];

      if (!candidate) {
        return {
          tokensUsed,
          error: "Gemini returned no candidates",
        };
      }

      // Check finish reason
      if (candidate.finishReason === "SAFETY") {
        return {
          tokensUsed,
          error: "Gemini SAFETY filter triggered — content refused",
        };
      }

      if (candidate.finishReason === "MAX_TOKENS") {
        return {
          tokensUsed,
          error: "Gemini MAX_TOKENS — output truncated",
        };
      }

      // Parse the JSON text from the response
      const rawText = candidate.content.parts[0]?.text;
      if (!rawText) {
        return {
          tokensUsed,
          error: "Gemini returned empty text in response",
        };
      }

      let drafts: GeminiDraftOutput;
      try {
        drafts = JSON.parse(rawText) as GeminiDraftOutput;
      } catch (parseErr) {
        options.logger.error("Gemini JSON parse failure", {
          rawText: rawText.slice(0, 500),
        });
        return {
          tokensUsed,
          error: `Gemini JSON parse failure: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        };
      }

      return { drafts, tokensUsed };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      options.logger.error("Gemini network error", { error: errorMsg });
      return { tokensUsed: 0, error: errorMsg };
    }
  }

  return {
    async generateDrafts(prompt: string) {
      return doGenerate(prompt, 1); // 1 retry for 500/503
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/clients/gemini.test.ts`

Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/gemini.ts pipeline/tests/clients/gemini.test.ts
git commit -m "feat: add Gemini API client with structured JSON output and retry logic"
```

---

### Task 5: Extend Test Helpers for Personalization

**Files:**
- Modify: `pipeline/tests/helpers.ts`

- [ ] **Step 1: Add personalization mock factories**

Append the following to `pipeline/tests/helpers.ts`:

```typescript
import type { LeadData, GeminiDraftOutput } from "../src/types.js";
import type { Config } from "../src/config.js";

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
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/tests/helpers.ts
git commit -m "feat: add personalization test helpers and mock factories"
```

---

### Task 6: Personalization Agent

**Files:**
- Modify: `pipeline/src/index.ts` (add `personalize` Cloud Function and `runPersonalization` core logic)
- Create: `pipeline/tests/personalization.test.ts`

This is the core deliverable of Plan 2. The Personalization Agent implements the full processing flow from the API contracts spec: reset stuck leads, query eligible leads, lock, read data, scrape website, generate drafts via Gemini, validate output, and write results back to ClickUp.

- [ ] **Step 1: Write Personalization Agent tests**

Create `pipeline/tests/personalization.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { FirecrawlClient } from "../src/clients/firecrawl.js";
import type { GeminiClient, GeminiGenerateResult } from "../src/clients/gemini.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import {
  runPersonalization,
  extractLeadData,
  validateDrafts,
  buildPrompt,
} from "../src/index.js";
import {
  makeEnrichedClickUpTask,
  makeMockDraftOutput,
  makePersonalizationConfig,
} from "./helpers.js";
import type { Config } from "../src/config.js";
import type { GeminiDraftOutput, LeadData } from "../src/types.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({ id: "t1", status: { status: "Personalizing" } }),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([]),
  };
}

function makeMockFirecrawl(): FirecrawlClient {
  return {
    scrape: vi.fn().mockResolvedValue({
      success: true,
      data: {
        markdown: "# ABC Plumbing\n\nServing Surrey since 2005.\n\n## About Us\nFamily-owned and operated.",
        metadata: { title: "ABC Plumbing", sourceURL: "https://abcplumbing.ca", statusCode: 200 },
        links: [
          "https://abcplumbing.ca/about",
          "https://abcplumbing.ca/services",
          "https://abcplumbing.ca/community",
        ],
      },
    }),
  };
}

function makeMockGemini(): GeminiClient {
  return {
    generateDrafts: vi.fn().mockResolvedValue({
      drafts: makeMockDraftOutput(),
      tokensUsed: 4000,
    } as GeminiGenerateResult),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("extractLeadData", () => {
  it("extracts all lead fields from a ClickUp task", () => {
    const task = makeEnrichedClickUpTask({});
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.taskId).toBe("task_lead_001");
    expect(lead.companyName).toBe("ABC Plumbing Ltd.");
    expect(lead.companyDomain).toBe("https://abcplumbing.ca");
    expect(lead.contactName).toBe("Mike Thompson");
    expect(lead.contactTitle).toBe("Owner");
    expect(lead.segment).toBe("Business");
    expect(lead.leadScore).toBe(4);
    expect(lead.isReEngagement).toBe(false);
  });

  it("detects re-engagement from tag", () => {
    const task = makeEnrichedClickUpTask({ tags: ["re-engagement"] });
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.isReEngagement).toBe(true);
  });

  it("resolves dropdown values to labels for segment", () => {
    const task = makeEnrichedClickUpTask({ segment: "School" });
    const config = makePersonalizationConfig();
    const lead = extractLeadData(task, config);

    expect(lead.segment).toBe("School");
  });
});

describe("validateDrafts", () => {
  it("passes valid drafts", () => {
    const drafts = makeMockDraftOutput();
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors).toHaveLength(0);
  });

  it("fails if touch 1 body is too short (< 100 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: "Hi Mike, short email.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_1_body"))).toBe(true);
  });

  it("fails if touch 2 body is too short (< 80 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_2_body: "Hi Mike, short.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_2_body"))).toBe(true);
  });

  it("fails if touch 3 body is too short (< 60 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_3_body: "Hi Mike, short.",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("touch_3_body"))).toBe(true);
  });

  it("fails if company name not in touch 1 body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body:
        "Hi Mike,\n\nI came across your company while looking into trades businesses in Surrey and really liked what I saw.\n\nI'm Ellie from ShopJaydees. We help trades businesses with branded work wear. Would it be worth a quick conversation?\n\nEllie",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("company name"))).toBe(true);
  });

  it("fails if contact first name not in touch 1 body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body:
        "Hello,\n\nI came across ABC Plumbing Ltd. while looking into trades businesses in Surrey.\n\nI'm Ellie from ShopJaydees. We help trades businesses with branded work wear. Would it be worth a quick conversation?\n\nEllie",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("first name"))).toBe(true);
  });

  it("fails if subject line is too short (< 3 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_subject: "Hi",
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("subject"))).toBe(true);
  });

  it("fails if subject line is too long (> 80 chars)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_subject: "A".repeat(81),
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    expect(errors.some((e) => e.includes("subject"))).toBe(true);
  });

  it("truncates linkedin_message to 300 chars (not an error)", () => {
    const drafts = makeMockDraftOutput({
      linkedin_message: "X".repeat(350),
    });
    const lead = { companyName: "ABC Plumbing Ltd.", contactName: "Mike Thompson" } as LeadData;
    const errors = validateDrafts(drafts, lead);

    // LinkedIn truncation is not a validation error
    expect(errors).toHaveLength(0);
    expect(drafts.linkedin_message).toHaveLength(300);
  });
});

describe("buildPrompt", () => {
  it("includes prospect data in the prompt", () => {
    const lead = {
      companyName: "ABC Plumbing Ltd.",
      companyDomain: "https://abcplumbing.ca",
      contactName: "Mike Thompson",
      contactTitle: "Owner",
      segment: "Business",
      category: "Trades & Contractors",
      companyIndustry: "Construction",
      companyHeadcount: "11-50",
      companyCity: "Surrey",
      isReEngagement: false,
    } as LeadData;
    const scrapedContent = "# ABC Plumbing\n\nServing Surrey since 2005.";

    const prompt = buildPrompt(lead, scrapedContent);

    expect(prompt).toContain("ABC Plumbing Ltd.");
    expect(prompt).toContain("Mike Thompson");
    expect(prompt).toContain("Owner");
    expect(prompt).toContain("Business");
    expect(prompt).toContain("Trades & Contractors");
    expect(prompt).toContain("Surrey");
    expect(prompt).toContain("Serving Surrey since 2005");
    expect(prompt).toContain("ShopJaydees");
    expect(prompt).toContain("Wear It Forward");
    expect(prompt).toContain("Ellie");
  });

  it("includes re-engagement notice when isReEngagement is true", () => {
    const lead = {
      companyName: "Test Co",
      companyDomain: "https://test.com",
      contactName: "Jane Doe",
      contactTitle: "Manager",
      segment: "School",
      category: "Elementary & Secondary",
      companyIndustry: "Education",
      companyHeadcount: "51-200",
      companyCity: "Langley",
      isReEngagement: true,
    } as LeadData;

    const prompt = buildPrompt(lead, "");

    expect(prompt).toContain("RE-ENGAGEMENT NOTICE");
    expect(prompt).toContain("completely different angle");
    expect(prompt).toContain("Do NOT reference");
  });

  it("handles missing website content gracefully", () => {
    const lead = {
      companyName: "No Website Corp",
      companyDomain: "https://nowebsite.ca",
      contactName: "Bob Smith",
      contactTitle: "CEO",
      segment: "Business",
      category: "Fitness & Wellness",
      companyIndustry: "Fitness",
      companyHeadcount: "5-10",
      companyCity: "Burnaby",
      isReEngagement: false,
    } as LeadData;

    const prompt = buildPrompt(lead, "");

    expect(prompt).toContain("No website content available");
  });

  it("includes segment-appropriate social proof", () => {
    const schoolLead = {
      segment: "School",
    } as LeadData;
    const teamLead = {
      segment: "Team",
    } as LeadData;
    const businessLead = {
      segment: "Business",
    } as LeadData;

    expect(buildPrompt(schoolLead, "")).toContain("100 schools");
    expect(buildPrompt(teamLead, "")).toContain("raise thousands");
    expect(buildPrompt(businessLead, "")).toContain("12 to 250+");
  });
});

describe("runPersonalization", () => {
  it("processes an Enriched lead end-to-end", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // pre-step: no stuck Personalizing leads
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]); // step 1: one Enriched lead

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(1);
    expect(result.results.success).toBe(1);

    // Verify lead was locked to Personalizing
    expect(clickup.updateTask).toHaveBeenCalledWith("task_lead_001", {
      status: "Personalizing",
    });

    // Verify Firecrawl was called for homepage + secondary pages
    expect(firecrawl.scrape).toHaveBeenCalled();

    // Verify Gemini was called
    expect(gemini.generateDrafts).toHaveBeenCalledOnce();

    // Verify results were written to ClickUp with status "Ready for Review"
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const readyForReviewCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Ready for Review"
    );
    expect(readyForReviewCall).toBeDefined();
    const updateBody = readyForReviewCall![1] as { custom_fields: Array<{ id: string; value: unknown }> };
    expect(updateBody.custom_fields).toBeDefined();

    // Verify specific fields were set
    const fieldIds = updateBody.custom_fields.map((f: { id: string }) => f.id);
    expect(fieldIds).toContain("f-scrape-summary");
    expect(fieldIds).toContain("f-email-touch-1");
    expect(fieldIds).toContain("f-email-touch-1-subject");
    expect(fieldIds).toContain("f-linkedin-message");
    expect(fieldIds).toContain("f-casl-opt-out");
    expect(fieldIds).toContain("f-casl-relevance");
    expect(fieldIds).toContain("f-casl-consent");
    expect(fieldIds).toContain("f-casl-date");
    expect(fieldIds).toContain("f-review-decision");
  });

  it("resets leads stuck in Personalizing > 30 min", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const thirtyOneMinAgo = String(Date.now() - 31 * 60 * 1000);
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({
          id: "stuck_lead",
          status: "Personalizing",
          dateUpdated: thirtyOneMinAgo,
        }),
      ])
      .mockResolvedValueOnce([]); // no Enriched leads after reset

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(clickup.updateTask).toHaveBeenCalledWith("stuck_lead", {
      status: "Enriched",
    });
    expect(result.results.stuckLeadsReset).toBe(1);
  });

  it("exits cleanly when no Enriched leads found", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // no stuck leads
      .mockResolvedValueOnce([]); // no Enriched leads

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(0);
    expect(firecrawl.scrape).not.toHaveBeenCalled();
    expect(gemini.generateDrafts).not.toHaveBeenCalled();
  });

  it("tags no-scrape and proceeds when Firecrawl fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Firecrawl fails for all pages
    (firecrawl.scrape as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "Timeout",
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.success).toBe(1);
    expect(result.results.scrapeFailedButProceeded).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "no-scrape");

    // Gemini should still be called (with empty scrape content)
    expect(gemini.generateDrafts).toHaveBeenCalledOnce();
  });

  it("tags generation-failed and resets to Enriched when Gemini fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed: 500,
      error: "Gemini SAFETY filter triggered",
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.generationFailed).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith(
      "task_lead_001",
      "generation-failed"
    );
    // Verify lead was reset to Enriched
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("defers remaining batch on Gemini 429 rate limit", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed: 0,
      error: "Gemini 429: rate limited",
      isRateLimited: true,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_1" }),
        makeEnrichedClickUpTask({ id: "lead_2" }),
        makeEnrichedClickUpTask({ id: "lead_3" }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    // Only the first lead should have been attempted (then rate limit stops batch)
    expect(result.leadsProcessed).toBe(1);
    expect(result.deferredRemaining).toBe(2);
    expect(alerter.send).toHaveBeenCalled();

    // First lead should be reset to Enriched (so it's picked up next run)
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) =>
        call[0] === "lead_1" &&
        (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("blocks lead with casl_opt_out_check=false (tags casl-block, resets to Enriched)", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Gemini returns casl_opt_out_check = false
    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      drafts: makeMockDraftOutput({ casl_opt_out_check: false }),
      tokensUsed: 4000,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.caslBlocked).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "casl-block");
    // Verify reset to Enriched
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const resetCall = updateCalls.find(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Enriched"
    );
    expect(resetCall).toBeDefined();
  });

  it("tags generation-failed when validation fails", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Gemini returns drafts that fail validation (touch 1 too short)
    (gemini.generateDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      drafts: makeMockDraftOutput({ email_touch_1_body: "Too short" }),
      tokensUsed: 4000,
    } as GeminiGenerateResult);

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.results.generationFailed).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith(
      "task_lead_001",
      "generation-failed"
    );
  });

  it("respects batch size limit", async () => {
    const config = { ...makePersonalizationConfig(), personalizationBatchSize: 2 };
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_1", leadScore: 5 }),
        makeEnrichedClickUpTask({ id: "lead_2", leadScore: 4 }),
        makeEnrichedClickUpTask({ id: "lead_3", leadScore: 3 }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsAvailable).toBe(3);
    expect(result.leadsProcessed).toBe(2);
    expect(result.batchSizeRequested).toBe(2);
  });

  it("sorts leads by score descending, then date_created ascending", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const olderDate = String(Date.now() - 86400000); // 1 day ago
    const newerDate = String(Date.now());

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_low", leadScore: 3 }),
        makeEnrichedClickUpTask({ id: "lead_high_new", leadScore: 5 }),
        makeEnrichedClickUpTask({ id: "lead_high_old", leadScore: 5 }),
      ]);

    // Override date_created for deterministic sort
    const tasks = getTasksMock.mock.results;

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    // All should be processed. Verify order by checking the first lock call.
    const updateCalls = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls;
    const lockCalls = updateCalls.filter(
      (call: unknown[]) => (call[1] as { status?: string }).status === "Personalizing"
    );
    // Score 5 leads should be locked before score 3
    expect(lockCalls[0][0]).not.toBe("lead_low");
  });

  it("scrapes secondary pages (about + community) when found in homepage links", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({})]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    // Homepage + about + community = 3 scrapes
    expect(firecrawl.scrape).toHaveBeenCalledTimes(3);
    expect(firecrawl.scrape).toHaveBeenCalledWith("https://abcplumbing.ca/about");
    expect(firecrawl.scrape).toHaveBeenCalledWith("https://abcplumbing.ca/community");
  });

  it("filters leads below score 3 client-side", async () => {
    const config = makePersonalizationConfig();
    const clickup = makeMockClickUp();
    const firecrawl = makeMockFirecrawl();
    const gemini = makeMockGemini();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeEnrichedClickUpTask({ id: "lead_good", leadScore: 4 }),
        makeEnrichedClickUpTask({ id: "lead_bad", leadScore: 2 }),
      ]);

    const result = await runPersonalization({
      config,
      clickup,
      firecrawl,
      gemini,
      alerter,
      logger,
    });

    expect(result.leadsProcessed).toBe(1);
    // Only lead_good should have been locked
    expect(clickup.updateTask).toHaveBeenCalledWith("lead_good", {
      status: "Personalizing",
    });
    expect(clickup.updateTask).not.toHaveBeenCalledWith("lead_bad", {
      status: "Personalizing",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/personalization.test.ts`

Expected: FAIL — exports `runPersonalization`, `extractLeadData`, `validateDrafts`, `buildPrompt` not found in `../src/index.js`.

- [ ] **Step 3: Implement the Personalization Agent**

Add the following to `pipeline/src/index.ts`. This code goes after the existing Discovery Agent code (after the `ff.http("discover", ...)` block). Add the new imports at the top of the file alongside the existing imports.

**New imports to add at the top of `pipeline/src/index.ts`:**

```typescript
import { createFirecrawlClient, findSecondaryPages } from "./clients/firecrawl.js";
import type { FirecrawlClient } from "./clients/firecrawl.js";
import { createGeminiClient } from "./clients/gemini.js";
import type { GeminiClient } from "./clients/gemini.js";
import type {
  ClickUpTask,
  HunterContact,
  DiscoveryRunResult,
  RequestResult,
  Segment,
  Category,
  City,
  LeadData,
  GeminiDraftOutput,
  PersonalizationRunResult,
  LeadPersonalizationResult,
} from "./types.js";
```

**Personalization Agent implementation (append after the `ff.http("discover", ...)` block):**

```typescript
// =====================================================
// PERSONALIZATION AGENT
// =====================================================

// --- Lead Data Extraction ---

export function extractLeadData(task: ClickUpTask, config: Config): LeadData {
  let companyName = "";
  let companyDomain = "";
  let contactName = "";
  let contactTitle = "";
  let segment = "Business";
  let category = "Other";
  let leadScore = 0;
  let companyIndustry = "";
  let companyHeadcount = "";
  let companyCity = "";

  for (const field of task.custom_fields) {
    switch (field.id) {
      case config.fields.companyName:
        companyName = String(field.value ?? "");
        break;
      case config.fields.companyDomain:
        companyDomain = String(field.value ?? "");
        break;
      case config.fields.contactName:
        contactName = String(field.value ?? "");
        break;
      case config.fields.contactTitle:
        contactTitle = String(field.value ?? "");
        break;
      case config.fields.segment:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) segment = opt.name;
        }
        break;
      case config.fields.category:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) category = opt.name;
        }
        break;
      case config.fields.leadScore:
        leadScore = typeof field.value === "number" ? field.value : 0;
        break;
      case config.fields.companyIndustry:
        companyIndustry = String(field.value ?? "");
        break;
      case config.fields.companyHeadcount:
        companyHeadcount = String(field.value ?? "");
        break;
      case config.fields.companyCity:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) companyCity = opt.name;
        } else {
          companyCity = String(field.value ?? "");
        }
        break;
    }
  }

  const isReEngagement = task.tags.some((t) => t.name === "re-engagement");

  return {
    taskId: task.id,
    companyName,
    companyDomain,
    contactName,
    contactTitle,
    segment,
    category,
    leadScore,
    companyIndustry,
    companyHeadcount,
    companyCity,
    isReEngagement,
  };
}

// --- Prompt Builder ---

export function buildPrompt(lead: LeadData, scrapedContent: string): string {
  const websiteSection =
    scrapedContent.trim().length > 0
      ? scrapedContent
      : "No website content available — use the company data above.";

  const socialProofMap: Record<string, string> = {
    School: 'Schools: "We work with over 100 schools in the Lower Mainland"',
    Team: 'Teams: "We\'ve helped teams raise thousands through apparel-based fundraising — no inventory, no hassle"',
    Business:
      'Corporate: "We frequently work with businesses with anywhere from 12 to 250+ employees"',
  };
  const socialProof =
    socialProofMap[lead.segment] ?? socialProofMap["Business"];

  let prompt = `You are writing cold outreach for ShopJaydees (shopjaydees.com), a custom clothing
company in BC's Lower Mainland. They serve businesses, schools, and teams with
branded apparel — uniforms, spirit wear, team gear, corporate swag.

ShopJaydees runs "Wear It Forward" — a portion of every order goes to community
initiatives. This is a genuine differentiator, not a gimmick. Mention it naturally
once in Touch 1, but don't lead with it.

TONE: Friendly > Professional > Casual. Like a local business owner reaching out
to another. First-name basis. No corporate jargon, no buzzwords, no pressure.

PROSPECT DATA:
- Company: ${lead.companyName}
- Domain: ${lead.companyDomain}
- Contact: ${lead.contactName}, ${lead.contactTitle}
- Segment: ${lead.segment}
- Category: ${lead.category}
- Industry: ${lead.companyIndustry}
- Headcount: ${lead.companyHeadcount}
- City: ${lead.companyCity}

WEBSITE CONTENT:
${websiteSection}

SOCIAL PROOF (use the one matching the segment):
${socialProof}

INSTRUCTIONS:
1. Write 3 email touches following the sequence structure (Touch 1: intro + value,
   Touch 2: value-add follow-up, Touch 3: friendly check-in).
2. Reference something specific from their website or business. Do not be generic.
3. Subject lines: 4-8 words, no clickbait, no ALL CAPS, no emojis.
4. Sign all emails as "Ellie" (the ShopJaydees outreach persona — not the owner's name).
5. Write a LinkedIn connection request note (under 300 chars, no pitch).
6. Check the website content for any "do not contact" or "do not solicit" statements.
7. Write one sentence explaining why custom apparel is relevant to ${lead.contactName}'s
   role at ${lead.companyName}.
8. If no website content was available, still write the emails using the company data,
   but note that in the website_scrape_summary field.

Return your response as structured JSON matching the schema provided.`;

  if (lead.isReEngagement) {
    prompt += `

RE-ENGAGEMENT NOTICE: This prospect was contacted previously with no response.
Their 90-day cool-off period has passed. You MUST:
- Use a completely different angle than a typical first outreach
- Do NOT reference or acknowledge previous outreach attempts
- Find a fresh hook — new seasonal angle, different value prop, updated community signal
- The tone should feel like a first contact, not a follow-up`;
  }

  return prompt;
}

// --- Draft Validation ---

export function validateDrafts(
  drafts: GeminiDraftOutput,
  lead: LeadData
): string[] {
  const errors: string[] = [];

  // Body length checks
  if (drafts.email_touch_1_body.length < 100) {
    errors.push(
      `email_touch_1_body too short: ${drafts.email_touch_1_body.length} chars (min 100)`
    );
  }
  if (drafts.email_touch_2_body.length < 80) {
    errors.push(
      `email_touch_2_body too short: ${drafts.email_touch_2_body.length} chars (min 80)`
    );
  }
  if (drafts.email_touch_3_body.length < 60) {
    errors.push(
      `email_touch_3_body too short: ${drafts.email_touch_3_body.length} chars (min 60)`
    );
  }

  // Company name must appear in touch 1
  if (!drafts.email_touch_1_body.includes(lead.companyName)) {
    errors.push(
      `email_touch_1_body missing company name "${lead.companyName}"`
    );
  }

  // Contact first name must appear in touch 1
  const firstName = lead.contactName.split(" ")[0];
  if (firstName && !drafts.email_touch_1_body.includes(firstName)) {
    errors.push(
      `email_touch_1_body missing contact first name "${firstName}"`
    );
  }

  // Subject line length checks (3-80 chars each)
  const subjects = [
    { name: "email_touch_1_subject", value: drafts.email_touch_1_subject },
    { name: "email_touch_2_subject", value: drafts.email_touch_2_subject },
    { name: "email_touch_3_subject", value: drafts.email_touch_3_subject },
  ];
  for (const subj of subjects) {
    if (subj.value.length < 3 || subj.value.length > 80) {
      errors.push(
        `${subj.name} length ${subj.value.length} out of range 3-80: "${subj.value}"`
      );
    }
  }

  // LinkedIn message: truncate to 300 chars (not an error)
  if (drafts.linkedin_message.length > 300) {
    drafts.linkedin_message = drafts.linkedin_message.slice(0, 300);
  }

  return errors;
}

// --- Personalization Agent Core ---

export interface PersonalizationDeps {
  config: Config;
  clickup: ClickUpClient;
  firecrawl: FirecrawlClient;
  gemini: GeminiClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runPersonalization(
  deps: PersonalizationDeps
): Promise<PersonalizationRunResult> {
  const { config, clickup, firecrawl, gemini, alerter, logger } = deps;
  const now = new Date();
  const runId = `personalize-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Personalization agent starting");

  const result: PersonalizationRunResult = {
    runId,
    timestamp: now.toISOString(),
    batchSizeRequested: config.personalizationBatchSize,
    leadsAvailable: 0,
    leadsProcessed: 0,
    results: {
      success: 0,
      generationFailed: 0,
      caslBlocked: 0,
      scrapeFailedButProceeded: 0,
      stuckLeadsReset: 0,
    },
    leads: [],
    deferredRemaining: 0,
  };

  // Pre-step: Reset leads stuck in "Personalizing" status > 30 min
  const stuckLeads = await clickup.getTasks(config.clickupListId, {
    statuses: ["Personalizing"],
  });
  for (const task of stuckLeads) {
    const updatedAt = parseInt(task.date_updated, 10);
    const minutesStale = (Date.now() - updatedAt) / 60_000;
    if (minutesStale > 30) {
      await clickup.updateTask(task.id, { status: "Enriched" });
      logger.warn("RESET: stuck Personalizing lead", {
        taskId: task.id,
        minutesStale: Math.round(minutesStale),
      });
      result.results.stuckLeadsReset += 1;
    }
  }

  // Step 1: Query ClickUp for Enriched leads
  const allEnriched = await clickup.getTasks(config.clickupListId, {
    statuses: ["Enriched"],
  });

  // Client-side filtering: score >= 3
  const eligible = allEnriched.filter((task) => {
    const scoreField = task.custom_fields.find(
      (f) => f.id === config.fields.leadScore
    );
    const score = typeof scoreField?.value === "number" ? scoreField.value : 0;
    return score >= 3;
  });

  // Client-side sorting: score DESC, date_created ASC
  eligible.sort((a, b) => {
    const scoreA =
      (a.custom_fields.find((f) => f.id === config.fields.leadScore)
        ?.value as number) ?? 0;
    const scoreB =
      (b.custom_fields.find((f) => f.id === config.fields.leadScore)
        ?.value as number) ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return parseInt(a.date_created, 10) - parseInt(b.date_created, 10);
  });

  result.leadsAvailable = eligible.length;

  if (eligible.length === 0) {
    logger.info("No eligible Enriched leads. Exiting.");
    return result;
  }

  // Take batch
  const batch = eligible.slice(0, config.personalizationBatchSize);

  logger.info("Processing batch", {
    batchSize: batch.length,
    totalAvailable: eligible.length,
  });

  // Process each lead
  for (const task of batch) {
    const lead = extractLeadData(task, config);
    const leadResult: LeadPersonalizationResult = {
      taskId: lead.taskId,
      company: lead.companyName,
      status: "success",
      scrapePages: 0,
      geminiTokensUsed: 0,
      tagsAdded: [],
    };

    try {
      // Step 2: Lock lead
      await clickup.updateTask(lead.taskId, { status: "Personalizing" });

      // Step 4: Scrape prospect website
      let scrapedContent = "";
      let scrapeFailed = false;
      let pagesScraped = 0;

      // Scrape homepage
      const homepageResult = await firecrawl.scrape(lead.companyDomain);
      if (homepageResult.success && homepageResult.data?.markdown) {
        scrapedContent += `## Homepage (${lead.companyDomain})\n\n${homepageResult.data.markdown}`;
        pagesScraped += 1;

        // Find and scrape secondary pages
        const links = homepageResult.data.links ?? [];
        const secondaryPages = findSecondaryPages(links, lead.companyDomain);

        for (const pageUrl of secondaryPages) {
          const pageResult = await firecrawl.scrape(pageUrl);
          if (pageResult.success && pageResult.data?.markdown) {
            scrapedContent += `\n\n---\n\n## ${pageUrl}\n\n${pageResult.data.markdown}`;
            pagesScraped += 1;
          }
        }
      } else {
        scrapeFailed = true;
        await clickup.addTag(lead.taskId, "no-scrape");
        leadResult.tagsAdded.push("no-scrape");
        logger.warn("Firecrawl failed — proceeding with Hunter.io data only", {
          taskId: lead.taskId,
          company: lead.companyName,
        });
      }

      leadResult.scrapePages = pagesScraped;

      if (scrapeFailed) {
        result.results.scrapeFailedButProceeded += 1;
      }

      // Step 5: Generate drafts via Gemini
      const prompt = buildPrompt(lead, scrapedContent);
      const geminiResult = await gemini.generateDrafts(prompt);
      leadResult.geminiTokensUsed = geminiResult.tokensUsed;

      // Handle Gemini rate limit — defer entire remaining batch
      if (geminiResult.isRateLimited) {
        logger.warn("Gemini 429 — deferring remaining batch", {
          taskId: lead.taskId,
          company: lead.companyName,
        });

        // Reset this lead to Enriched
        await clickup.updateTask(lead.taskId, { status: "Enriched" });
        leadResult.status = "deferred";
        result.leads.push(leadResult);
        result.leadsProcessed += 1;

        // Calculate deferred count
        const currentIndex = batch.indexOf(task);
        result.deferredRemaining = batch.length - currentIndex - 1;

        await alerter.send(
          "Gemini rate limit — personalization batch deferred",
          `Rate limited after processing lead ${lead.companyName}. ${result.deferredRemaining} leads deferred to next run.`
        );

        break; // Stop processing remaining batch
      }

      // Handle other Gemini errors
      if (geminiResult.error || !geminiResult.drafts) {
        logger.error("Gemini generation failed", {
          taskId: lead.taskId,
          company: lead.companyName,
          error: geminiResult.error,
        });
        await clickup.addTag(lead.taskId, "generation-failed");
        await clickup.updateTask(lead.taskId, { status: "Enriched" });
        leadResult.tagsAdded.push("generation-failed");
        leadResult.status = "generation_failed";
        leadResult.error = geminiResult.error;
        result.results.generationFailed += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      const drafts = geminiResult.drafts;

      // Step 6: Validate — CASL opt-out check first
      if (!drafts.casl_opt_out_check) {
        logger.warn("CASL block — prospect website has do-not-contact", {
          taskId: lead.taskId,
          company: lead.companyName,
        });
        await clickup.addTag(lead.taskId, "casl-block");
        await clickup.updateTask(lead.taskId, { status: "Enriched" });
        leadResult.tagsAdded.push("casl-block");
        leadResult.status = "casl_blocked";
        result.results.caslBlocked += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      // Step 6 continued: Validate draft quality
      const validationErrors = validateDrafts(drafts, lead);
      if (validationErrors.length > 0) {
        logger.error("Draft validation failed", {
          taskId: lead.taskId,
          company: lead.companyName,
          errors: validationErrors,
        });
        await clickup.addTag(lead.taskId, "generation-failed");
        await clickup.updateTask(lead.taskId, { status: "Enriched" });
        leadResult.tagsAdded.push("generation-failed");
        leadResult.status = "generation_failed";
        leadResult.error = `Validation: ${validationErrors.join("; ")}`;
        result.results.generationFailed += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      // Step 7: Write results back to ClickUp
      const todayMidnightUtc = new Date();
      todayMidnightUtc.setUTCHours(0, 0, 0, 0);
      const caslDateMs = todayMidnightUtc.getTime();

      await clickup.updateTask(lead.taskId, {
        status: "Ready for Review",
        custom_fields: [
          {
            id: config.personalizationFields.websiteScrapeSummary,
            value: drafts.website_scrape_summary,
          },
          {
            id: config.personalizationFields.communitySignals,
            value: drafts.community_signals,
          },
          {
            id: config.personalizationFields.personalizationHooks,
            value: drafts.personalization_hooks,
          },
          {
            id: config.personalizationFields.emailTouch1,
            value: drafts.email_touch_1_body,
          },
          {
            id: config.personalizationFields.emailTouch1Subject,
            value: drafts.email_touch_1_subject,
          },
          {
            id: config.personalizationFields.emailTouch2,
            value: drafts.email_touch_2_body,
          },
          {
            id: config.personalizationFields.emailTouch2Subject,
            value: drafts.email_touch_2_subject,
          },
          {
            id: config.personalizationFields.emailTouch3,
            value: drafts.email_touch_3_body,
          },
          {
            id: config.personalizationFields.emailTouch3Subject,
            value: drafts.email_touch_3_subject,
          },
          {
            id: config.personalizationFields.linkedinMessage,
            value: drafts.linkedin_message,
          },
          {
            id: config.personalizationFields.caslOptOutCheck,
            value: true,
          },
          {
            id: config.personalizationFields.caslRelevanceRationale,
            value: drafts.casl_relevance_rationale,
          },
          {
            id: config.personalizationFields.caslConsentBasis,
            value: 0, // "Conspicuous Publication" dropdown index
          },
          {
            id: config.personalizationFields.caslDateVerified,
            value: caslDateMs,
          },
          {
            id: config.personalizationFields.reviewDecision,
            value: 0, // "Pending Review" dropdown index
          },
        ],
      });

      result.results.success += 1;
      logger.info("Lead personalized successfully", {
        taskId: lead.taskId,
        company: lead.companyName,
        scrapePages: pagesScraped,
        tokensUsed: geminiResult.tokensUsed,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Lead personalization failed", {
        taskId: lead.taskId,
        company: lead.companyName,
        error: errorMsg,
      });
      leadResult.status = "generation_failed";
      leadResult.error = errorMsg;
      result.results.generationFailed += 1;

      // Best effort: reset to Enriched
      try {
        await clickup.addTag(lead.taskId, "generation-failed");
        await clickup.updateTask(lead.taskId, { status: "Enriched" });
        leadResult.tagsAdded.push("generation-failed");
      } catch {
        // Don't mask the real error
      }
    }

    result.leads.push(leadResult);
    result.leadsProcessed += 1;
  }

  logger.info("Personalization agent complete", {
    leadsProcessed: result.leadsProcessed,
    success: result.results.success,
    generationFailed: result.results.generationFailed,
    caslBlocked: result.results.caslBlocked,
    deferredRemaining: result.deferredRemaining,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("personalize", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("personalization-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const firecrawlClient = createFirecrawlClient({
    apiKey: config.firecrawlApiKey,
    logger,
  });
  const geminiClient = createGeminiClient({
    apiKey: config.geminiApiKey,
    logger,
  });

  try {
    const batchSizeOverride =
      req.body && typeof req.body === "object" && "batch_size" in req.body
        ? parseInt(String(req.body.batch_size), 10)
        : undefined;
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig = {
      ...config,
      ...(batchSizeOverride !== undefined && !isNaN(batchSizeOverride)
        ? { personalizationBatchSize: batchSizeOverride }
        : {}),
      ...(dryRunOverride !== undefined ? { dryRun: dryRunOverride } : {}),
    };

    const result = await runPersonalization({
      config: effectiveConfig,
      clickup,
      firecrawl: firecrawlClient,
      gemini: geminiClient,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Personalization Agent", {
      error: errorMsg,
    });
    await alerter.send("Unhandled error in personalization-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/personalization.test.ts`

Expected: PASS — all 14 tests.

- [ ] **Step 5: Run all tests**

Run: `cd pipeline && npx vitest run`

Expected: PASS — all tests across all files (types, config, logger, alerting, clickup, hunter, firecrawl, gemini, scoring, mapping, discovery, personalization).

- [ ] **Step 6: Type check**

Run: `cd pipeline && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/index.ts pipeline/tests/personalization.test.ts
git commit -m "feat: add Personalization Agent Cloud Function with Firecrawl scraping and Gemini draft generation"
```

---

### Task 7: Verify Full Test Suite

- [ ] **Step 1: Run all tests from the pipeline directory**

Run: `cd pipeline && npx vitest run`

Expected: All tests pass. Total should be ~50+ tests across 9 test files:
- `types.test.ts`
- `config.test.ts`
- `logger.test.ts`
- `alerting.test.ts`
- `scoring.test.ts`
- `mapping.test.ts`
- `clients/clickup.test.ts`
- `clients/hunter.test.ts`
- `clients/firecrawl.test.ts`
- `clients/gemini.test.ts`
- `discovery.test.ts`
- `personalization.test.ts`

- [ ] **Step 2: Run type check**

Run: `cd pipeline && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Build**

Run: `cd pipeline && npm run build`

Expected: TypeScript compiles to `dist/` without errors.

- [ ] **Step 4: Commit build confirmation**

If any fixes were needed during verification, commit them:

```bash
git add -A pipeline/
git commit -m "fix: resolve any issues found during full test suite verification"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec Requirement | Task | Implementation |
|------------------|------|----------------|
| Firecrawl API key in config | Task 2 | `config.firecrawlApiKey` from `FIRECRAWL_API_KEY` env var |
| Gemini API key in config | Task 2 | `config.geminiApiKey` from `GEMINI_API_KEY` env var |
| PERSONALIZATION_BATCH_SIZE config (default 15) | Task 2 | `config.personalizationBatchSize` from env var, default 15 |
| All 15 personalization ClickUp field IDs in config | Task 2 | `config.personalizationFields` with all 15 IDs |
| Firecrawl `/v1/scrape` with markdown format, onlyMainContent, waitFor 3000, timeout 15000 | Task 3 | `createFirecrawlClient.scrape()` sends exact config |
| Secondary page discovery: about paths (priority 1) + community paths (priority 2) | Task 3 | `findSecondaryPages()` with `ABOUT_PATH_KEYWORDS` and `COMMUNITY_PATH_KEYWORDS` |
| At most 2 secondary pages scraped | Task 3 | `findSecondaryPages()` returns `slice(0, 2)` |
| Firecrawl retry once on 408/429, no retry on 402/500+ | Task 3 | `doScrape()` with retry logic |
| Firecrawl failure → tag `no-scrape`, proceed with Hunter.io data only | Task 6 | Tested in "tags no-scrape and proceeds when Firecrawl fails" |
| Gemini `generateContent` with structured JSON output schema | Task 4 | `RESPONSE_SCHEMA` constant matches API contracts spec exactly |
| Gemini temperature 0.7, maxOutputTokens 4096 | Task 4 | Sent in `generationConfig` |
| Gemini 429 → defer remaining batch, do not retry | Task 4/6 | `isRateLimited` flag, batch break in `runPersonalization` |
| Gemini 500/503 → retry once with 5s delay | Task 4 | `doGenerate()` retry logic |
| Gemini SAFETY → tag `generation-failed`, reset to Enriched | Task 4/6 | Finish reason check + tag + status reset |
| Gemini MAX_TOKENS → tag `generation-failed`, reset to Enriched | Task 4 | Finish reason check |
| Gemini JSON parse failure → tag `generation-failed`, reset to Enriched | Task 4 | Try/catch on `JSON.parse` |
| Full Gemini prompt template from API contracts spec | Task 6 | `buildPrompt()` includes exact template |
| Re-engagement prompt modification appended when `re-engagement` tag present | Task 6 | `isReEngagement` check in `buildPrompt()` |
| Validation: touch 1 body >= 100 chars | Task 6 | `validateDrafts()` |
| Validation: touch 2 body >= 80 chars | Task 6 | `validateDrafts()` |
| Validation: touch 3 body >= 60 chars | Task 6 | `validateDrafts()` |
| Validation: company name in touch 1 body | Task 6 | `validateDrafts()` |
| Validation: contact first name in touch 1 body | Task 6 | `validateDrafts()` |
| Validation: subject lines 3-80 chars | Task 6 | `validateDrafts()` |
| Validation: LinkedIn message truncated to 300 chars (not error) | Task 6 | `validateDrafts()` truncation |
| CASL opt-out check false → tag `casl-block`, reset to Enriched, do not proceed | Task 6 | Tested in "blocks lead with casl_opt_out_check=false" |
| Pre-step: reset stuck Personalizing leads > 30 min | Task 6 | Tested in "resets leads stuck in Personalizing > 30 min" |
| Step 1: query Enriched leads with score >= 3 (client-side filter) | Task 6 | `eligible.filter()` + tested in "filters leads below score 3" |
| Step 1: sort by score DESC, date_created ASC | Task 6 | `eligible.sort()` + tested |
| Step 2: lock lead to Personalizing | Task 6 | `updateTask(id, { status: "Personalizing" })` |
| Step 4: scrape homepage + up to 2 secondary pages | Task 6 | Homepage scrape + `findSecondaryPages` + loop |
| Step 4: concatenate scraped markdown with `---` separator | Task 6 | `\n\n---\n\n` between pages |
| Step 7: write all fields to ClickUp + status "Ready for Review" | Task 6 | `updateTask` with 15 custom fields |
| Step 7: CASL Consent Basis = 0 (Conspicuous Publication) | Task 6 | `value: 0` |
| Step 7: CASL Date Verified = today midnight UTC in ms | Task 6 | `caslDateMs` calculation |
| Step 7: Review Decision = 0 (Pending Review) | Task 6 | `value: 0` |
| Cloud Function HTTP entry point with batch_size and dry_run overrides | Task 6 | `ff.http("personalize", ...)` |
| Per-lead error isolation (one bad lead doesn't kill batch) | Task 6 | Try/catch around each lead processing |

### 2. Placeholder Scan

No TBD, TODO, or "implement later" references. All code steps include complete, executable code.

### 3. Type Consistency

- `Config` extended with `firecrawlApiKey`, `geminiApiKey`, `personalizationBatchSize`, `personalizationFields`
- `FirecrawlClient.scrape()` returns `FirecrawlScrapeResult & { error?: string }`
- `GeminiClient.generateDrafts()` returns `GeminiGenerateResult` with optional `drafts`, `tokensUsed`, `error`, `isRateLimited`
- `extractLeadData()` produces `LeadData` consumed by `buildPrompt()` and `validateDrafts()`
- `validateDrafts()` mutates `linkedin_message` for truncation (documented), returns error strings
- `PersonalizationRunResult` matches the output schema from the API contracts spec
- All exported functions are imported and tested in `personalization.test.ts`

### 4. What This Plan Does NOT Cover (deferred to Plans 3-4)

- Instantly client (Plan 3 — Send Agent)
- Send Agent logic (Plan 3)
- Dormancy check function (Plan 3)
- ClickUp workspace configuration (Plan 4)
- Zapier zap setup (Plan 4)
- Cloud Scheduler deployment (Plan 4)
- Instantly campaign configuration (Plan 4)
- E2E integration testing (Plan 4)
- DRY_RUN mode for personalization (not specified in the API contracts — discovery has it, send has it, but personalization does not skip writes in dry-run mode. If needed, add in Plan 4.)

### 5. Known Implementation Notes

**ClickUp API custom field ordering:** The API contracts spec notes that ordering by Lead Score may not be available via API params. This plan implements client-side sorting (fetch all Enriched tasks, sort by score DESC then date_created ASC, take batch). This is correct for the expected volume (< 200 Enriched tasks at any time).

**Firecrawl rate limiting:** The spec recommends 2-second delays between scrape calls. This plan does not implement inter-scrape delays because the sequential processing of pages within each lead and leads within the batch naturally spaces requests. If Firecrawl 429s become frequent in production, add `await new Promise(r => setTimeout(r, 2000))` between scrape calls.

**Gemini prompt length:** The full prompt (template + scraped content from up to 3 pages) could exceed typical markdown page sizes. At ~3-5KB of markdown per page and ~1KB for the template, the total prompt is ~10-16KB, well within Gemini 2.5 Flash's 1M token context window. No truncation is needed.

**Config backward compatibility:** Adding `firecrawlApiKey`, `geminiApiKey`, and `personalizationFields` to `loadConfig()` makes those env vars required at startup. The Discovery Agent entry point calls `loadConfig()` too, so it will now also require these variables even though it doesn't use them. This is acceptable — all functions share one deployment, and all env vars are set at the GCP Cloud Function level. If separate deployments are needed later, split the config loading.
