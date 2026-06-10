# Foundation + Discovery Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project scaffolding, shared API clients, configuration, and the Discovery Agent Cloud Function that processes Jenn's Prospecting Requests via Hunter.io, auto-scores leads, and creates ClickUp tasks.

**Architecture:** Node.js 20 TypeScript Cloud Functions with dependency-injected API clients. Each pipeline agent is an HTTP-triggered Cloud Function scheduled by Google Cloud Scheduler. ClickUp is the single source of truth. The Discovery Agent reads Prospecting Requests from ClickUp, queries Hunter.io's Domain Search API, deduplicates against existing leads, auto-scores using a rubric, and creates lead tasks with appropriate statuses.

**Tech Stack:** Node.js 20, TypeScript 5, Vitest, `@google-cloud/functions-framework`, native `fetch` (Node 20 built-in)

**Supersedes:** `docs/superpowers/plans/2026-05-21-foundation-discover-agent.md` (obsolete — used Google Maps/Firecrawl approach before specs were finalized)

---

## Multi-Plan Overview

This is **Plan 1 of 4**. Each plan produces working, independently testable software.

| Plan | Scope | Depends On | Status |
|------|-------|-----------|--------|
| **1. Foundation + Discovery Agent** | Scaffolding, types, config, ClickUp client, Hunter.io client, scoring, mapping, Discovery Agent, error alerting, structured logging | Nothing | **This plan** |
| 2. Personalization Agent | Firecrawl client, Gemini client, website scraping, draft generation, validation, re-engagement detection | Plan 1 | |
| 3. Send Agent + Dormancy Check | Instantly client, campaign management, send logic, dormancy reactivation, reconciliation | Plan 1 | |
| 4. Platform Setup + Integration Testing | ClickUp workspace config, Instantly campaign setup, Zapier zaps, Cloud Scheduler, GCP deployment, E2E testing | Plans 1-3 + client accounts | |

## Build Now vs. Blocked

**Buildable now (no client accounts needed):**
- All code, types, configuration, and API clients
- Full test suite with mocked HTTP responses
- Local Cloud Function testing via functions-framework
- Hunter.io query mapping and scoring logic

