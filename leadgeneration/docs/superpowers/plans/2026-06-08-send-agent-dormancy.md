# Send Agent + Dormancy Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Instantly API client, Send Agent Cloud Function (pushes approved leads to Instantly campaigns with personalized 3-touch sequences), and the Dormancy Check Cloud Function (reactivates eligible dormant leads after their 90-day cool-off period).

**Architecture:** Node.js 20 TypeScript Cloud Functions with dependency-injected API clients. The Send Agent runs daily at 9 AM Mon-Fri, reads "Approved" leads from ClickUp, creates/finds Instantly campaigns per segment-month, adds leads with custom variables for all 3 email touches, and writes tracking data back to ClickUp. The Dormancy Check runs weekly on Sundays at 6 AM, queries "Dormant" leads whose reactivation date has passed, clears old drafts, and re-enters them into the personalization pipeline with a `re-engagement` tag.

**Tech Stack:** Node.js 20, TypeScript 5, Vitest, `@google-cloud/functions-framework`, native `fetch` (Node 20 built-in)

---

## Multi-Plan Overview

This is **Plan 3 of 4**. Each plan produces working, independently testable software.

| Plan | Scope | Depends On | Status |
|------|-------|-----------|--------|
| 1. Foundation + Discovery Agent | Scaffolding, types, config, ClickUp client, Hunter.io client, scoring, mapping, Discovery Agent, error alerting, structured logging | Nothing | Complete |
| 2. Personalization Agent | Firecrawl client, Gemini client, website scraping, draft generation, validation, re-engagement detection | Plan 1 | Complete |
| **3. Send Agent + Dormancy Check** | Instantly client, campaign management, send logic, dormancy reactivation | Plan 1 | Complete |
| 4. Platform Setup + Integration Testing | ClickUp workspace config, Instantly campaign setup, Zapier zaps, Cloud Scheduler, GCP deployment, E2E testing | Plans 1-3 + client accounts | In Progress |

## Build Now vs. Blocked

**Buildable now (no client accounts needed):**
- Instantly API client with full test coverage (mocked HTTP)
- Send Agent logic with all error handling paths
- Dormancy Check logic with reactivation counting
- Config extensions for Instantly env vars and outreach tracking field IDs
- All unit and integration tests

**Blocked on client account setup:**
- Live Instantly API calls (need client's API key)
- ClickUp custom field IDs for outreach tracking fields (need workspace setup)
- Instantly campaign sequence configuration (need Instantly account)
- End-to-end testing with live APIs

---

## File Structure

All new files live under `pipeline/` within the existing project structure.

```
pipeline/
├── src/
│   ├── index.ts                    # Extended with send + dormancyCheck Cloud Function exports
│   ├── config.ts                   # Extended with Instantly + outreach tracking config
│   ├── types.ts                    # Extended with send/dormancy result types
│   └── clients/
│       ├── clickup.ts              # Existing (no changes needed)
│       ├── hunter.ts               # Existing (no changes needed)
│       └── instantly.ts            # NEW: Instantly API v2 client
├── tests/
│   ├── helpers.ts                  # Extended with send/dormancy mock factories
│   ├── clients/
│   │   ├── clickup.test.ts         # Existing
│   │   ├── hunter.test.ts          # Existing
│   │   └── instantly.test.ts       # NEW: Instantly client tests
│   ├── send.test.ts                # NEW: Send Agent integration tests
│   └── dormancy.test.ts            # NEW: Dormancy Check integration tests
```

The Send Agent and Dormancy Check handlers are exported from `src/index.ts` as additional Cloud Function entry points alongside the existing `discover` function. This follows the established pattern — each pipeline agent is a function export, not a separate module.

---

### Task 1: Extend Types for Send Agent + Dormancy Check

**Files:**
- Modify: `pipeline/src/types.ts`
- Modify: `pipeline/tests/types.test.ts`

- [ ] **Step 1: Write type tests for new exports**

Add to `pipeline/tests/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  type Segment,
  type Category,
  type ProspectStatus,
  type ProspectingRequestStatus,
  type HunterContact,
  type HunterCompany,
  type ProspectingRequest,
  type LeadScoreResult,
  type DiscoveryRunResult,
  type RequestResult,
  type SendRunResult,
  type SendLeadResult,
  type DormancyRunResult,
  type DormancyLeadResult,
  SEGMENTS,
  PROSPECT_STATUSES,
  PROSPECTING_REQUEST_STATUSES,
  SENDING_DOMAINS,
  SEQUENCE_STATUSES,
} from "../src/types.js";

describe("types", () => {
  it("exports all three segments", () => {
    expect(SEGMENTS).toEqual(["Business", "School", "Team"]);
  });

  it("exports prospect statuses matching ClickUp data model", () => {
    expect(PROSPECT_STATUSES).toContain("New");
    expect(PROSPECT_STATUSES).toContain("Enriched");
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

  it("exports sending domains", () => {
    expect(SENDING_DOMAINS).toEqual(["shopjaydees.ca", "shopjaydees.net"]);
  });

  it("exports sequence statuses matching ClickUp data model", () => {
    expect(SEQUENCE_STATUSES).toContain("Not Started");
    expect(SEQUENCE_STATUSES).toContain("Touch 1 Sent");
    expect(SEQUENCE_STATUSES).toContain("Touch 2 Sent");
    expect(SEQUENCE_STATUSES).toContain("Touch 3 Sent");
    expect(SEQUENCE_STATUSES).toContain("Sequence Complete");
    expect(SEQUENCE_STATUSES).toContain("Paused");
    expect(SEQUENCE_STATUSES).toContain("Cancelled");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: FAIL — `SENDING_DOMAINS`, `SEQUENCE_STATUSES`, `SendRunResult`, `SendLeadResult`, `DormancyRunResult`, `DormancyLeadResult` do not exist.

- [ ] **Step 3: Add new types to types.ts**

Add the following to the end of `pipeline/src/types.ts`:

```typescript
export const SENDING_DOMAINS = ["shopjaydees.ca", "shopjaydees.net"] as const;
export type SendingDomain = (typeof SENDING_DOMAINS)[number];

export const SEQUENCE_STATUSES = [
  "Not Started",
  "Touch 1 Sent",
  "Touch 2 Sent",
  "Touch 3 Sent",
  "Sequence Complete",
  "Paused",
  "Cancelled",
] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export interface SendLeadResult {
  taskId: string;
  company: string;
  email: string;
  status: "sent" | "instantly_duplicate" | "invalid_email" | "deferred_rate_limit" | "error";
  campaignId: string | null;
  sendingDomain: string | null;
  error?: string;
}

export interface SendRunResult {
  runId: string;
  timestamp: string;
  leadsQueued: number;
  results: {
    sent: number;
    instantlyDuplicate: number;
    invalidEmail: number;
    deferredRateLimit: number;
    errors: number;
  };
  leads: SendLeadResult[];
}

export interface DormancyLeadResult {
  taskId: string;
  company: string;
  dormantSince: string;
  reactivationNumber: number;
}

export interface DormancyRunResult {
  runId: string;
  timestamp: string;
  dormantTasksChecked: number;
  results: {
    reactivated: number;
    notEligibleScoreLow: number;
    notEligibleDoNotReactivate: number;
    notEligibleMaxAttempts: number;
    notYetDue: number;
  };
  reactivatedLeads: DormancyLeadResult[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: PASS — all 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/types.ts pipeline/tests/types.test.ts
git commit -m "feat: add send agent and dormancy check types"
```

---

### Task 2: Extend Configuration for Instantly + Outreach Tracking

**Files:**
- Modify: `pipeline/src/config.ts`
- Modify: `pipeline/tests/config.test.ts`

- [ ] **Step 1: Write configuration tests for new fields**

Add new tests to `pipeline/tests/config.test.ts`:

```typescript
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
    // Existing required env vars
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

    // New required env vars for Send Agent + Dormancy
    process.env.INSTANTLY_API_KEY = "instantly_test_key";
    process.env.INSTANTLY_SENDING_DOMAINS = "shopjaydees.ca,shopjaydees.net";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_1 = "field-touch-1";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT = "field-touch-1-subj";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_2 = "field-touch-2";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT = "field-touch-2-subj";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_3 = "field-touch-3";
    process.env.CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT = "field-touch-3-subj";
    process.env.CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID = "field-campaign-id";
    process.env.CLICKUP_FIELD_INSTANTLY_LEAD_ID = "field-lead-id";
    process.env.CLICKUP_FIELD_SENDING_DOMAIN = "field-sending-domain";
    process.env.CLICKUP_FIELD_SEQUENCE_STATUS = "field-seq-status";
    process.env.CLICKUP_FIELD_REVIEW_DECISION = "field-review-decision";
    process.env.CLICKUP_FIELD_DORMANT_DATE = "field-dormant-date";
    process.env.CLICKUP_FIELD_DORMANT_REACTIVATION_DATE = "field-dormant-react-date";
    process.env.CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY = "field-scrape-summary";
    process.env.CLICKUP_FIELD_COMMUNITY_SIGNALS = "field-community-signals";
    process.env.CLICKUP_FIELD_PERSONALIZATION_HOOKS = "field-personalization-hooks";
    process.env.CLICKUP_FIELD_LINKEDIN_MESSAGE = "field-linkedin-message";
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

  it("loads draft message field IDs", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.draftFields.emailTouch1).toBe("field-touch-1");
    expect(config.draftFields.emailTouch1Subject).toBe("field-touch-1-subj");
    expect(config.draftFields.emailTouch2).toBe("field-touch-2");
    expect(config.draftFields.emailTouch2Subject).toBe("field-touch-2-subj");
    expect(config.draftFields.emailTouch3).toBe("field-touch-3");
    expect(config.draftFields.emailTouch3Subject).toBe("field-touch-3-subj");
  });

  it("loads review and personalization field IDs for dormancy reset", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.draftFields.reviewDecision).toBe("field-review-decision");
    expect(config.draftFields.websiteScrapeSummary).toBe("field-scrape-summary");
    expect(config.draftFields.communitySignals).toBe("field-community-signals");
    expect(config.draftFields.personalizationHooks).toBe("field-personalization-hooks");
    expect(config.draftFields.linkedinMessage).toBe("field-linkedin-message");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: FAIL — `instantlyApiKey`, `instantlySendingDomains`, `outreachFields`, `draftFields` do not exist on Config.

- [ ] **Step 3: Extend config.ts with new fields**

Update `pipeline/src/config.ts` to add the new interfaces and fields:

```typescript
export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  instantlyApiKey: string;
  instantlySendingDomains: string[];
  clickupListId: string;
  clickupProspectingListId: string;
  clickupRateLimit: number;
  dryRun: boolean;
  alertEmail: string;
  alertWebhookUrl: string;
  fields: ClickUpFieldIds;
  prospectingFields: ProspectingRequestFieldIds;
  outreachFields: OutreachTrackingFieldIds;
  draftFields: DraftMessageFieldIds;
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

export interface DraftMessageFieldIds {
  emailTouch1: string;
  emailTouch1Subject: string;
  emailTouch2: string;
  emailTouch2Subject: string;
  emailTouch3: string;
  emailTouch3Subject: string;
  reviewDecision: string;
  websiteScrapeSummary: string;
  communitySignals: string;
  personalizationHooks: string;
  linkedinMessage: string;
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
    instantlyApiKey: required("INSTANTLY_API_KEY"),
    instantlySendingDomains: required("INSTANTLY_SENDING_DOMAINS")
      .split(",")
      .map((d) => d.trim()),
    clickupListId: required("CLICKUP_LIST_ID"),
    clickupProspectingListId: required("CLICKUP_PROSPECTING_LIST_ID"),
    clickupRateLimit: parseInt(process.env.CLICKUP_RATE_LIMIT ?? "90", 10),
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
    outreachFields: {
      instantlyCampaignId: required("CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID"),
      instantlyLeadId: required("CLICKUP_FIELD_INSTANTLY_LEAD_ID"),
      sendingDomain: required("CLICKUP_FIELD_SENDING_DOMAIN"),
      sequenceStatus: required("CLICKUP_FIELD_SEQUENCE_STATUS"),
      dormantDate: required("CLICKUP_FIELD_DORMANT_DATE"),
      dormantReactivationDate: required("CLICKUP_FIELD_DORMANT_REACTIVATION_DATE"),
    },
    draftFields: {
      emailTouch1: required("CLICKUP_FIELD_EMAIL_TOUCH_1"),
      emailTouch1Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT"),
      emailTouch2: required("CLICKUP_FIELD_EMAIL_TOUCH_2"),
      emailTouch2Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT"),
      emailTouch3: required("CLICKUP_FIELD_EMAIL_TOUCH_3"),
      emailTouch3Subject: required("CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT"),
      reviewDecision: required("CLICKUP_FIELD_REVIEW_DECISION"),
      websiteScrapeSummary: required("CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY"),
      communitySignals: required("CLICKUP_FIELD_COMMUNITY_SIGNALS"),
      personalizationHooks: required("CLICKUP_FIELD_PERSONALIZATION_HOOKS"),
      linkedinMessage: required("CLICKUP_FIELD_LINKEDIN_MESSAGE"),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: PASS — all 13 tests.

- [ ] **Step 5: Update .env.example with new variables**

Add to `pipeline/.env.example`:

```env
# Instantly API
INSTANTLY_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INSTANTLY_SENDING_DOMAINS=shopjaydees.ca,shopjaydees.net

# ClickUp Draft Message Fields (populated by Personalization Agent, read by Send Agent)
CLICKUP_FIELD_EMAIL_TOUCH_1=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_2=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_3=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LINKEDIN_MESSAGE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMMUNITY_SIGNALS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_PERSONALIZATION_HOOKS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REVIEW_DECISION=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ClickUp Outreach Tracking Fields
CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_INSTANTLY_LEAD_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SENDING_DOMAIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SEQUENCE_STATUS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_DORMANT_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_DORMANT_REACTIVATION_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/config.ts pipeline/tests/config.test.ts pipeline/.env.example
git commit -m "feat: extend config with Instantly API and outreach tracking fields"
```

---

### Task 3: Instantly API Client

**Files:**
- Create: `pipeline/src/clients/instantly.ts`
- Create: `pipeline/tests/clients/instantly.test.ts`

This client wraps the Instantly API v2 for campaign management and lead operations. It uses Bearer token auth and returns typed responses.

- [ ] **Step 1: Write Instantly client tests**

Create `pipeline/tests/clients/instantly.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInstantlyClient,
  type InstantlyClient,
  type InstantlyCampaign,
  type InstantlyAddLeadsResponse,
} from "../../src/clients/instantly.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({}),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("InstantlyClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("listCampaigns", () => {
    it("fetches active campaigns with Bearer auth", async () => {
      const campaigns: InstantlyCampaign[] = [
        { id: "camp_001", name: "Business - 2026-06", status: "active" },
        { id: "camp_002", name: "School - 2026-06", status: "active" },
      ];
      const mockFetch = mockFetchResponse(200, campaigns);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.listCampaigns();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Business - 2026-06");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/campaigns");
      expect(url).toContain("limit=100");
      expect(url).toContain("status=active");
      expect(opts.headers["Authorization"]).toBe("Bearer test_key");
    });
  });

  describe("createCampaign", () => {
    it("creates a campaign with weekday 8-17 Pacific schedule", async () => {
      const newCampaign: InstantlyCampaign = {
        id: "camp_new",
        name: "Team - 2026-06",
        status: "active",
      };
      const mockFetch = mockFetchResponse(200, newCampaign);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.createCampaign("Team - 2026-06");

      expect(result.id).toBe("camp_new");
      expect(result.name).toBe("Team - 2026-06");
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/campaigns");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("Team - 2026-06");
      expect(body.campaign_schedule.schedules[0].timezone).toBe("America/Vancouver");
      expect(body.campaign_schedule.schedules[0].timing.from).toBe("08:00");
      expect(body.campaign_schedule.schedules[0].timing.to).toBe("17:00");
      // Weekdays only
      expect(body.campaign_schedule.schedules[0].days["1"]).toBe(true); // Monday
      expect(body.campaign_schedule.schedules[0].days["5"]).toBe(true); // Friday
      expect(body.campaign_schedule.schedules[0].days["0"]).toBe(false); // Sunday
      expect(body.campaign_schedule.schedules[0].days["6"]).toBe(false); // Saturday
    });
  });

  describe("addLeadToCampaign", () => {
    it("adds a lead with custom variables for all 3 touches", async () => {
      const response: InstantlyAddLeadsResponse = {
        upload_id: "upload_xyz",
        leads_uploaded: 1,
        leads_skipped: 0,
      };
      const mockFetch = mockFetchResponse(200, response);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.addLeadToCampaign("camp_001", {
        email: "mike@abcplumbing.ca",
        firstName: "Mike",
        lastName: "Thompson",
        companyName: "ABC Plumbing Ltd.",
        customVariables: {
          touch_1_subject: "Quick question about your crew's gear",
          touch_1_body: "Hi Mike,\n\nI came across ABC Plumbing...",
          touch_2_subject: "An idea for your team",
          touch_2_body: "Hi Mike,\n\nOne thing we hear...",
          touch_3_subject: "Checking in",
          touch_3_body: "Hi Mike,\n\nJust a quick follow-up...",
          sending_domain: "shopjaydees.ca",
        },
      });

      expect(result.leads_uploaded).toBe(1);
      expect(result.leads_skipped).toBe(0);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.instantly.ai/api/v2/leads");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.campaign_id).toBe("camp_001");
      expect(body.skip_if_in_workspace).toBe(true);
      expect(body.leads).toHaveLength(1);
      expect(body.leads[0].email).toBe("mike@abcplumbing.ca");
      expect(body.leads[0].first_name).toBe("Mike");
      expect(body.leads[0].last_name).toBe("Thompson");
      expect(body.leads[0].company_name).toBe("ABC Plumbing Ltd.");
      expect(body.leads[0].custom_variables.touch_1_subject).toBe(
        "Quick question about your crew's gear"
      );
    });

    it("returns leads_skipped: 1 when lead already in workspace", async () => {
      const response: InstantlyAddLeadsResponse = {
        upload_id: "upload_dup",
        leads_uploaded: 0,
        leads_skipped: 1,
      };
      const mockFetch = mockFetchResponse(200, response);
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.addLeadToCampaign("camp_001", {
        email: "duplicate@test.com",
        firstName: "Dup",
        lastName: "User",
        companyName: "Dup Corp",
        customVariables: {
          touch_1_subject: "s1",
          touch_1_body: "b1",
          touch_2_subject: "s2",
          touch_2_body: "b2",
          touch_3_subject: "s3",
          touch_3_body: "b3",
          sending_domain: "shopjaydees.ca",
        },
      });

      expect(result.leads_skipped).toBe(1);
      expect(result.leads_uploaded).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws on 401 (invalid API key)", async () => {
      const mockFetch = mockFetchResponse(401, { error: "Unauthorized" });
      const client = createInstantlyClient({
        apiKey: "bad_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.listCampaigns()).rejects.toThrow("401");
    });

    it("throws InstantlyRateLimitError on 429", async () => {
      const mockFetch = mockFetchResponse(429, { error: "Rate limited" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.listCampaigns()).rejects.toThrow("429");
    });

    it("throws InstantlyBadRequestError on 400 (invalid email)", async () => {
      const mockFetch = mockFetchResponse(400, { error: "Invalid email format" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(
        client.addLeadToCampaign("camp_001", {
          email: "not-an-email",
          firstName: "Bad",
          lastName: "Email",
          companyName: "Test",
          customVariables: {
            touch_1_subject: "s",
            touch_1_body: "b",
            touch_2_subject: "s",
            touch_2_body: "b",
            touch_3_subject: "s",
            touch_3_body: "b",
            sending_domain: "shopjaydees.ca",
          },
        })
      ).rejects.toThrow("400");
    });

    it("exposes error type via error.code property", async () => {
      const mockFetch = mockFetchResponse(429, { error: "Rate limited" });
      const client = createInstantlyClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      try {
        await client.listCampaigns();
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as Error & { code: number };
        expect(error.code).toBe(429);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/clients/instantly.test.ts`

Expected: FAIL — module `../../src/clients/instantly.js` does not exist.

- [ ] **Step 3: Implement Instantly client**

Create `pipeline/src/clients/instantly.ts`:

```typescript
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
                "0": false, // Sunday
                "1": true, // Monday
                "2": true, // Tuesday
                "3": true, // Wednesday
                "4": true, // Thursday
                "5": true, // Friday
                "6": false, // Saturday
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/clients/instantly.test.ts`

Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/instantly.ts pipeline/tests/clients/instantly.test.ts
git commit -m "feat: add Instantly API v2 client for campaigns and leads"
```

---

### Task 4: Extend Test Helpers for Send + Dormancy

**Files:**
- Modify: `pipeline/tests/helpers.ts`

- [ ] **Step 1: Add send/dormancy mock factories**

Add to `pipeline/tests/helpers.ts`:

```typescript
import type { ClickUpTask, HunterContact } from "../src/types.js";
import type { Config } from "../src/config.js";

// --- Existing helpers (already defined) ---

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

// --- New helpers for Send Agent + Dormancy Check ---

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
      { id: "field-lead-score", name: "Lead Score", value: opts.leadScore ?? 4, type: "number" },
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
  // Default: dormant since 91 days ago, reactivation date = yesterday
  const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
  const yesterday = Date.now() - 1 * 24 * 60 * 60 * 1000;

  return makeClickUpTask({
    id: opts.id ?? "task_dormant_001",
    name: `${opts.companyName ?? "Old Lead Corp"} — Jane Doe`,
    status: { status: "Dormant" },
    tags: (opts.tags ?? []).map((t) => ({ name: t })),
    custom_fields: [
      { id: "field-lead-score", name: "Lead Score", value: opts.leadScore ?? 4, type: "number" },
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

export function makeSendConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    instantlyApiKey: "instantly_test",
    instantlySendingDomains: ["shopjaydees.ca", "shopjaydees.net"],
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
    dryRun: false,
    alertEmail: "cody@sixohquad.com",
    alertWebhookUrl: "",
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
    outreachFields: {
      instantlyCampaignId: "field-campaign-id",
      instantlyLeadId: "field-lead-id",
      sendingDomain: "field-sending-domain",
      sequenceStatus: "field-seq-status",
      dormantDate: "field-dormant-date",
      dormantReactivationDate: "field-dormant-react-date",
    },
    draftFields: {
      emailTouch1: "field-touch-1",
      emailTouch1Subject: "field-touch-1-subj",
      emailTouch2: "field-touch-2",
      emailTouch2Subject: "field-touch-2-subj",
      emailTouch3: "field-touch-3",
      emailTouch3Subject: "field-touch-3-subj",
      reviewDecision: "field-review-decision",
      websiteScrapeSummary: "field-scrape-summary",
      communitySignals: "field-community-signals",
      personalizationHooks: "field-personalization-hooks",
      linkedinMessage: "field-linkedin-message",
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/tests/helpers.ts
git commit -m "feat: add test helpers for send agent and dormancy check"
```

---

### Task 5: Send Agent

**Files:**
- Modify: `pipeline/src/index.ts`
- Create: `pipeline/tests/send.test.ts`

This is the core Send Agent Cloud Function. It reads "Approved" leads from ClickUp, finds or creates Instantly campaigns per segment-month, adds leads with custom variables for all 3 email touches, handles errors per the spec, and writes tracking data back to ClickUp.

- [ ] **Step 1: Write Send Agent tests**

Create `pipeline/tests/send.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { InstantlyClient } from "../src/clients/instantly.js";
import { InstantlyApiError } from "../src/clients/instantly.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runSend, extractLeadData, getSegmentLabel, buildCampaignName } from "../src/index.js";
import { makeApprovedLeadTask, makeSendConfig } from "./helpers.js";
import type { Config } from "../src/config.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([
      {
        id: "field-sending-domain",
        name: "Sending Domain",
        type: "drop_down",
        type_config: {
          options: [
            { name: "shopjaydees.ca", orderindex: 0 },
            { name: "shopjaydees.net", orderindex: 1 },
          ],
        },
      },
      {
        id: "field-seq-status",
        name: "Sequence Status",
        type: "drop_down",
        type_config: {
          options: [
            { name: "Not Started", orderindex: 0 },
            { name: "Touch 1 Sent", orderindex: 1 },
          ],
        },
      },
    ]),
  };
}

function makeMockInstantly(): InstantlyClient {
  return {
    listCampaigns: vi.fn().mockResolvedValue([]),
    createCampaign: vi.fn().mockResolvedValue({
      id: "camp_new_001",
      name: "Business - 2026-06",
      status: "active",
    }),
    addLeadToCampaign: vi.fn().mockResolvedValue({
      upload_id: "upload_001",
      leads_uploaded: 1,
      leads_skipped: 0,
    }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("getSegmentLabel", () => {
  it("resolves segment dropdown index to label", () => {
    const task = makeApprovedLeadTask({ segment: "Business" });
    const label = getSegmentLabel(task, "field-segment");
    expect(label).toBe("Business");
  });

  it("defaults to Business when field not found", () => {
    const task = makeApprovedLeadTask();
    task.custom_fields = [];
    const label = getSegmentLabel(task, "field-segment");
    expect(label).toBe("Business");
  });
});

describe("buildCampaignName", () => {
  it("creates segment-month format", () => {
    const name = buildCampaignName("Business", new Date("2026-06-08"));
    expect(name).toBe("Business - 2026-06");
  });

  it("creates School campaign name", () => {
    const name = buildCampaignName("School", new Date("2026-12-15"));
    expect(name).toBe("School - 2026-12");
  });
});

describe("extractLeadData", () => {
  it("extracts all 3 email touches + subjects from ClickUp task", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({
      contactEmail: "test@example.com",
      contactName: "Jane Doe",
      companyName: "Test Corp",
      touch1Body: "Touch 1 body",
      touch1Subject: "Touch 1 subj",
      touch2Body: "Touch 2 body",
      touch2Subject: "Touch 2 subj",
      touch3Body: "Touch 3 body",
      touch3Subject: "Touch 3 subj",
    });

    const data = extractLeadData(task, config);

    expect(data.contactEmail).toBe("test@example.com");
    expect(data.contactName).toBe("Jane Doe");
    expect(data.companyName).toBe("Test Corp");
    expect(data.touch1Body).toBe("Touch 1 body");
    expect(data.touch1Subject).toBe("Touch 1 subj");
    expect(data.touch2Body).toBe("Touch 2 body");
    expect(data.touch2Subject).toBe("Touch 2 subj");
    expect(data.touch3Body).toBe("Touch 3 body");
    expect(data.touch3Subject).toBe("Touch 3 subj");
  });

  it("splits contact name into first and last", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({ contactName: "Mike Thompson" });
    const data = extractLeadData(task, config);
    expect(data.firstName).toBe("Mike");
    expect(data.lastName).toBe("Thompson");
  });

  it("handles single-word names", () => {
    const config = makeSendConfig();
    const task = makeApprovedLeadTask({ contactName: "Jenn" });
    const data = extractLeadData(task, config);
    expect(data.firstName).toBe("Jenn");
    expect(data.lastName).toBe("");
  });
});

describe("runSend", () => {
  it("processes an approved lead end-to-end", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(1);
    expect(result.results.sent).toBe(1);

    // Verify campaign was listed then created (none existed)
    expect(instantly.listCampaigns).toHaveBeenCalledOnce();
    expect(instantly.createCampaign).toHaveBeenCalledWith("Business - 2026-06");

    // Verify lead was added to campaign
    expect(instantly.addLeadToCampaign).toHaveBeenCalledOnce();
    const addLeadCall = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLeadCall[0]).toBe("camp_new_001");
    expect(addLeadCall[1].email).toBe("mike@abcplumbing.ca");
    expect(addLeadCall[1].customVariables.touch_1_subject).toBe(
      "Quick question about your crew's gear"
    );

    // Verify ClickUp was updated to Outreach Active
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({
        status: "Outreach Active",
      })
    );
  });

  it("reuses existing campaign when one matches segment-month", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Campaign already exists
    (instantly.listCampaigns as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "camp_existing", name: "Business - 2026-06", status: "active" },
    ]);

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    await runSend({ config, clickup, instantly, alerter, logger });

    // Should NOT create a new campaign
    expect(instantly.createCampaign).not.toHaveBeenCalled();
    // Should use existing campaign ID
    const addLeadCall = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(addLeadCall[0]).toBe("camp_existing");
  });

  it("sorts leads by Lead Score descending before processing", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "low_score", leadScore: 3, companyName: "Low Score" }),
      makeApprovedLeadTask({ id: "high_score", leadScore: 5, companyName: "High Score" }),
    ]);

    // Track order of addLeadToCampaign calls
    let callOrder: string[] = [];
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockImplementation(
      async (_campaignId: string, lead: { companyName: string }) => {
        callOrder.push(lead.companyName);
        return { upload_id: "u", leads_uploaded: 1, leads_skipped: 0 };
      }
    );

    await runSend({ config, clickup, instantly, alerter, logger });

    // High score should be processed first
    expect(callOrder[0]).toBe("High Score");
    expect(callOrder[1]).toBe("Low Score");
  });

  it("round-robins sending domains based on lead index", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "lead_0", contactEmail: "a@test.com" }),
      makeApprovedLeadTask({ id: "lead_1", contactEmail: "b@test.com" }),
      makeApprovedLeadTask({ id: "lead_2", contactEmail: "c@test.com" }),
    ]);

    await runSend({ config, clickup, instantly, alerter, logger });

    const addLeadCalls = (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mock.calls;
    expect(addLeadCalls[0][1].customVariables.sending_domain).toBe("shopjaydees.ca");
    expect(addLeadCalls[1][1].customVariables.sending_domain).toBe("shopjaydees.net");
    expect(addLeadCalls[2][1].customVariables.sending_domain).toBe("shopjaydees.ca");
  });

  it("handles instantly-duplicate: tags task and sets Outreach Active", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    // Lead already in workspace
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      upload_id: "u",
      leads_uploaded: 0,
      leads_skipped: 1,
    });

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.instantlyDuplicate).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_approved_001", "instantly-duplicate");
    // Should still set to Outreach Active (lead is in Instantly already)
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({ status: "Outreach Active" })
    );
  });

  it("handles invalid email: tags task and sets Bounced", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    // 400 from Instantly = invalid email
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new InstantlyApiError("Invalid email format", 400)
    );

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.invalidEmail).toBe(1);
    expect(clickup.addTag).toHaveBeenCalledWith("task_approved_001", "invalid-email");
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_approved_001",
      expect.objectContaining({ status: "Bounced" })
    );
  });

  it("handles Instantly 429: stops processing remaining leads", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({ id: "lead_1", contactEmail: "a@test.com" }),
      makeApprovedLeadTask({ id: "lead_2", contactEmail: "b@test.com" }),
      makeApprovedLeadTask({ id: "lead_3", contactEmail: "c@test.com" }),
    ]);

    // First lead succeeds, second gets 429, third should not be attempted
    (instantly.addLeadToCampaign as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ upload_id: "u1", leads_uploaded: 1, leads_skipped: 0 })
      .mockRejectedValueOnce(new InstantlyApiError("Rate limited", 429));

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.results.sent).toBe(1);
    expect(result.results.deferredRateLimit).toBe(2); // lead_2 + lead_3
    // Only 2 addLeadToCampaign calls (lead_3 was never attempted)
    expect(instantly.addLeadToCampaign).toHaveBeenCalledTimes(2);
  });

  it("retries ClickUp PUT 3x with backoff when it fails after Instantly succeeds", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    // All ClickUp updateTask calls fail
    (clickup.updateTask as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("ClickUp 500"))
      .mockRejectedValueOnce(new Error("ClickUp 500"))
      .mockRejectedValueOnce(new Error("ClickUp 500"));

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    // updateTask should have been called 3 times (3 retries)
    expect(clickup.updateTask).toHaveBeenCalledTimes(3);
    // Alert should have been sent for the sync mismatch
    expect(alerter.send).toHaveBeenCalledWith(
      expect.stringContaining("ClickUp/Instantly sync mismatch"),
      expect.any(String)
    );
    expect(result.results.errors).toBe(1);
  });

  it("exits cleanly when no approved leads exist", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(0);
    expect(instantly.listCampaigns).not.toHaveBeenCalled();
  });

  it("skips ClickUp writes and Instantly calls in DRY_RUN mode", async () => {
    const config = { ...makeSendConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const instantly = makeMockInstantly();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeApprovedLeadTask({}),
    ]);

    const result = await runSend({ config, clickup, instantly, alerter, logger });

    expect(result.leadsQueued).toBe(1);
    expect(result.results.sent).toBe(1);
    expect(instantly.addLeadToCampaign).not.toHaveBeenCalled();
    expect(clickup.updateTask).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/send.test.ts`

Expected: FAIL — `runSend`, `extractLeadData`, `getSegmentLabel`, `buildCampaignName` do not exist in `../src/index.js`.

- [ ] **Step 3: Implement the Send Agent**

Add the following to `pipeline/src/index.ts` (alongside the existing `discover` function and its helpers):

```typescript
import type {
  InstantlyClient,
  InstantlyCampaign,
} from "./clients/instantly.js";
import { InstantlyApiError } from "./clients/instantly.js";
import { createInstantlyClient } from "./clients/instantly.js";
import type { ClickUpTask, SendRunResult, SendLeadResult } from "./types.js";

// --- Send Agent Helpers ---

export function getSegmentLabel(task: ClickUpTask, segmentFieldId: string): string {
  for (const field of task.custom_fields) {
    if (field.id === segmentFieldId && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) return opt.name;
    }
  }
  return "Business";
}

export function buildCampaignName(segment: string, now: Date): string {
  const month = now.toISOString().slice(0, 7); // "2026-06"
  return `${segment} - ${month}`;
}

function getFieldValue(task: ClickUpTask, fieldId: string): unknown {
  const field = task.custom_fields.find((f) => f.id === fieldId);
  return field?.value ?? null;
}

export function extractLeadData(
  task: ClickUpTask,
  config: Config
): {
  contactEmail: string;
  contactName: string;
  firstName: string;
  lastName: string;
  companyName: string;
  touch1Body: string;
  touch1Subject: string;
  touch2Body: string;
  touch2Subject: string;
  touch3Body: string;
  touch3Subject: string;
} {
  const contactName = String(getFieldValue(task, config.fields.contactEmail) ? getFieldValue(task, config.fields.contactName) ?? "" : "");
  const parts = contactName.split(" ");
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  return {
    contactEmail: String(getFieldValue(task, config.fields.contactEmail) ?? ""),
    contactName,
    firstName,
    lastName,
    companyName: String(getFieldValue(task, config.fields.companyName) ?? ""),
    touch1Body: String(getFieldValue(task, config.draftFields.emailTouch1) ?? ""),
    touch1Subject: String(getFieldValue(task, config.draftFields.emailTouch1Subject) ?? ""),
    touch2Body: String(getFieldValue(task, config.draftFields.emailTouch2) ?? ""),
    touch2Subject: String(getFieldValue(task, config.draftFields.emailTouch2Subject) ?? ""),
    touch3Body: String(getFieldValue(task, config.draftFields.emailTouch3) ?? ""),
    touch3Subject: String(getFieldValue(task, config.draftFields.emailTouch3Subject) ?? ""),
  };
}

function getLeadScore(task: ClickUpTask, leadScoreFieldId: string): number {
  const field = task.custom_fields.find((f) => f.id === leadScoreFieldId);
  return typeof field?.value === "number" ? field.value : 0;
}

// --- Send Agent Core ---

export interface SendDeps {
  config: Config;
  clickup: ClickUpClient;
  instantly: InstantlyClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runSend(deps: SendDeps): Promise<SendRunResult> {
  const { config, clickup, instantly, alerter, logger } = deps;
  const now = new Date();
  const runId = `send-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Send agent starting");

  const result: SendRunResult = {
    runId,
    timestamp: now.toISOString(),
    leadsQueued: 0,
    results: {
      sent: 0,
      instantlyDuplicate: 0,
      invalidEmail: 0,
      deferredRateLimit: 0,
      errors: 0,
    },
    leads: [],
  };

  // Step 1: Query ClickUp for Approved leads
  const approvedTasks = await clickup.getTasks(config.clickupListId, {
    statuses: ["Approved"],
  });

  if (approvedTasks.length === 0) {
    logger.info("No approved leads. Exiting.");
    return result;
  }

  // Sort by Lead Score descending
  approvedTasks.sort(
    (a, b) =>
      getLeadScore(b, config.fields.leadScore) -
      getLeadScore(a, config.fields.leadScore)
  );

  result.leadsQueued = approvedTasks.length;
  logger.info("Approved leads found", { count: approvedTasks.length });

  // Fetch dropdown options for Sending Domain and Sequence Status
  const prospectFields = await clickup.getFields(config.clickupListId);
  const dropdownOptions: Record<
    string,
    Array<{ name: string; orderindex: number }>
  > = {};
  for (const field of prospectFields) {
    if (field.type_config?.options) {
      dropdownOptions[field.id] = field.type_config.options;
    }
  }

  // Step 4a: List existing campaigns (done once for the entire run)
  const existingCampaigns = config.dryRun
    ? []
    : await instantly.listCampaigns();

  // Cache for campaigns created during this run
  const campaignCache = new Map<string, string>();
  for (const camp of existingCampaigns) {
    campaignCache.set(camp.name, camp.id);
  }

  // Process each lead
  let rateLimited = false;

  for (let i = 0; i < approvedTasks.length; i++) {
    const task = approvedTasks[i];
    const leadResult: SendLeadResult = {
      taskId: task.id,
      company: "",
      email: "",
      status: "sent",
      campaignId: null,
      sendingDomain: null,
    };

    try {
      // If we hit a rate limit on a previous lead, defer remaining
      if (rateLimited) {
        leadResult.status = "deferred_rate_limit";
        result.results.deferredRateLimit += 1;
        result.leads.push(leadResult);
        continue;
      }

      // Step 2: Read lead data
      const leadData = extractLeadData(task, config);
      leadResult.company = leadData.companyName;
      leadResult.email = leadData.contactEmail;

      // Step 3: Sending domain selection (round-robin)
      const sendingDomain =
        config.instantlySendingDomains[i % config.instantlySendingDomains.length];
      leadResult.sendingDomain = sendingDomain;

      // Resolve segment for campaign naming
      const segment = getSegmentLabel(task, config.fields.segment);
      const campaignName = buildCampaignName(segment, now);

      if (config.dryRun) {
        logger.info("DRY_RUN: would send lead", {
          taskId: task.id,
          email: leadData.contactEmail,
          campaign: campaignName,
          sendingDomain,
        });
        result.results.sent += 1;
        result.leads.push(leadResult);
        continue;
      }

      // Step 4a: Find or create campaign
      let campaignId = campaignCache.get(campaignName);
      if (!campaignId) {
        logger.info("Creating new campaign", { name: campaignName });
        const newCampaign = await instantly.createCampaign(campaignName);
        campaignId = newCampaign.id;
        campaignCache.set(campaignName, campaignId);
      }
      leadResult.campaignId = campaignId;

      // Step 4b: Add lead to campaign with custom variables
      const instantlyResponse = await instantly.addLeadToCampaign(campaignId, {
        email: leadData.contactEmail,
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        companyName: leadData.companyName,
        customVariables: {
          touch_1_subject: leadData.touch1Subject,
          touch_1_body: leadData.touch1Body,
          touch_2_subject: leadData.touch2Subject,
          touch_2_body: leadData.touch2Body,
          touch_3_subject: leadData.touch3Subject,
          touch_3_body: leadData.touch3Body,
          sending_domain: sendingDomain,
        },
      });

      // Check for skip (lead already in workspace)
      const isSkipped = instantlyResponse.leads_skipped > 0;
      if (isSkipped) {
        logger.warn("Lead skipped by Instantly (already in workspace)", {
          taskId: task.id,
          email: leadData.contactEmail,
        });
        await clickup.addTag(task.id, "instantly-duplicate");
        leadResult.status = "instantly_duplicate";
        result.results.instantlyDuplicate += 1;
      } else {
        leadResult.status = "sent";
        result.results.sent += 1;
      }

      // Step 5: Write tracking data back to ClickUp
      // Resolve dropdown indices
      const sendingDomainIndex =
        dropdownOptions[config.outreachFields.sendingDomain]?.find(
          (o) => o.name === sendingDomain
        )?.orderindex ?? 0;
      const notStartedIndex =
        dropdownOptions[config.outreachFields.sequenceStatus]?.find(
          (o) => o.name === "Not Started"
        )?.orderindex ?? 0;

      // Retry ClickUp PUT up to 3 times with exponential backoff
      let clickupSuccess = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await clickup.updateTask(task.id, {
            status: "Outreach Active",
            custom_fields: [
              {
                id: config.outreachFields.instantlyCampaignId,
                value: campaignId,
              },
              {
                id: config.outreachFields.instantlyLeadId,
                value: instantlyResponse.upload_id,
              },
              {
                id: config.outreachFields.sendingDomain,
                value: sendingDomainIndex,
              },
              {
                id: config.outreachFields.sequenceStatus,
                value: notStartedIndex,
              },
            ],
          });
          clickupSuccess = true;
          break;
        } catch (clickupErr) {
          const waitMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          logger.warn("ClickUp PUT failed, retrying", {
            taskId: task.id,
            attempt: attempt + 1,
            waitMs,
            error:
              clickupErr instanceof Error
                ? clickupErr.message
                : String(clickupErr),
          });
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      }

      if (!clickupSuccess) {
        // CRITICAL: lead is in Instantly but ClickUp doesn't reflect it
        const alertMsg = `Task ${task.id} (${leadData.contactEmail}) was added to Instantly campaign ${campaignId} but ClickUp update failed after 3 retries. Manual reconciliation needed.`;
        logger.critical("ClickUp/Instantly sync mismatch", {
          taskId: task.id,
          campaignId,
          email: leadData.contactEmail,
        });
        await alerter.send(
          "CRITICAL: ClickUp/Instantly sync mismatch — manual fix needed",
          alertMsg
        );
        leadResult.status = "error";
        leadResult.error = "ClickUp update failed after Instantly success";
        result.results.errors += 1;
      }
    } catch (err) {
      if (err instanceof InstantlyApiError) {
        if (err.code === 429) {
          // Rate limited — stop processing remaining leads
          logger.warn("Instantly 429 — stopping batch", {
            taskId: task.id,
            remainingLeads: approvedTasks.length - i,
          });
          rateLimited = true;
          leadResult.status = "deferred_rate_limit";
          result.results.deferredRateLimit += 1;
          result.leads.push(leadResult);
          continue;
        }

        if (err.code === 400) {
          // Invalid email
          logger.warn("Instantly 400 — invalid email", {
            taskId: task.id,
          });
          await clickup.addTag(task.id, "invalid-email");
          await clickup.updateTask(task.id, { status: "Bounced" });
          leadResult.status = "invalid_email";
          result.results.invalidEmail += 1;
          result.leads.push(leadResult);
          continue;
        }
      }

      // Any other error
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Send failed for lead", {
        taskId: task.id,
        error: errorMsg,
      });
      leadResult.status = "error";
      leadResult.error = errorMsg;
      result.results.errors += 1;
    }

    result.leads.push(leadResult);
  }

  logger.info("Send agent complete", {
    sent: result.results.sent,
    duplicates: result.results.instantlyDuplicate,
    invalidEmails: result.results.invalidEmail,
    deferred: result.results.deferredRateLimit,
    errors: result.results.errors,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("send", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("send-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const instantly = createInstantlyClient({
    apiKey: config.instantlyApiKey,
    logger,
  });

  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig =
      dryRunOverride !== undefined
        ? { ...config, dryRun: dryRunOverride }
        : config;

    const result = await runSend({
      config: effectiveConfig,
      clickup,
      instantly,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Send Agent", { error: errorMsg });
    await alerter.send("Unhandled error in send-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/send.test.ts`

Expected: PASS — all 12 tests.

- [ ] **Step 5: Run all tests**

Run: `cd pipeline && npx vitest run`

Expected: All tests pass across all files.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/index.ts pipeline/tests/send.test.ts
git commit -m "feat: add Send Agent Cloud Function with campaign management and error handling"
```

---

### Task 6: Dormancy Check

**Files:**
- Modify: `pipeline/src/index.ts`
- Create: `pipeline/tests/dormancy.test.ts`

The Dormancy Check Cloud Function runs weekly on Sundays at 6 AM. It queries "Dormant" leads whose 90-day cool-off has passed, clears old drafts and tracking fields, adds a `re-engagement` tag, increments the reactivation count tag, and moves them back to "Enriched" status to re-enter the personalization pipeline.

- [ ] **Step 1: Write Dormancy Check tests**

Create `pipeline/tests/dormancy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runDormancyCheck, isDormantEligible, getReactivationCount } from "../src/index.js";
import { makeDormantLeadTask, makeSendConfig } from "./helpers.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task" }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([]),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("getReactivationCount", () => {
  it("returns 0 when no reactivation tags", () => {
    const task = makeDormantLeadTask({ tags: [] });
    expect(getReactivationCount(task)).toBe(0);
  });

  it("returns 1 when reactivation-1 tag exists", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1"] });
    expect(getReactivationCount(task)).toBe(1);
  });

  it("returns 2 when reactivation-2 tag exists", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-2"] });
    expect(getReactivationCount(task)).toBe(2);
  });

  it("returns highest reactivation count when multiple tags", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1", "reactivation-2"] });
    expect(getReactivationCount(task)).toBe(2);
  });
});

describe("isDormantEligible", () => {
  const config = makeSendConfig();

  it("returns eligible for standard dormant lead", () => {
    const task = makeDormantLeadTask({
      leadScore: 4,
      tags: [],
    });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(true);
  });

  it("returns ineligible when Lead Score < 3", () => {
    const task = makeDormantLeadTask({ leadScore: 2 });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("score_low");
  });

  it("returns ineligible when do-not-reactivate tag present", () => {
    const task = makeDormantLeadTask({ tags: ["do-not-reactivate"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("do_not_reactivate");
  });

  it("returns ineligible when reactivation-2 tag present (max attempts)", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-2"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("max_attempts");
  });

  it("returns ineligible when reactivation date is in the future", () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const task = makeDormantLeadTask({ reactivationDate: String(tomorrow) });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("not_yet_due");
  });

  it("returns eligible when reactivation-1 exists (second reactivation allowed)", () => {
    const task = makeDormantLeadTask({ tags: ["reactivation-1"] });
    const result = isDormantEligible(task, config, new Date());
    expect(result.eligible).toBe(true);
  });
});

describe("runDormancyCheck", () => {
  it("reactivates eligible dormant lead end-to-end", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({}),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(1);
    expect(result.reactivatedLeads).toHaveLength(1);
    expect(result.reactivatedLeads[0].reactivationNumber).toBe(1);

    // Step 2: Verify fields were cleared and status set to Enriched
    expect(clickup.updateTask).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.objectContaining({
        status: "Enriched",
      })
    );
    const updateCall = (clickup.updateTask as ReturnType<typeof vi.fn>).mock.calls[0];
    const customFields = updateCall[1].custom_fields;
    // Email touches should be cleared
    const touch1Field = customFields.find(
      (f: { id: string }) => f.id === config.draftFields.emailTouch1
    );
    expect(touch1Field.value).toBe("");
    // Instantly tracking fields should be cleared
    const campaignField = customFields.find(
      (f: { id: string }) => f.id === config.outreachFields.instantlyCampaignId
    );
    expect(campaignField.value).toBe("");
    // Sequence Status should be reset to 0 (Not Started)
    const seqField = customFields.find(
      (f: { id: string }) => f.id === config.outreachFields.sequenceStatus
    );
    expect(seqField.value).toBe(0);
    // Review Decision should be reset to 0 (Pending Review)
    const reviewField = customFields.find(
      (f: { id: string }) => f.id === config.draftFields.reviewDecision
    );
    expect(reviewField.value).toBe(0);

    // Step 3: Verify tags added
    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "re-engagement");
    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "reactivation-1");

    // Step 4: Verify audit trail comment
    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Dormancy reactivation")
    );
    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Reactivation #1")
    );
  });

  it("increments reactivation tag from 1 to 2 on second reactivation", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["reactivation-1", "re-engagement"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(1);
    expect(result.reactivatedLeads[0].reactivationNumber).toBe(2);
    expect(clickup.addTag).toHaveBeenCalledWith("task_dormant_001", "reactivation-2");
    // Comment should say Reactivation #2
    expect(clickup.addComment).toHaveBeenCalledWith(
      "task_dormant_001",
      expect.stringContaining("Reactivation #2")
    );
  });

  it("skips leads with low score", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ leadScore: 2 }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleScoreLow).toBe(1);
    expect(clickup.updateTask).not.toHaveBeenCalled();
  });

  it("skips leads with do-not-reactivate tag", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["do-not-reactivate"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleDoNotReactivate).toBe(1);
  });

  it("skips leads with reactivation-2 tag (max attempts reached)", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ tags: ["reactivation-2"] }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notEligibleMaxAttempts).toBe(1);
  });

  it("skips leads whose reactivation date has not passed", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const futureDate = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ reactivationDate: futureDate }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.results.reactivated).toBe(0);
    expect(result.results.notYetDue).toBe(1);
  });

  it("exits cleanly when no dormant leads exist", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.dormantTasksChecked).toBe(0);
    expect(result.results.reactivated).toBe(0);
  });

  it("processes multiple leads with mixed eligibility", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const futureDate = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ id: "eligible_1", companyName: "Eligible Corp" }),
      makeDormantLeadTask({ id: "low_score", leadScore: 1, companyName: "Low Score Co" }),
      makeDormantLeadTask({ id: "dnr", tags: ["do-not-reactivate"], companyName: "DNR Corp" }),
      makeDormantLeadTask({ id: "maxed", tags: ["reactivation-2"], companyName: "Max Attempts" }),
      makeDormantLeadTask({ id: "not_due", reactivationDate: futureDate, companyName: "Not Due Yet" }),
      makeDormantLeadTask({ id: "eligible_2", companyName: "Also Eligible" }),
    ]);

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    expect(result.dormantTasksChecked).toBe(6);
    expect(result.results.reactivated).toBe(2);
    expect(result.results.notEligibleScoreLow).toBe(1);
    expect(result.results.notEligibleDoNotReactivate).toBe(1);
    expect(result.results.notEligibleMaxAttempts).toBe(1);
    expect(result.results.notYetDue).toBe(1);
    expect(result.reactivatedLeads).toHaveLength(2);
  });

  it("continues processing when one lead fails", async () => {
    const config = makeSendConfig();
    const clickup = makeMockClickUp();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (clickup.getTasks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      makeDormantLeadTask({ id: "fail_lead", companyName: "Fail Corp" }),
      makeDormantLeadTask({ id: "ok_lead", companyName: "OK Corp" }),
    ]);

    // First updateTask call fails, second succeeds
    (clickup.updateTask as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("ClickUp error"))
      .mockResolvedValueOnce({});

    const result = await runDormancyCheck({ config, clickup, alerter, logger });

    // Second lead should still be processed
    expect(result.results.reactivated).toBe(1);
    expect(alerter.send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/dormancy.test.ts`

Expected: FAIL — `runDormancyCheck`, `isDormantEligible`, `getReactivationCount` do not exist in `../src/index.js`.

- [ ] **Step 3: Implement the Dormancy Check**

Add the following to `pipeline/src/index.ts` (alongside the existing `discover` and `send` functions):

```typescript
import type { DormancyRunResult, DormancyLeadResult } from "./types.js";

// --- Dormancy Check Helpers ---

export function getReactivationCount(task: ClickUpTask): number {
  let max = 0;
  for (const tag of task.tags) {
    const match = tag.name.match(/^reactivation-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max;
}

export function isDormantEligible(
  task: ClickUpTask,
  config: Config,
  now: Date
): { eligible: boolean; reason?: string } {
  // Check Lead Score >= 3
  const leadScore = getLeadScore(task, config.fields.leadScore);
  if (leadScore < 3) {
    return { eligible: false, reason: "score_low" };
  }

  // Check do-not-reactivate tag
  if (task.tags.some((t) => t.name === "do-not-reactivate")) {
    return { eligible: false, reason: "do_not_reactivate" };
  }

  // Check max reactivation attempts (2 max)
  if (getReactivationCount(task) >= 2) {
    return { eligible: false, reason: "max_attempts" };
  }

  // Check reactivation date <= today
  const reactivationDateField = task.custom_fields.find(
    (f) => f.id === config.outreachFields.dormantReactivationDate
  );
  if (reactivationDateField && reactivationDateField.value) {
    const reactivationTs = parseInt(String(reactivationDateField.value), 10);
    if (reactivationTs > now.getTime()) {
      return { eligible: false, reason: "not_yet_due" };
    }
  }

  return { eligible: true };
}

// --- Dormancy Check Core ---

export interface DormancyDeps {
  config: Config;
  clickup: ClickUpClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runDormancyCheck(
  deps: DormancyDeps
): Promise<DormancyRunResult> {
  const { config, clickup, alerter, logger } = deps;
  const now = new Date();
  const runId = `dormancy-check-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Dormancy check starting");

  const result: DormancyRunResult = {
    runId,
    timestamp: now.toISOString(),
    dormantTasksChecked: 0,
    results: {
      reactivated: 0,
      notEligibleScoreLow: 0,
      notEligibleDoNotReactivate: 0,
      notEligibleMaxAttempts: 0,
      notYetDue: 0,
    },
    reactivatedLeads: [],
  };

  // Step 1: Query ClickUp for Dormant leads (include_closed=true since Dormant is a closed status)
  const dormantTasks = await clickup.getTasks(config.clickupListId, {
    statuses: ["Dormant"],
    includeClosed: true,
  });

  result.dormantTasksChecked = dormantTasks.length;

  if (dormantTasks.length === 0) {
    logger.info("No dormant leads found. Exiting.");
    return result;
  }

  logger.info("Dormant leads found", { count: dormantTasks.length });

  // Process each dormant lead
  for (const task of dormantTasks) {
    const eligibility = isDormantEligible(task, config, now);

    if (!eligibility.eligible) {
      switch (eligibility.reason) {
        case "score_low":
          result.results.notEligibleScoreLow += 1;
          break;
        case "do_not_reactivate":
          result.results.notEligibleDoNotReactivate += 1;
          break;
        case "max_attempts":
          result.results.notEligibleMaxAttempts += 1;
          break;
        case "not_yet_due":
          result.results.notYetDue += 1;
          break;
      }
      logger.debug("Dormant lead not eligible", {
        taskId: task.id,
        reason: eligibility.reason,
      });
      continue;
    }

    // This lead is eligible for reactivation
    const currentReactivationCount = getReactivationCount(task);
    const newReactivationNumber = currentReactivationCount + 1;

    // Get dormant date for logging
    const dormantDateField = task.custom_fields.find(
      (f) => f.id === config.outreachFields.dormantDate
    );
    const dormantSince = dormantDateField?.value
      ? new Date(parseInt(String(dormantDateField.value), 10)).toISOString().slice(0, 10)
      : "unknown";

    const companyNameField = task.custom_fields.find(
      (f) => f.id === config.fields.companyName
    );
    const companyName = String(companyNameField?.value ?? task.name);

    try {
      // Step 2: Clear old draft fields, reset tracking fields, set to Enriched
      await clickup.updateTask(task.id, {
        status: "Enriched",
        custom_fields: [
          // Clear personalization drafts
          { id: config.draftFields.websiteScrapeSummary, value: "" },
          { id: config.draftFields.communitySignals, value: "" },
          { id: config.draftFields.personalizationHooks, value: "" },
          { id: config.draftFields.emailTouch1, value: "" },
          { id: config.draftFields.emailTouch1Subject, value: "" },
          { id: config.draftFields.emailTouch2, value: "" },
          { id: config.draftFields.emailTouch2Subject, value: "" },
          { id: config.draftFields.emailTouch3, value: "" },
          { id: config.draftFields.emailTouch3Subject, value: "" },
          { id: config.draftFields.linkedinMessage, value: "" },
          // Reset review decision to "Pending Review" (index 0)
          { id: config.draftFields.reviewDecision, value: 0 },
          // Clear Instantly tracking fields
          { id: config.outreachFields.instantlyCampaignId, value: "" },
          { id: config.outreachFields.instantlyLeadId, value: "" },
          // Reset sequence status to "Not Started" (index 0)
          { id: config.outreachFields.sequenceStatus, value: 0 },
        ],
      });

      // Step 3: Add re-engagement tag + increment reactivation tag
      await clickup.addTag(task.id, "re-engagement");
      await clickup.addTag(task.id, `reactivation-${newReactivationNumber}`);

      // Step 4: Add audit trail comment
      await clickup.addComment(
        task.id,
        `Dormancy reactivation: 90-day cool-off complete. Cleared old drafts, moved to Enriched for re-personalization with fresh angle. Reactivation #${newReactivationNumber}.`
      );

      logger.info("Lead reactivated", {
        taskId: task.id,
        company: companyName,
        reactivationNumber: newReactivationNumber,
        dormantSince,
      });

      result.results.reactivated += 1;
      result.reactivatedLeads.push({
        taskId: task.id,
        company: companyName,
        dormantSince,
        reactivationNumber: newReactivationNumber,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to reactivate dormant lead", {
        taskId: task.id,
        error: errorMsg,
      });
      await alerter.send(
        `Dormancy reactivation failed for task ${task.id}`,
        errorMsg
      );
      // Continue processing other leads
    }
  }

  logger.info("Dormancy check complete", {
    checked: result.dormantTasksChecked,
    reactivated: result.results.reactivated,
    notEligibleScoreLow: result.results.notEligibleScoreLow,
    notEligibleDoNotReactivate: result.results.notEligibleDoNotReactivate,
    notEligibleMaxAttempts: result.results.notEligibleMaxAttempts,
    notYetDue: result.results.notYetDue,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("dormancyCheck", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("dormancy-check");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });

  try {
    const result = await runDormancyCheck({
      config,
      clickup,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Dormancy Check", { error: errorMsg });
    await alerter.send("Unhandled error in dormancy-check", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/dormancy.test.ts`

Expected: PASS — all 13 tests.

- [ ] **Step 5: Run all tests**

Run: `cd pipeline && npx vitest run`

Expected: All tests pass across all files.

- [ ] **Step 6: Type check**

Run: `cd pipeline && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/index.ts pipeline/tests/dormancy.test.ts
git commit -m "feat: add Dormancy Check Cloud Function with reactivation logic"
```

---

### Task 7: Verify Full Test Suite

- [ ] **Step 1: Run all tests from the pipeline directory**

Run: `cd pipeline && npx vitest run`

Expected: All tests pass. Total should be ~55+ tests across 10 test files:
- `tests/types.test.ts` (7 tests)
- `tests/config.test.ts` (13 tests)
- `tests/logger.test.ts` (3 tests)
- `tests/alerting.test.ts` (3 tests)
- `tests/clients/clickup.test.ts` (6 tests)
- `tests/clients/hunter.test.ts` (4 tests)
- `tests/clients/instantly.test.ts` (8 tests)
- `tests/scoring.test.ts` (10 tests)
- `tests/send.test.ts` (12 tests)
- `tests/dormancy.test.ts` (13 tests)

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

| Spec Requirement | Task | Status |
|------------------|------|--------|
| Instantly API v2 client (campaigns + leads) | Task 3 | Covered |
| Bearer token auth for Instantly | Task 3 | Covered |
| List campaigns with `?limit=100&status=active` | Task 3 | Covered |
| Create campaign with weekday 8AM-5PM Pacific schedule | Task 3 | Covered |
| Add lead with `skip_if_in_workspace: true` | Task 3 | Covered |
| Custom variables for all 3 touches (subject + body) | Task 3 | Covered |
| `sending_domain` custom variable | Task 3 | Covered |
| Instantly error types (400, 401, 429) with `code` property | Task 3 | Covered |
| Send Agent: Query Approved leads from ClickUp | Task 5 | Covered |
| Send Agent: Sort by Lead Score descending | Task 5 | Covered |
| Send Agent: Round-robin sending domain selection | Task 5 | Covered |
| Send Agent: Find or create campaign per segment-month | Task 5 | Covered |
| Send Agent: Write tracking data (Campaign ID, Lead ID, Sending Domain, Sequence Status) | Task 5 | Covered |
| Send Agent: Set status to "Outreach Active" | Task 5 | Covered |
| Send Agent: Handle `leads_skipped: 1` with `instantly-duplicate` tag | Task 5 | Covered |
| Send Agent: Handle 400 with `invalid-email` tag and "Bounced" status | Task 5 | Covered |
| Send Agent: Handle 429 — stop processing remaining leads | Task 5 | Covered |
| Send Agent: Retry ClickUp PUT 3x with exponential backoff after Instantly success | Task 5 | Covered |
| Send Agent: Alert on ClickUp/Instantly sync mismatch | Task 5 | Covered |
| Send Agent: DRY_RUN mode | Task 5 | Covered |
| Send Agent: Cloud Function HTTP entry point | Task 5 | Covered |
| Dormancy Check: Query Dormant leads with `include_closed=true` | Task 6 | Covered |
| Dormancy Check: Filter by Dormant Reactivation Date <= today | Task 6 | Covered |
| Dormancy Check: Filter by Lead Score >= 3 | Task 6 | Covered |
| Dormancy Check: Filter by no `do-not-reactivate` tag | Task 6 | Covered |
| Dormancy Check: Filter by no `reactivation-2` tag (max 2 cycles) | Task 6 | Covered |
| Dormancy Check: Clear old draft fields | Task 6 | Covered |
| Dormancy Check: Reset Instantly tracking fields | Task 6 | Covered |
| Dormancy Check: Reset Review Decision to "Pending Review" | Task 6 | Covered |
| Dormancy Check: Reset Sequence Status to "Not Started" | Task 6 | Covered |
| Dormancy Check: Add `re-engagement` tag | Task 6 | Covered |
| Dormancy Check: Increment reactivation tag (1 or 2) | Task 6 | Covered |
| Dormancy Check: Add audit trail comment | Task 6 | Covered |
| Dormancy Check: Set status to "Enriched" (re-enters personalization pipeline) | Task 6 | Covered |
| Dormancy Check: Per-lead error isolation | Task 6 | Covered |
| Dormancy Check: Cloud Function HTTP entry point | Task 6 | Covered |
| Config: INSTANTLY_API_KEY env var | Task 2 | Covered |
| Config: INSTANTLY_SENDING_DOMAINS comma-separated | Task 2 | Covered |
| Config: All outreach tracking field IDs | Task 2 | Covered |
| Config: All draft message field IDs | Task 2 | Covered |
| Types: SendRunResult and SendLeadResult | Task 1 | Covered |
| Types: DormancyRunResult and DormancyLeadResult | Task 1 | Covered |
| Types: SENDING_DOMAINS and SEQUENCE_STATUSES constants | Task 1 | Covered |

### 2. Placeholder Scan

No TBD, TODO, or "implement later" references. All code steps include complete, runnable code.

### 3. Type Consistency

- `InstantlyClient` interface methods match usage in Send Agent
- `InstantlyApiError.code` is used for 400/429 error branching
- `Config` additions (`instantlyApiKey`, `instantlySendingDomains`, `outreachFields`, `draftFields`) match what `runSend` and `runDormancyCheck` read
- `SendRunResult` matches the output schema from the API contracts spec
- `DormancyRunResult` matches the output schema from the API contracts spec
- `getFieldValue`, `getSegmentLabel`, `getLeadScore`, `getReactivationCount` helper functions work with the `ClickUpTask` type consistently
- `extractLeadData` reads the correct field IDs from config for all 6 email touches

### 4. API Contract Alignment

- Send Agent output schema matches `Component 3: Send Agent` in `specs/2026-06-08-api-contracts.md`
- Dormancy Check output schema matches `Component 4: Dormancy Check Function` in `specs/2026-06-08-api-contracts.md`
- Campaign naming convention (`Segment - YYYY-MM`) matches spec
- Instantly API request shapes match the v2 endpoints documented in the spec
- ClickUp field updates use dropdown indices (not labels) for Sending Domain, Sequence Status, and Review Decision

### 5. What This Plan Does NOT Cover (deferred to other plans)

- Firecrawl client (Plan 2 — Personalization Agent)
- Gemini client (Plan 2 — Personalization Agent)
- ClickUp workspace configuration (Plan 4)
- Instantly campaign sequence step configuration (Plan 4 — done via Instantly UI or API during setup)
- Zapier zap setup for engagement tracking (Plan 4)
- Cloud Scheduler configuration (Plan 4)
- GCP deployment (Plan 4)
- E2E integration testing with live APIs (Plan 4)

### 6. Design Decisions

**Campaign creation is lazy:** Campaigns are created on first use per segment-month, not pre-created. This means the first lead in a new month/segment triggers campaign creation. The campaign cache within a single run prevents duplicate creation. Subsequent runs find the existing campaign via `listCampaigns`.

**Instantly sequence steps are not configured via API:** The 3-touch sequence with Day 0 / Day 4 / Day 9 timing is configured at the campaign level, either via the Instantly UI or during Plan 4 setup. The Send Agent only provides the content via `custom_variables`. This aligns with the spec's note that "the 3-touch sequence is configured at the campaign level in Instantly."

**ClickUp update retry is critical path:** When ClickUp fails after Instantly succeeds, the lead is live in Instantly but ClickUp doesn't know about it. The 3-retry strategy with exponential backoff plus alert-on-failure ensures this edge case is both resilient and visible. The alert includes the task ID and Instantly campaign ID for manual reconciliation.

**Dormancy reactivation uses tags instead of a custom field:** The reactivation count is tracked via tags (`reactivation-1`, `reactivation-2`) rather than a dedicated custom field, per the ClickUp data model spec. This avoids adding another field to the already-53-field schema while providing the same guard against over-reactivation.