**Blocked on client account setup:**
- ClickUp workspace configuration (need Jenn's ClickUp)
- Live Hunter.io queries (need client's API key)
- Google Cloud deployment (need GCP project)
- Real ClickUp custom field IDs (populated after workspace setup)
- End-to-end integration testing with live APIs

---

## File Structure

All pipeline code lives under `pipeline/` within the `leadgeneration/` project directory.

```
pipeline/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts                    # Cloud Function HTTP entry points
│   ├── config.ts                   # Env var loading + validation
│   ├── logger.ts                   # Structured JSON logging for GCP
│   ├── alerting.ts                 # Error alert emails via Mailgun/SendGrid
│   ├── types.ts                    # Shared TypeScript types
│   ├── scoring.ts                  # Lead scoring rubric (1-5)
│   ├── mapping.ts                  # Category → search terms, city → phase
│   └── clients/
│       ├── clickup.ts              # ClickUp API client (rate-limited + retry)
│       └── hunter.ts               # Hunter.io API client
├── tests/
│   ├── helpers.ts                  # Test helpers (mock factories, fixtures)
│   ├── scoring.test.ts
│   ├── mapping.test.ts
│   ├── clients/
│   │   ├── clickup.test.ts
│   │   └── hunter.test.ts
│   ├── alerting.test.ts
│   └── discovery.test.ts          # Discovery Agent integration tests
```

The Discovery Agent logic lives in `src/index.ts` as the `discover` Cloud Function handler. It is not a separate module — it composes the clients and scoring/mapping modules directly. Extracting it into a class would be premature; the function is the unit.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `pipeline/package.json`
- Create: `pipeline/tsconfig.json`
- Create: `pipeline/vitest.config.ts`
- Create: `pipeline/.env.example`
- Create: `pipeline/.gitignore`

- [ ] **Step 1: Create directory structure**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration
mkdir -p pipeline/src/clients
mkdir -p pipeline/tests/clients
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "shopjaydees-leadgen",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "npx functions-framework --target=discover --source=dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 5: Create .env.example**

```env
# API Keys
CLICKUP_API_TOKEN=pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HUNTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ClickUp Workspace IDs
CLICKUP_LIST_ID=123456789
CLICKUP_PROSPECTING_LIST_ID=123456789

# ClickUp Custom Field IDs — populated after workspace setup via GET /list/{list_id}/field
# Contact & Company Info (11 fields)
CLICKUP_FIELD_COMPANY_NAME=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMPANY_DOMAIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMPANY_INDUSTRY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMPANY_HEADCOUNT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_COMPANY_CITY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CONTACT_NAME=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CONTACT_TITLE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CONTACT_EMAIL=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_EMAIL_CONFIDENCE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CONTACT_LINKEDIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CONTACT_PHONE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Lead Qualification (5 fields)
CLICKUP_FIELD_SEGMENT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CATEGORY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LEAD_SCORE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SCORE_RATIONALE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_GEOGRAPHIC_PHASE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# CASL Compliance (1 field used at discovery time)
CLICKUP_FIELD_CASL_SOURCE_URL=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Metadata (1 field used at discovery time)
CLICKUP_FIELD_IMPORT_BATCH=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Prospecting Request fields
CLICKUP_FIELD_PR_RESULTS_FOUND=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_PR_LEADS_CREATED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_PR_LEADS_PARKED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_PR_DUPLICATES_SKIPPED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Configuration
CLICKUP_RATE_LIMIT=90
DRY_RUN=false

# Alerting
ALERT_EMAIL=cody@sixohquad.com
ALERT_WEBHOOK_URL=
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.env
*.tgz
```

- [ ] **Step 7: Install dependencies**

```bash
cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
npm install
```

- [ ] **Step 8: Verify setup — run empty test suite**

Run: `cd pipeline && npx vitest run`

Expected: vitest finds no test files, exits cleanly (or with "no tests found" message).

- [ ] **Step 9: Commit**

```bash
git add pipeline/package.json pipeline/tsconfig.json pipeline/vitest.config.ts pipeline/.env.example pipeline/.gitignore pipeline/package-lock.json
git commit -m "feat: scaffold pipeline project with TypeScript + Vitest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `pipeline/src/types.ts`
- Test: `pipeline/tests/types.test.ts`

- [ ] **Step 1: Write type tests**

Create `pipeline/tests/types.test.ts`:

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
  SEGMENTS,
  PROSPECT_STATUSES,
  PROSPECTING_REQUEST_STATUSES,
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: FAIL — module `../src/types.js` does not exist.

- [ ] **Step 3: Implement types**

Create `pipeline/src/types.ts`:

```typescript
export const SEGMENTS = ["Business", "School", "Team"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PROSPECT_STATUSES = [
  "New",
  "Enriched",
  "Personalizing",
  "Ready for Review",
  "Approved",
  "Outreach Active",
  "Responded - Owner Follow-up",
  "Parked",
  "Won",
  "Lost",
  "Dormant",
  "Unsubscribed",
  "Bounced",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECTING_REQUEST_STATUSES = [
  "Requested",
  "Running",
  "Complete",
  "Failed",
] as const;
export type ProspectingRequestStatus =
  (typeof PROSPECTING_REQUEST_STATUSES)[number];

export const BUSINESS_CATEGORIES = [
  "Trades & Contractors",
  "Restaurants & Hospitality",
  "Fitness & Wellness",
  "Real Estate & Property Mgmt",
  "Auto & Trades Shops",
] as const;

export const SCHOOL_CATEGORIES = [
  "Elementary & Secondary",
  "Independent & Private Schools",
  "Daycares & Preschools",
  "Post-Secondary Clubs",
] as const;

export const TEAM_CATEGORIES = [
  "Youth Sports Leagues",
  "Adult Rec Leagues",
  "Dance & Performance",
  "Community Sport Orgs",
] as const;

export type Category =
  | (typeof BUSINESS_CATEGORIES)[number]
  | (typeof SCHOOL_CATEGORIES)[number]
  | (typeof TEAM_CATEGORIES)[number]
  | "Other";

export const CITIES = [
  "Surrey",
  "Langley",
  "Abbotsford",
  "Chilliwack",
  "Mission",
  "Maple Ridge",
  "Burnaby",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Pitt Meadows",
  "Richmond",
  "Delta",
  "North Vancouver",
  "Vancouver",
  "Other",
] as const;
export type City = (typeof CITIES)[number];

export const GEOGRAPHIC_PHASES = [
  "Phase 1 - Fraser Valley Core",
  "Phase 2 - Tri-Cities & Burnaby",
  "Phase 3 - Metro Vancouver",
  "Future - Rest of BC+",
] as const;
export type GeographicPhase = (typeof GEOGRAPHIC_PHASES)[number];

export interface HunterContact {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  position: string | null;
  value: string;
  type: "personal" | "generic";
  confidence: number;
  linkedin: string | null;
  phone_number: string | null;
  sources: Array<{ uri: string; domain: string }>;
}

export interface HunterCompany {
  domain: string;
  organization: string;
  industry: string | null;
  emails: HunterContact[];
}

export interface ProspectingRequest {
  taskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  maxResults: number;
}

export interface LeadScoreResult {
  score: number;
  rationale: string;
}

export interface RequestResult {
  requestTaskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  resultsFound: number;
  leadsCreated: number;
  leadsParked: number;
  duplicatesSkipped: number;
  noContactSkipped: number;
  status: "completed" | "failed";
  error?: string;
}

export interface DiscoveryRunResult {
  runId: string;
  timestamp: string;
  requestsFound: number;
  requestsProcessed: number;
  results: {
    completed: number;
    failed: number;
    staleReset: number;
  };
  requests: RequestResult[];
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string };
  date_created: string;
  date_updated: string;
  custom_fields: Array<{
    id: string;
    name: string;
    value: unknown;
    type: string;
    type_config?: { options?: Array<{ id: string; name: string; orderindex: number }> };
  }>;
  tags: Array<{ name: string }>;
}

export interface ClickUpFieldOption {
  id: string;
  name: string;
  orderindex: number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/types.test.ts`

Expected: PASS — all 3 assertions.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/types.ts pipeline/tests/types.test.ts
git commit -m "feat: add shared TypeScript types for pipeline"
```

---

### Task 3: Configuration Module

**Files:**
- Create: `pipeline/src/config.ts`
- Test: `pipeline/tests/config.test.ts`

- [ ] **Step 1: Write configuration tests**

Create `pipeline/tests/config.test.ts`:

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: FAIL — module `../src/config.js` does not exist.

- [ ] **Step 3: Implement configuration module**

Create `pipeline/src/config.ts`:

```typescript
export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  clickupListId: string;
  clickupProspectingListId: string;
  clickupRateLimit: number;
  dryRun: boolean;
  alertEmail: string;
  alertWebhookUrl: string;
  fields: ClickUpFieldIds;
  prospectingFields: ProspectingRequestFieldIds;
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
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/config.test.ts`

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/config.ts pipeline/tests/config.test.ts
git commit -m "feat: add configuration module with env var validation"
```

---

### Task 4: Structured Logger

**Files:**
- Create: `pipeline/src/logger.ts`
- Test: `pipeline/tests/logger.test.ts`

- [ ] **Step 1: Write logger tests**

Create `pipeline/tests/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs structured JSON with severity and component", () => {
    const log = createLogger("discovery-agent");
    log.info("Processing started", { requestCount: 3 });

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.severity).toBe("INFO");
    expect(output.component).toBe("discovery-agent");
    expect(output.message).toBe("Processing started");
    expect(output.requestCount).toBe(3);
    expect(output.timestamp).toBeDefined();
  });

  it("logs at different severity levels", () => {
    const log = createLogger("test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    log.critical("c");

    expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    const severities = consoleLogSpy.mock.calls.map(
      (call) => JSON.parse(call[0] as string).severity
    );
    expect(severities).toEqual([
      "DEBUG",
      "INFO",
      "WARNING",
      "ERROR",
      "CRITICAL",
    ]);
  });

  it("includes run_id when set", () => {
    const log = createLogger("test");
    log.setRunId("discover-2026-06-08-040000");
    log.info("test");

    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.run_id).toBe("discover-2026-06-08-040000");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/logger.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement logger**

Create `pipeline/src/logger.ts`:

```typescript
type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  critical(message: string, data?: Record<string, unknown>): void;
  setRunId(runId: string): void;
}

export function createLogger(component: string): Logger {
  let runId: string | undefined;

  function log(
    severity: Severity,
    message: string,
    data?: Record<string, unknown>
  ) {
    const entry: Record<string, unknown> = {
      severity,
      component,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };
    if (runId) {
      entry.run_id = runId;
    }
    console.log(JSON.stringify(entry));
  }

  return {
    debug: (msg, data) => log("DEBUG", msg, data),
    info: (msg, data) => log("INFO", msg, data),
    warn: (msg, data) => log("WARNING", msg, data),
    error: (msg, data) => log("ERROR", msg, data),
    critical: (msg, data) => log("CRITICAL", msg, data),
    setRunId: (id) => {
      runId = id;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/logger.test.ts`

Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/logger.ts pipeline/tests/logger.test.ts
git commit -m "feat: add structured JSON logger for GCP Cloud Logging"
```

---

### Task 5: Error Alerting

**Files:**
- Create: `pipeline/src/alerting.ts`
- Test: `pipeline/tests/alerting.test.ts`

- [ ] **Step 1: Write alerting tests**

Create `pipeline/tests/alerting.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAlerter, type Alerter } from "../src/alerting.js";

describe("createAlerter", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let alerter: Alerter;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    alerter = createAlerter({
      alertEmail: "cody@sixohquad.com",
      alertWebhookUrl: "https://hooks.example.com/alert",
      fetchFn: mockFetch,
    });
  });

  it("sends alert via webhook POST", async () => {
    await alerter.send(
      "ClickUp auth failure — pipeline halted",
      "Discovery agent got 401 from ClickUp API."
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/alert");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.subject).toContain("ClickUp auth failure");
    expect(body.details).toContain("401");
    expect(body.to).toBe("cody@sixohquad.com");
  });

  it("does not throw when webhook URL is empty", async () => {
    const quietAlerter = createAlerter({
      alertEmail: "cody@sixohquad.com",
      alertWebhookUrl: "",
      fetchFn: mockFetch,
    });
    await expect(
      quietAlerter.send("test", "details")
    ).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not throw when webhook fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    await expect(
      alerter.send("test", "details")
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/alerting.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement alerting**

Create `pipeline/src/alerting.ts`:

```typescript
export interface Alerter {
  send(subject: string, details: string): Promise<void>;
}

export interface AlerterOptions {
  alertEmail: string;
  alertWebhookUrl: string;
  fetchFn?: typeof fetch;
}

export function createAlerter(options: AlerterOptions): Alerter {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async send(subject: string, details: string): Promise<void> {
      if (!options.alertWebhookUrl) {
        return;
      }
      try {
        await fetchFn(options.alertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `[ShopJaydees Pipeline] ${subject}`,
            details,
            to: options.alertEmail,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch {
        // Alert delivery failure must never crash the pipeline
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/alerting.test.ts`

Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alerting.ts pipeline/tests/alerting.test.ts
git commit -m "feat: add error alerting via webhook"
```

---

### Task 6: ClickUp API Client

**Files:**
- Create: `pipeline/src/clients/clickup.ts`
- Test: `pipeline/tests/clients/clickup.test.ts`

This is the most substantial client. It handles rate limiting (90 req/min with token bucket), 429 retries, and provides methods for all ClickUp operations the Discovery Agent needs.

- [ ] **Step 1: Write ClickUp client tests**

Create `pipeline/tests/clients/clickup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClickUpClient, type ClickUpClient } from "../../src/clients/clickup.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponses(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers({ "x-ratelimit-remaining": "50" }),
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    });
  }
  return fn;
}

describe("ClickUpClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("getTasks", () => {
    it("fetches tasks from a list with status filter", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [{ id: "t1", name: "Test", status: { status: "Requested" }, custom_fields: [], tags: [] }] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const tasks = await client.getTasks("list123", { statuses: ["Requested"] });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("t1");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("list/list123/task");
      expect(url).toContain("statuses%5B%5D=Requested");
    });

    it("includes closed tasks when requested", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.getTasks("list123", { includeClosed: true });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("include_closed=true");
    });

    it("supports custom_fields filter for dedup", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { tasks: [] },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.getTasks("list123", {
        customFields: [{ field_id: "f1", operator: "=", value: "https://example.com" }],
        includeClosed: true,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("custom_fields=");
    });
  });

  describe("createTask", () => {
    it("creates a task with custom fields", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { id: "new_task", name: "Test Co — Jane", status: { status: "Enriched" } },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.createTask("list123", {
        name: "Test Co — Jane",
        status: "Enriched",
        custom_fields: [{ id: "f1", value: "Test Co" }],
      });

      expect(result.id).toBe("new_task");
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.name).toBe("Test Co — Jane");
      expect(body.status).toBe("Enriched");
    });
  });

  describe("updateTask", () => {
    it("updates task status and custom fields", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { id: "t1", status: { status: "Complete" } },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.updateTask("t1", {
        status: "Complete",
        custom_fields: [{ id: "f1", value: 25 }],
      });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("task/t1");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("addComment", () => {
    it("posts a comment to a task", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: { id: "comment1" },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      await client.addComment("t1", "Completed: 10 leads created");

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("task/t1/comment");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.comment_text).toBe("Completed: 10 leads created");
    });
  });

  describe("rate limiting", () => {
    it("retries on 429 with delay", async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "1" }),
          text: () => Promise.resolve("rate limited"),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ "x-ratelimit-remaining": "50" }),
          json: () => Promise.resolve({ tasks: [] }),
          text: () => Promise.resolve("{}"),
        });

      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const tasks = await client.getTasks("list123", {});

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(tasks).toEqual([]);
    });
  });

  describe("getFields", () => {
    it("fetches custom fields for a list", async () => {
      const mockFetch = mockFetchResponses({
        status: 200,
        body: {
          fields: [
            { id: "f1", name: "Segment", type: "drop_down", type_config: { options: [{ name: "Business", orderindex: 0 }] } },
          ],
        },
      });
      const client = createClickUpClient({
        token: "pk_test",
        rateLimit: 90,
        fetchFn: mockFetch,
        logger,
      });

      const fields = await client.getFields("list123");

      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe("Segment");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/clients/clickup.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ClickUp client**

Create `pipeline/src/clients/clickup.ts`:

```typescript
import type { ClickUpTask } from "../types.js";
import type { Logger } from "../logger.js";

const BASE_URL = "https://api.clickup.com/api/v2";

export interface ClickUpClient {
  getTasks(
    listId: string,
    opts: {
      statuses?: string[];
      customFields?: Array<{ field_id: string; operator: string; value: string }>;
      includeClosed?: boolean;
    }
  ): Promise<ClickUpTask[]>;

  createTask(
    listId: string,
    task: {
      name: string;
      status: string;
      tags?: string[];
      custom_fields: Array<{ id: string; value: unknown }>;
    }
  ): Promise<ClickUpTask>;

  updateTask(
    taskId: string,
    update: {
      status?: string;
      custom_fields?: Array<{ id: string; value: unknown }>;
    }
  ): Promise<ClickUpTask>;

  addComment(taskId: string, text: string): Promise<void>;

  addTag(taskId: string, tag: string): Promise<void>;

  getFields(
    listId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      type_config?: { options?: Array<{ name: string; orderindex: number }> };
    }>
  >;
}

interface ClickUpClientOptions {
  token: string;
  rateLimit: number;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function createClickUpClient(options: ClickUpClientOptions): ClickUpClient {
  const fetchFn = options.fetchFn ?? fetch;
  const maxPerMinute = options.rateLimit;
  let requestTimestamps: number[] = [];

  async function throttle(): Promise<void> {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter((t) => now - t < 60_000);
    if (requestTimestamps.length >= maxPerMinute) {
      const oldest = requestTimestamps[0];
      const waitMs = 60_000 - (now - oldest) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      requestTimestamps = requestTimestamps.filter((t) => Date.now() - t < 60_000);
    }
    requestTimestamps.push(Date.now());
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    retries = 3
  ): Promise<unknown> {
    await throttle();

    const url = `${BASE_URL}${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: options.token,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    const response = await fetchFn(url, opts);

    if (response.status === 429 && retries > 0) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") ?? "60",
        10
      );
      options.logger.warn("ClickUp 429 — retrying", {
        retryAfter,
        retriesLeft: retries - 1,
      });
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfter * 1000)
      );
      return request(method, path, body, retries - 1);
    }

    if (response.status >= 500 && retries > 0) {
      options.logger.warn("ClickUp 5xx — retrying", {
        status: response.status,
        retriesLeft: retries - 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return request(method, path, body, retries - 1);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ClickUp API ${method} ${path} failed: ${response.status} ${text}`
      );
    }

    return response.json();
  }

  return {
    async getTasks(listId, opts) {
      const params = new URLSearchParams();
      params.set("subtasks", "false");
      params.set("page", "0");
      if (opts.statuses) {
        for (const s of opts.statuses) {
          params.append("statuses[]", s);
        }
      }
      if (opts.includeClosed) {
        params.set("include_closed", "true");
      }
      if (opts.customFields) {
        params.set("custom_fields", JSON.stringify(opts.customFields));
      }
      const data = (await request(
        "GET",
        `/list/${listId}/task?${params.toString()}`
      )) as { tasks: ClickUpTask[] };
      return data.tasks;
    },

    async createTask(listId, task) {
      return (await request("POST", `/list/${listId}/task`, task)) as ClickUpTask;
    },

    async updateTask(taskId, update) {
      return (await request("PUT", `/task/${taskId}`, update)) as ClickUpTask;
    },

    async addComment(taskId, text) {
      await request("POST", `/task/${taskId}/comment`, {
        comment_text: text,
      });
    },

    async addTag(taskId, tag) {
      await request("POST", `/task/${taskId}/tag/${encodeURIComponent(tag)}`);
    },

    async getFields(listId) {
      const data = (await request("GET", `/list/${listId}/field`)) as {
        fields: Array<{
          id: string;
          name: string;
          type: string;
          type_config?: {
            options?: Array<{ name: string; orderindex: number }>;
          };
        }>;
      };
      return data.fields;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/clients/clickup.test.ts`

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/clickup.ts pipeline/tests/clients/clickup.test.ts
git commit -m "feat: add ClickUp API client with rate limiting and retry"
```

---

### Task 7: Hunter.io API Client

**Files:**
- Create: `pipeline/src/clients/hunter.ts`
- Test: `pipeline/tests/clients/hunter.test.ts`

**Implementation note:** Hunter.io's "Discover" feature (finding companies by industry/location) is accessed via the Domain Search endpoint or a separate Companies endpoint. The exact endpoint must be verified during live integration. This client implements the `domain-search` endpoint as documented in the API contracts spec, with the understanding that the query parameter mapping may need adjustment.

- [ ] **Step 1: Write Hunter.io client tests**

Create `pipeline/tests/clients/hunter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHunterClient, type HunterClient } from "../../src/clients/hunter.js";
import { createLogger } from "../../src/logger.js";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("HunterClient", () => {
  const logger = createLogger("test");
  vi.spyOn(console, "log").mockImplementation(() => {});

  describe("searchDomain", () => {
    it("queries domain-search with company parameter", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: {
          domain: "abcplumbing.ca",
          organization: "ABC Plumbing",
          emails: [
            {
              value: "mike@abcplumbing.ca",
              type: "personal",
              confidence: 91,
              first_name: "Mike",
              last_name: "Thompson",
              position: "Owner",
              linkedin: "https://linkedin.com/in/mike",
              phone_number: null,
              sources: [{ uri: "https://abcplumbing.ca/about", domain: "abcplumbing.ca" }],
            },
          ],
        },
        meta: { results: 1, limit: 10, offset: 0 },
      });

      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const result = await client.searchDomain("plumbing Surrey BC");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("api.hunter.io/v2/domain-search");
      expect(url).toContain("api_key=test_key");
      expect(result.data.emails).toHaveLength(1);
      expect(result.data.emails[0].value).toBe("mike@abcplumbing.ca");
    });

    it("passes limit parameter", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: { domain: "", organization: "", emails: [] },
        meta: { results: 0, limit: 25, offset: 0 },
      });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await client.searchDomain("test", 25);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("limit=25");
    });
  });

  describe("getAccountQuota", () => {
    it("returns quota usage", async () => {
      const mockFetch = mockFetchResponse(200, {
        data: {
          requests: { used: 150, available: 350 },
        },
      });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      const quota = await client.getAccountQuota();

      expect(quota.used).toBe(150);
      expect(quota.available).toBe(350);
    });
  });

  describe("error handling", () => {
    it("throws on 401 (invalid API key)", async () => {
      const mockFetch = mockFetchResponse(401, { errors: [{ details: "Invalid API key" }] });
      const client = createHunterClient({
        apiKey: "bad_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.searchDomain("test")).rejects.toThrow("401");
    });

    it("throws on 429 (rate limit)", async () => {
      const mockFetch = mockFetchResponse(429, { errors: [{ details: "Rate limit" }] });
      const client = createHunterClient({
        apiKey: "test_key",
        fetchFn: mockFetch,
        logger,
      });

      await expect(client.searchDomain("test")).rejects.toThrow("429");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/clients/hunter.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Hunter.io client**

Create `pipeline/src/clients/hunter.ts`:

```typescript
import type { Logger } from "../logger.js";

const BASE_URL = "https://api.hunter.io/v2";

export interface HunterDomainSearchResponse {
  data: {
    domain: string;
    organization: string;
    emails: Array<{
      value: string;
      type: "personal" | "generic";
      confidence: number;
      first_name: string | null;
      last_name: string | null;
      position: string | null;
      linkedin: string | null;
      phone_number: string | null;
      sources: Array<{ uri: string; domain: string }>;
    }>;
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
  };
}

export interface HunterAccountQuota {
  used: number;
  available: number;
}

export interface HunterClient {
  searchDomain(
    query: string,
    limit?: number
  ): Promise<HunterDomainSearchResponse>;
  getAccountQuota(): Promise<HunterAccountQuota>;
}

interface HunterClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export function createHunterClient(options: HunterClientOptions): HunterClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function request(path: string): Promise<unknown> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}api_key=${options.apiKey}`;

    const response = await fetchFn(url);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }

    return response.json();
  }

  return {
    async searchDomain(query, limit = 10) {
      const params = new URLSearchParams({
        company: query,
        type: "personal",
        limit: String(limit),
      });
      return (await request(
        `/domain-search?${params.toString()}`
      )) as HunterDomainSearchResponse;
    },

    async getAccountQuota() {
      const data = (await request("/account")) as {
        data: { requests: { used: number; available: number } };
      };
      return data.data.requests;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/clients/hunter.test.ts`

Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/clients/hunter.ts pipeline/tests/clients/hunter.test.ts
git commit -m "feat: add Hunter.io API client for domain search and quota"
```

---

### Task 8: Lead Scoring

**Files:**
- Create: `pipeline/src/scoring.ts`
- Test: `pipeline/tests/scoring.test.ts`

Implements the scoring rubric from the API contracts spec: base score 3, +1/-1 modifiers, clamped to 1-5.

- [ ] **Step 1: Write scoring tests**

Create `pipeline/tests/scoring.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreLead } from "../src/scoring.js";

describe("scoreLead", () => {
  it("gives base score 3 for a minimal lead", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(3);
  });

  it("scores 5 for ideal lead: high confidence, Owner title, 11-50 headcount, has domain", () => {
    const result = scoreLead({
      emailConfidence: 92,
      contactTitle: "Owner",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(5);
    expect(result.rationale).toContain("confidence 92%");
    expect(result.rationale).toContain("Owner");
  });

  it("+1 for confidence >= 90", () => {
    const result = scoreLead({
      emailConfidence: 95,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(4);
  });

  it("+1 for decision-maker title (Owner, President, CEO, Principal, Director)", () => {
    for (const title of ["Owner", "President", "CEO", "Principal", "Director"]) {
      const result = scoreLead({
        emailConfidence: 70,
        contactTitle: title,
        headcount: null,
        hasDomain: true,
      });
      expect(result.score).toBeGreaterThanOrEqual(4);
    }
  });

  it("+1 for headcount >= 11", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(4);
  });

  it("-1 for confidence < 50", () => {
    const result = scoreLead({
      emailConfidence: 45,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(2);
  });

  it("-1 for no title", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    // base 3, no title penalty already baked in (null title = no +1, but also no -1 unless truly empty)
    // Actually: -1 if "No decision-maker title found (generic or empty)"
    // null title means no title found → -1
    expect(result.score).toBe(2);
  });

  it("-1 for headcount unknown or 1-10", () => {
    const r1 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      headcount: "1-10",
      hasDomain: true,
    });
    expect(r1.score).toBe(2);

    const r2 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      headcount: null,
      hasDomain: true,
    });
    expect(r2.score).toBe(2);
  });

  it("clamps to minimum 1", () => {
    const result = scoreLead({
      emailConfidence: 30,
      contactTitle: null,
      headcount: "1-10",
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it("clamps to maximum 5", () => {
    const result = scoreLead({
      emailConfidence: 99,
      contactTitle: "CEO",
      headcount: "51-200",
      hasDomain: true,
    });
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("includes rationale string", () => {
    const result = scoreLead({
      emailConfidence: 91,
      contactTitle: "Owner",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.rationale).toMatch(/Auto-scored:/);
    expect(result.rationale).toContain("-> 5");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/scoring.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoring**

Create `pipeline/src/scoring.ts`:

```typescript
import type { LeadScoreResult } from "./types.js";

const DECISION_MAKER_TITLES = [
  "owner",
  "president",
  "ceo",
  "principal",
  "director",
  "head of school",
];

interface ScoreInput {
  emailConfidence: number;
  contactTitle: string | null;
  headcount: string | null;
  hasDomain: boolean;
}

function headcountAtLeast11(headcount: string | null): boolean {
  if (!headcount) return false;
  const match = headcount.match(/^(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) >= 11;
}

function isDecisionMaker(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DECISION_MAKER_TITLES.some((t) => lower.includes(t));
}

function hasNoTitle(title: string | null): boolean {
  return !title || title.trim() === "";
}

function isSmallOrUnknown(headcount: string | null): boolean {
  if (!headcount) return true;
  const match = headcount.match(/^(\d+)/);
  if (!match) return true;
  return parseInt(match[1], 10) <= 10;
}

export function scoreLead(input: ScoreInput): LeadScoreResult {
  let score = 3;
  const reasons: string[] = [];

  if (input.emailConfidence >= 90) {
    score += 1;
    reasons.push(`confidence ${input.emailConfidence}%`);
  }

  if (isDecisionMaker(input.contactTitle)) {
    score += 1;
    reasons.push(`${input.contactTitle} title`);
  }

  if (headcountAtLeast11(input.headcount)) {
    score += 1;
    reasons.push(`${input.headcount} headcount`);
  }

  if (input.hasDomain) {
    reasons.push("has domain");
  }

  if (input.emailConfidence < 50) {
    score -= 1;
    reasons.push(`low confidence ${input.emailConfidence}%`);
  }

  if (hasNoTitle(input.contactTitle)) {
    score -= 1;
    reasons.push("no title");
  }

  if (isSmallOrUnknown(input.headcount)) {
    score -= 1;
    reasons.push(input.headcount ? `${input.headcount} headcount` : "unknown headcount");
  }

  score = Math.max(1, Math.min(5, score));

  return {
    score,
    rationale: `Auto-scored: ${reasons.join(", ")} -> ${score}`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/scoring.test.ts`

Expected: PASS — all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/scoring.ts pipeline/tests/scoring.test.ts
git commit -m "feat: add lead scoring rubric (1-5 scale)"
```

---

### Task 9: Category & Geography Mapping

**Files:**
- Create: `pipeline/src/mapping.ts`
- Test: `pipeline/tests/mapping.test.ts`

Maps ClickUp dropdown categories to Hunter.io search terms, and cities to geographic phases.

- [ ] **Step 1: Write mapping tests**

Create `pipeline/tests/mapping.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { categoryToSearchQuery, cityToPhase } from "../src/mapping.js";

describe("categoryToSearchQuery", () => {
  it("maps Trades & Contractors to plumbing/electrical/HVAC terms", () => {
    const query = categoryToSearchQuery("Trades & Contractors");
    expect(query).toContain("plumbing");
  });

  it("maps Elementary & Secondary to education terms", () => {
    const query = categoryToSearchQuery("Elementary & Secondary");
    expect(query).toContain("school");
  });

  it("maps Youth Sports Leagues to sports terms", () => {
    const query = categoryToSearchQuery("Youth Sports Leagues");
    expect(query).toContain("sports");
  });

  it("maps every defined category without throwing", () => {
    const categories = [
      "Trades & Contractors",
      "Restaurants & Hospitality",
      "Fitness & Wellness",
      "Real Estate & Property Mgmt",
      "Auto & Trades Shops",
      "Elementary & Secondary",
      "Independent & Private Schools",
      "Daycares & Preschools",
      "Post-Secondary Clubs",
      "Youth Sports Leagues",
      "Adult Rec Leagues",
      "Dance & Performance",
      "Community Sport Orgs",
    ];
    for (const cat of categories) {
      expect(() => categoryToSearchQuery(cat as any)).not.toThrow();
      expect(categoryToSearchQuery(cat as any).length).toBeGreaterThan(0);
    }
  });

  it("returns the input for Other", () => {
    const query = categoryToSearchQuery("Other");
    expect(query).toBe("Other");
  });
});

describe("cityToPhase", () => {
  it("maps Surrey to Phase 1", () => {
    expect(cityToPhase("Surrey")).toBe("Phase 1 - Fraser Valley Core");
  });

  it("maps Burnaby to Phase 2", () => {
    expect(cityToPhase("Burnaby")).toBe("Phase 2 - Tri-Cities & Burnaby");
  });

  it("maps Vancouver to Phase 3", () => {
    expect(cityToPhase("Vancouver")).toBe("Phase 3 - Metro Vancouver");
  });

  it("maps Other to Future", () => {
    expect(cityToPhase("Other")).toBe("Future - Rest of BC+");
  });

  it("maps all Phase 1 cities correctly", () => {
    for (const city of ["Surrey", "Langley", "Abbotsford", "Chilliwack", "Mission", "Maple Ridge"]) {
      expect(cityToPhase(city as any)).toBe("Phase 1 - Fraser Valley Core");
    }
  });

  it("maps all Phase 2 cities correctly", () => {
    for (const city of ["Burnaby", "New Westminster", "Coquitlam", "Port Coquitlam", "Pitt Meadows"]) {
      expect(cityToPhase(city as any)).toBe("Phase 2 - Tri-Cities & Burnaby");
    }
  });

  it("maps all Phase 3 cities correctly", () => {
    for (const city of ["Richmond", "Delta", "North Vancouver", "Vancouver"]) {
      expect(cityToPhase(city as any)).toBe("Phase 3 - Metro Vancouver");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/mapping.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement mapping**

Create `pipeline/src/mapping.ts`:

```typescript
import type { Category, City, GeographicPhase } from "./types.js";

const CATEGORY_SEARCH_MAP: Record<string, string> = {
  "Trades & Contractors":
    "plumbing electrical HVAC construction contractor",
  "Restaurants & Hospitality":
    "restaurant food beverage hospitality catering",
  "Fitness & Wellness": "fitness gym wellness yoga pilates recreation",
  "Real Estate & Property Mgmt":
    "real estate property management brokerage",
  "Auto & Trades Shops": "automotive auto repair mechanic body shop",
  "Elementary & Secondary":
    "school elementary secondary high school education",
  "Independent & Private Schools": "private school independent academy",
  "Daycares & Preschools": "daycare preschool childcare early learning",
  "Post-Secondary Clubs":
    "university college student club association",
  "Youth Sports Leagues":
    "youth sports league minor hockey soccer baseball",
  "Adult Rec Leagues": "adult recreation league sports beer league",
  "Dance & Performance":
    "dance studio martial arts performing arts gymnastics",
  "Community Sport Orgs":
    "community sport organization recreation association",
};

export function categoryToSearchQuery(category: Category): string {
  return CATEGORY_SEARCH_MAP[category] ?? category;
}

const PHASE_1_CITIES = new Set([
  "Surrey",
  "Langley",
  "Abbotsford",
  "Chilliwack",
  "Mission",
  "Maple Ridge",
]);

const PHASE_2_CITIES = new Set([
  "Burnaby",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Pitt Meadows",
]);

const PHASE_3_CITIES = new Set([
  "Richmond",
  "Delta",
  "North Vancouver",
  "Vancouver",
]);

export function cityToPhase(city: City): GeographicPhase {
  if (PHASE_1_CITIES.has(city)) return "Phase 1 - Fraser Valley Core";
  if (PHASE_2_CITIES.has(city)) return "Phase 2 - Tri-Cities & Burnaby";
  if (PHASE_3_CITIES.has(city)) return "Phase 3 - Metro Vancouver";
  return "Future - Rest of BC+";
}

export function buildSearchQuery(
  category: Category,
  city: City
): string {
  const terms = categoryToSearchQuery(category);
  return `${terms} ${city} BC Canada`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/mapping.test.ts`

Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/mapping.ts pipeline/tests/mapping.test.ts
git commit -m "feat: add category-to-search and city-to-phase mapping"
```

---

### Task 10: Test Helpers & Fixtures

**Files:**
- Create: `pipeline/tests/helpers.ts`

Shared factories for creating mock data used across Discovery Agent tests.

- [ ] **Step 1: Create test helpers**

Create `pipeline/tests/helpers.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/tests/helpers.ts
git commit -m "feat: add test helpers and mock data factories"
```

---

### Task 11: Discovery Agent

**Files:**
- Create: `pipeline/src/index.ts`
- Test: `pipeline/tests/discovery.test.ts`

This is the core deliverable. The Discovery Agent Cloud Function implements all 9 steps from the API contracts spec: reset stale requests → query Prospecting Requests → lock request → query Hunter.io → select best contact → dedup → score → create ClickUp task → update request.

- [ ] **Step 1: Write Discovery Agent tests**

Create `pipeline/tests/discovery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickUpClient } from "../src/clients/clickup.js";
import type { HunterClient, HunterDomainSearchResponse } from "../src/clients/hunter.js";
import type { Alerter } from "../src/alerting.js";
import { createLogger } from "../src/logger.js";
import { runDiscovery, selectBestContact, extractCaslSourceUrl } from "../src/index.js";
import { makeProspectingRequestTask, makeHunterEmail, makeHunterDomainSearchResponse } from "./helpers.js";
import type { Config } from "../src/config.js";

vi.spyOn(console, "log").mockImplementation(() => {});

function makeConfig(): Config {
  return {
    clickupApiToken: "pk_test",
    hunterApiKey: "hunter_test",
    clickupListId: "list_prospects",
    clickupProspectingListId: "list_requests",
    clickupRateLimit: 90,
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
  };
}

function makeMockClickUp(): ClickUpClient {
  return {
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({ id: "new_task", name: "Test", status: { status: "Enriched" } }),
    updateTask: vi.fn().mockResolvedValue({}),
    addComment: vi.fn().mockResolvedValue(undefined),
    addTag: vi.fn().mockResolvedValue(undefined),
    getFields: vi.fn().mockResolvedValue([
      { id: "f-segment", name: "Segment", type: "drop_down", type_config: { options: [{ name: "Business", orderindex: 0 }, { name: "School", orderindex: 1 }, { name: "Team", orderindex: 2 }] } },
      { id: "f-category", name: "Category", type: "drop_down", type_config: { options: [{ name: "Trades & Contractors", orderindex: 0 }] } },
      { id: "f-company-city", name: "Company City", type: "drop_down", type_config: { options: [{ name: "Surrey", orderindex: 0 }, { name: "Langley", orderindex: 1 }] } },
      { id: "f-geo-phase", name: "Geographic Phase", type: "drop_down", type_config: { options: [{ name: "Phase 1 - Fraser Valley Core", orderindex: 0 }] } },
    ]),
  };
}

function makeMockHunter(): HunterClient {
  return {
    searchDomain: vi.fn().mockResolvedValue(
      makeHunterDomainSearchResponse("abcplumbing.ca", "ABC Plumbing", [
        makeHunterEmail(),
      ])
    ),
    getAccountQuota: vi.fn().mockResolvedValue({ used: 50, available: 450 }),
  };
}

function makeMockAlerter(): Alerter {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

describe("selectBestContact", () => {
  it("prefers Owner over Manager", () => {
    const contacts = [
      makeHunterEmail({ value: "mgr@test.com", position: "Manager", confidence: 95 }),
      makeHunterEmail({ value: "owner@test.com", position: "Owner", confidence: 80 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("owner@test.com");
  });

  it("excludes generic emails", () => {
    const contacts = [
      makeHunterEmail({ value: "info@test.com", type: "generic", position: "Owner", confidence: 99 }),
      makeHunterEmail({ value: "jane@test.com", type: "personal", position: "Manager", confidence: 70 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("jane@test.com");
  });

  it("uses confidence as tiebreaker within same title priority", () => {
    const contacts = [
      makeHunterEmail({ value: "a@test.com", position: "Manager", confidence: 80 }),
      makeHunterEmail({ value: "b@test.com", position: "Manager", confidence: 95 }),
    ];
    const best = selectBestContact(contacts);
    expect(best?.value).toBe("b@test.com");
  });

  it("returns null when no personal emails with confidence >= 50", () => {
    const contacts = [
      makeHunterEmail({ value: "info@test.com", type: "generic", confidence: 99 }),
      makeHunterEmail({ value: "maybe@test.com", type: "personal", confidence: 30 }),
    ];
    const best = selectBestContact(contacts);
    expect(best).toBeNull();
  });
});

describe("extractCaslSourceUrl", () => {
  it("returns first source URL from the prospect's own domain", () => {
    const contact = makeHunterEmail({
      sources: [
        { uri: "https://directory.example.com/abc", domain: "directory.example.com" },
        { uri: "https://abcplumbing.ca/about", domain: "abcplumbing.ca" },
      ],
    });
    expect(extractCaslSourceUrl(contact, "abcplumbing.ca")).toBe(
      "https://abcplumbing.ca/about"
    );
  });

  it("returns empty string when no matching domain source", () => {
    const contact = makeHunterEmail({
      sources: [{ uri: "https://other.com/page", domain: "other.com" }],
    });
    expect(extractCaslSourceUrl(contact, "abcplumbing.ca")).toBe("");
  });
});

describe("runDiscovery", () => {
  it("processes a Prospecting Request end-to-end", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // First getTasks call: stale check (Running status) — none
    // Second getTasks call: Prospecting Requests (Requested status) — one request
    // Third getTasks call (dedup check) — no existing lead
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset: no Running requests
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one Requested request
      .mockResolvedValueOnce([]); // dedup: no existing lead for abcplumbing.ca

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requestsFound).toBe(1);
    expect(result.results.completed).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(1);

    // Verify request was locked to Running
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", { status: "Running" });
    // Verify lead was created
    expect(clickup.createTask).toHaveBeenCalledOnce();
    // Verify request was set to Complete
    expect(clickup.updateTask).toHaveBeenCalledWith("req_001", expect.objectContaining({ status: "Complete" }));
    // Verify completion comment was added
    expect(clickup.addComment).toHaveBeenCalled();
  });

  it("skips duplicate leads (same domain already in ClickUp)", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
      .mockResolvedValueOnce([{ id: "existing_task" }]); // dedup: existing lead found

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].duplicatesSkipped).toBe(1);
    expect(result.requests[0].leadsCreated).toBe(0);
    expect(clickup.createTask).not.toHaveBeenCalled();
  });

  it("sets status to Parked for score 1-2 leads", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    // Hunter returns a low-quality lead
    (hunter.searchDomain as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeHunterDomainSearchResponse("badlead.ca", "Bad Lead", [
        makeHunterEmail({
          value: "maybe@badlead.ca",
          confidence: 40,
          position: null,
          sources: [],
        }),
      ])
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requests[0].leadsParked).toBe(1);
    const createCall = (clickup.createTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(createCall[1].status).toBe("Parked");
  });

  it("exits cleanly when no Prospecting Requests exist", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([]); // no requests

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.requestsFound).toBe(0);
    expect(hunter.searchDomain).not.toHaveBeenCalled();
  });

  it("resets stale Running requests before processing", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const thirtyMinAgo = String(Date.now() - 31 * 60 * 1000);
    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "stale_req", status: "Running", dateUpdated: thirtyMinAgo }),
      ])
      .mockResolvedValueOnce([]) // no new requests after reset
      ;

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.updateTask).toHaveBeenCalledWith("stale_req", { status: "Requested" });
    expect(result.results.staleReset).toBe(1);
  });

  it("skips ClickUp task creation in DRY_RUN mode", async () => {
    const config = { ...makeConfig(), dryRun: true };
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})])
      .mockResolvedValueOnce([]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(clickup.createTask).not.toHaveBeenCalled();
    expect(result.requests[0].leadsCreated).toBe(1);
  });

  it("sets request to Failed and alerts on Hunter.io 401", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.searchDomain as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Hunter.io /domain-search failed: 401 Invalid API key")
    );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProspectingRequestTask({})]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(alerter.send).toHaveBeenCalled();
    expect(result.results.failed).toBe(1);
  });

  it("isolates per-request errors — one bad request doesn't kill others", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
    searchMock
      .mockRejectedValueOnce(new Error("Hunter.io error"))
      .mockResolvedValueOnce(
        makeHunterDomainSearchResponse("good.ca", "Good Co", [makeHunterEmail({ value: "a@good.ca" })])
      );

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([]) // stale reset
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req_bad", category: "Restaurants & Hospitality" }),
        makeProspectingRequestTask({ id: "req_good", category: "Fitness & Wellness" }),
      ])
      .mockResolvedValueOnce([]); // dedup for good request

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(result.results.failed).toBe(1);
    expect(result.results.completed).toBe(1);
  });

  it("checks Hunter.io quota before processing and skips if insufficient", async () => {
    const config = makeConfig();
    const clickup = makeMockClickUp();
    const hunter = makeMockHunter();
    const alerter = makeMockAlerter();
    const logger = createLogger("test");

    (hunter.getAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      used: 498,
      available: 2,
    });

    const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
    getTasksMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeProspectingRequestTask({ id: "req1", maxResults: 25 }),
      ]);

    const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

    expect(alerter.send).toHaveBeenCalled();
    expect(hunter.searchDomain).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && npx vitest run tests/discovery.test.ts`

Expected: FAIL — module imports fail.

- [ ] **Step 3: Implement the Discovery Agent**

Create `pipeline/src/index.ts`:

```typescript
import * as ff from "@google-cloud/functions-framework";
import type { Request, Response } from "@google-cloud/functions-framework";
import type { ClickUpClient } from "./clients/clickup.js";
import type { HunterClient } from "./clients/hunter.js";
import type { Alerter } from "./alerting.js";
import type { Logger } from "./logger.js";
import type { Config } from "./config.js";
import type {
  ClickUpTask,
  HunterContact,
  DiscoveryRunResult,
  RequestResult,
  Segment,
  Category,
  City,
} from "./types.js";
import { scoreLead } from "./scoring.js";
import { buildSearchQuery, cityToPhase } from "./mapping.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createAlerter } from "./alerting.js";
import { createClickUpClient } from "./clients/clickup.js";
import { createHunterClient } from "./clients/hunter.js";

// --- Contact Selection ---

const TITLE_PRIORITY: string[][] = [
  ["owner", "president", "ceo"],
  ["principal", "head of school", "director"],
  ["manager", "coordinator"],
];

function titlePriorityRank(position: string | null): number {
  if (!position) return TITLE_PRIORITY.length + 1;
  const lower = position.toLowerCase();
  for (let i = 0; i < TITLE_PRIORITY.length; i++) {
    if (TITLE_PRIORITY[i].some((t) => lower.includes(t))) return i;
  }
  return TITLE_PRIORITY.length;
}

export function selectBestContact(
  contacts: HunterContact[]
): HunterContact | null {
  const eligible = contacts.filter(
    (c) => c.type === "personal" && c.confidence >= 50
  );
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const rankDiff = titlePriorityRank(a.position) - titlePriorityRank(b.position);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });

  return eligible[0];
}

export function extractCaslSourceUrl(
  contact: HunterContact,
  prospectDomain: string
): string {
  const match = contact.sources.find((s) => s.domain === prospectDomain);
  return match?.uri ?? "";
}

// --- Dropdown Value Resolution ---

function resolveDropdownValue(
  fieldOptions: Array<{ name: string; orderindex: number }> | undefined,
  label: string
): number | null {
  if (!fieldOptions) return null;
  const match = fieldOptions.find(
    (o) => o.name.toLowerCase() === label.toLowerCase()
  );
  return match?.orderindex ?? null;
}

// --- Request Field Extraction ---

function extractRequestFields(task: ClickUpTask): {
  segment: Segment;
  category: Category;
  targetCity: City;
  maxResults: number;
} {
  let segment: Segment = "Business";
  let category: Category = "Other";
  let targetCity: City = "Surrey";
  let maxResults = 25;

  for (const field of task.custom_fields) {
    if (field.name === "Segment" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) segment = opt.name as Segment;
    }
    if (field.name === "Category" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) category = opt.name as Category;
    }
    if (field.name === "Target City" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) targetCity = opt.name as City;
    }
    if (field.name === "Max Results" && typeof field.value === "number") {
      maxResults = field.value;
    }
  }

  return { segment, category, targetCity, maxResults };
}

// --- Discovery Agent Core ---

export interface DiscoveryDeps {
  config: Config;
  clickup: ClickUpClient;
  hunter: HunterClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runDiscovery(
  deps: DiscoveryDeps
): Promise<DiscoveryRunResult> {
  const { config, clickup, hunter, alerter, logger } = deps;
  const now = new Date();
  const runId = `discover-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Discovery agent starting");

  const result: DiscoveryRunResult = {
    runId,
    timestamp: now.toISOString(),
    requestsFound: 0,
    requestsProcessed: 0,
    results: { completed: 0, failed: 0, staleReset: 0 },
    requests: [],
  };

  // Pre-step: Reset stale Running requests
  const runningTasks = await clickup.getTasks(config.clickupProspectingListId, {
    statuses: ["Running"],
  });
  for (const task of runningTasks) {
    const updatedAt = parseInt(task.date_updated, 10);
    const minutesStale = (Date.now() - updatedAt) / 60_000;
    if (minutesStale > 30) {
      await clickup.updateTask(task.id, { status: "Requested" });
      logger.warn("RESET: stale Running request", {
        taskId: task.id,
        minutesStale: Math.round(minutesStale),
      });
      result.results.staleReset += 1;
    }
  }

  // Step 1: Get Prospecting Requests
  const requests = await clickup.getTasks(config.clickupProspectingListId, {
    statuses: ["Requested"],
  });
  result.requestsFound = requests.length;

  if (requests.length === 0) {
    logger.info("No pending prospecting requests. Exiting.");
    return result;
  }

  // Fetch dropdown options for the Prospects list (needed for index mapping)
  const prospectFields = await clickup.getFields(config.clickupListId);
  const dropdownOptions: Record<string, Array<{ name: string; orderindex: number }>> = {};
  for (const field of prospectFields) {
    if (field.type_config?.options) {
      dropdownOptions[field.id] = field.type_config.options;
    }
  }

  // Check Hunter.io quota
  const quota = await hunter.getAccountQuota();
  logger.info("Hunter.io quota", { used: quota.used, available: quota.available });

  // Process each request
  for (const requestTask of requests) {
    const { segment, category, targetCity, maxResults } =
      extractRequestFields(requestTask);
    const requestResult: RequestResult = {
      requestTaskId: requestTask.id,
      segment,
      category,
      targetCity,
      resultsFound: 0,
      leadsCreated: 0,
      leadsParked: 0,
      duplicatesSkipped: 0,
      noContactSkipped: 0,
      status: "completed",
    };

    try {
      // Quota check per request
      if (quota.available < maxResults) {
        const msg = `Hunter.io quota insufficient: ${quota.available} available, ${maxResults} needed`;
        logger.warn(msg);
        await alerter.send("Hunter.io monthly quota low", msg);
        requestResult.status = "failed";
        requestResult.error = msg;
        result.results.failed += 1;
        result.requests.push(requestResult);
        continue;
      }

      // Step 3: Lock request
      await clickup.updateTask(requestTask.id, { status: "Running" });

      // Step 4: Query Hunter.io
      const searchQuery = buildSearchQuery(category, targetCity);
      logger.info("Querying Hunter.io", { searchQuery, maxResults });
      const hunterResponse = await hunter.searchDomain(searchQuery, maxResults);
      const companies = hunterResponse.data;
      requestResult.resultsFound = hunterResponse.meta.results;

      // Process the single domain result
      if (!companies.emails || companies.emails.length === 0) {
        logger.info("No contacts found", { domain: companies.domain });
      } else {
        // Step 5: Select best contact
        const bestContact = selectBestContact(companies.emails);
        if (!bestContact) {
          logger.info("NO_CONTACT: No suitable decision-maker", {
            domain: companies.domain,
          });
          requestResult.noContactSkipped += 1;
        } else {
          // Step 6: Dedup check
          const existing = await clickup.getTasks(config.clickupListId, {
            customFields: [
              {
                field_id: config.fields.companyDomain,
                operator: "=",
                value: `https://${companies.domain}`,
              },
            ],
            includeClosed: true,
          });

          if (existing.length > 0) {
            logger.info("SKIP: duplicate", {
              domain: companies.domain,
              existingTaskId: existing[0].id,
            });
            requestResult.duplicatesSkipped += 1;
          } else {
            // Step 7: Score
            const scoreResult = scoreLead({
              emailConfidence: bestContact.confidence,
              contactTitle: bestContact.position,
              headcount: null, // Hunter domain-search doesn't return headcount directly
              hasDomain: !!companies.domain,
            });

            const status = scoreResult.score >= 3 ? "Enriched" : "Parked";
            const contactName =
              bestContact.full_name ??
              [bestContact.first_name, bestContact.last_name]
                .filter(Boolean)
                .join(" ") ??
              bestContact.value;
            const taskName = `${companies.organization || companies.domain} — ${contactName}`;
            const caslSourceUrl = extractCaslSourceUrl(
              bestContact,
              companies.domain
            );
            const importBatch = `${now.toISOString().slice(0, 10)}-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${targetCity.toLowerCase()}`;

            // Step 8: Create ClickUp task
            if (!config.dryRun) {
              const segmentIndex = resolveDropdownValue(
                dropdownOptions[config.fields.segment],
                segment
              );
              const categoryIndex = resolveDropdownValue(
                dropdownOptions[config.fields.category],
                category
              );
              const cityIndex = resolveDropdownValue(
                dropdownOptions[config.fields.companyCity],
                targetCity
              );
              const phaseLabel = cityToPhase(targetCity);
              const phaseIndex = resolveDropdownValue(
                dropdownOptions[config.fields.geographicPhase],
                phaseLabel
              );

              await clickup.createTask(config.clickupListId, {
                name: taskName,
                status,
                custom_fields: [
                  { id: config.fields.companyName, value: companies.organization || companies.domain },
                  { id: config.fields.companyDomain, value: `https://${companies.domain}` },
                  { id: config.fields.companyIndustry, value: "" },
                  { id: config.fields.companyHeadcount, value: "" },
                  { id: config.fields.companyCity, value: cityIndex },
                  { id: config.fields.contactName, value: contactName },
                  { id: config.fields.contactTitle, value: bestContact.position ?? "" },
                  { id: config.fields.contactEmail, value: bestContact.value },
                  { id: config.fields.emailConfidence, value: bestContact.confidence },
                  { id: config.fields.contactLinkedin, value: bestContact.linkedin ?? "" },
                  { id: config.fields.contactPhone, value: bestContact.phone_number ?? "" },
                  { id: config.fields.segment, value: segmentIndex },
                  { id: config.fields.category, value: categoryIndex },
                  { id: config.fields.leadScore, value: scoreResult.score },
                  { id: config.fields.scoreRationale, value: scoreResult.rationale },
                  { id: config.fields.geographicPhase, value: phaseIndex },
                  { id: config.fields.caslSourceUrl, value: caslSourceUrl },
                  { id: config.fields.importBatch, value: importBatch },
                ],
              });
            }

            if (status === "Enriched") {
              requestResult.leadsCreated += 1;
            } else {
              requestResult.leadsParked += 1;
            }

            logger.info("Lead created", {
              taskName,
              score: scoreResult.score,
              status,
              dryRun: config.dryRun,
            });
          }
        }
      }

      // Step 9: Update Prospecting Request
      if (!config.dryRun) {
        await clickup.updateTask(requestTask.id, {
          status: "Complete",
          custom_fields: [
            { id: config.prospectingFields.resultsFound, value: requestResult.resultsFound },
            { id: config.prospectingFields.leadsCreated, value: requestResult.leadsCreated },
            { id: config.prospectingFields.leadsParked, value: requestResult.leadsParked },
            { id: config.prospectingFields.duplicatesSkipped, value: requestResult.duplicatesSkipped },
          ],
        });
        await clickup.addComment(
          requestTask.id,
          `Completed: ${requestResult.resultsFound} companies found, ${requestResult.leadsCreated} leads created (score 3+), ${requestResult.leadsParked} parked (score 1-2), ${requestResult.duplicatesSkipped} duplicates skipped`
        );
      }

      result.results.completed += 1;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Request processing failed", {
        requestTaskId: requestTask.id,
        error: errorMsg,
      });
      requestResult.status = "failed";
      requestResult.error = errorMsg;
      result.results.failed += 1;

      // Set request to Failed in ClickUp
      try {
        await clickup.updateTask(requestTask.id, { status: "Failed" });
        await clickup.addComment(requestTask.id, `Error: ${errorMsg}`);
      } catch {
        // Best effort — don't let status update failure mask the real error
      }

      await alerter.send(
        `Discovery agent error on request ${requestTask.id}`,
        errorMsg
      );
    }

    result.requests.push(requestResult);
    result.requestsProcessed += 1;
  }

  logger.info("Discovery agent complete", {
    requestsProcessed: result.requestsProcessed,
    completed: result.results.completed,
    failed: result.results.failed,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("discover", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("discovery-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const hunter = createHunterClient({
    apiKey: config.hunterApiKey,
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

    const result = await runDiscovery({
      config: effectiveConfig,
      clickup,
      hunter,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Discovery Agent", { error: errorMsg });
    await alerter.send("Unhandled error in discovery-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && npx vitest run tests/discovery.test.ts`

Expected: PASS — all 10 tests (4 unit + 6 integration).

- [ ] **Step 5: Run all tests**

Run: `cd pipeline && npx vitest run`

Expected: PASS — all tests across all files.

- [ ] **Step 6: Type check**

Run: `cd pipeline && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/index.ts pipeline/tests/discovery.test.ts
git commit -m "feat: add Discovery Agent Cloud Function with full processing flow"
```

---

### Task 12: Verify Full Test Suite

- [ ] **Step 1: Run all tests from the pipeline directory**

Run: `cd pipeline && npx vitest run`

Expected: All tests pass. Total should be ~30+ tests across 7 test files.

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

| Spec Requirement | Task |
|------------------|------|
| Project scaffolding with Node.js 20 + TypeScript | Task 1 |
| All shared types (Prospect, ProspectingRequest, statuses, etc.) | Task 2 |
| Environment variable loading + validation | Task 3 |
| Structured JSON logging for GCP Cloud Logging | Task 4 |
| Error alerting via webhook/email | Task 5 |
| ClickUp API client with rate limiting (90/min) + 429 retry + 5xx retry | Task 6 |
| Hunter.io API client (domain-search + quota check) | Task 7 |
| Lead scoring rubric (base 3, +1/-1 modifiers, clamp 1-5) | Task 8 |
| Category → search term mapping | Task 9 |
| City → geographic phase mapping | Task 9 |
| Discovery Agent pre-step: reset stale Running requests | Task 11 |
| Discovery Agent step 1: query Prospecting Requests | Task 11 |
| Discovery Agent step 3: lock request to Running | Task 11 |
| Discovery Agent step 4: query Hunter.io | Task 11 |
| Discovery Agent step 5: select best contact (title priority + confidence tiebreak) | Task 11 |
| Discovery Agent step 6: dedup check (domain-based, includes closed) | Task 11 |
| Discovery Agent step 7: auto-score with rubric | Task 11 |
| Discovery Agent step 8: create ClickUp task with dropdown index mapping | Task 11 |
| Discovery Agent step 9: update Prospecting Request with results | Task 11 |
| DRY_RUN mode (skip ClickUp writes, log what would be created) | Task 11 |
| Per-request error isolation | Task 11 |
| Hunter.io quota check before processing | Task 11 |
| CASL Source URL extraction from contact sources | Task 11 |
| Cloud Function HTTP entry point | Task 11 |

### 2. Placeholder Scan

No TBD, TODO, or "implement later" references. All code steps include complete code.

### 3. Type Consistency

- `ClickUpClient` interface methods match usage in Discovery Agent
- `HunterClient.searchDomain` return type matches consumption in Discovery Agent
- `Config` fields match what `runDiscovery` reads
- `LeadScoreResult` from `scoreLead()` matches what Discovery Agent destructures
- `selectBestContact` and `extractCaslSourceUrl` are exported for testing and used consistently

### 4. What This Plan Does NOT Cover (deferred to Plans 2-4)

- Firecrawl client (Plan 2 — Personalization Agent)
- Gemini client (Plan 2 — Personalization Agent)
- Instantly client (Plan 3 — Send Agent)
- Dormancy check function (Plan 3)
- ClickUp workspace configuration (Plan 4)
- Zapier zap setup (Plan 4)
- Cloud Scheduler deployment (Plan 4)
- Instantly campaign configuration (Plan 4)
- E2E integration testing (Plan 4)

### 5. Known Implementation Notes

**Hunter.io API endpoint:** The API contracts spec notes that the exact Discover endpoint needs verification. This plan uses `domain-search` with a `company` parameter. During implementation, verify against Hunter.io's current documentation whether this returns company listings by keyword or only searches within a specific domain. If the latter, the Discovery Agent may need to use a different Hunter.io endpoint or approach (e.g., the Leads API or Companies API). The client interface is designed to be easily updated.

**Headcount data:** The `domain-search` endpoint may not return company headcount. The scoring rubric handles this gracefully (null headcount = -1 penalty). If Hunter.io's Discover/Companies endpoint provides headcount, update the client response type and scoring input.
