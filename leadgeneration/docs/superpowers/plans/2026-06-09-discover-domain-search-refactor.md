# Discover → Domain Search Pipeline Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-step keyword-based Domain Search with a two-step pipeline: free Discover endpoint (find companies by ICP filters) → paid Domain Search (get contacts for qualified companies only), and redesign the prospecting request model to support volume-based campaigns.

**Architecture:** The Hunter client gains two new methods: `discover()` (POST to `/discover` with structured filters — free, returns up to 100 companies) and an enhanced `searchDomain()` that accepts `seniority` and `department` filters. The discovery agent loop changes from "1 request → 1 Hunter search → 1 lead" to "1 request → Discover N companies → Domain Search each → N leads". The `CATEGORY_SEARCH_MAP` keyword strings become structured Discover filter objects (headcount ranges, HQ location, industry, keywords). The prospecting request ClickUp task gains a "Target Volume" field replacing "Max Results", and the request result tracking scales to multi-lead batches. Scoring improves because headcount is now known from Discover, and seniority comes back from Domain Search — the manual `TITLE_PRIORITY` ranking is replaced by Hunter's `seniority=executive,senior` filter.

**Tech Stack:** TypeScript, Vitest, Hunter.io API v2 (Discover + Domain Search), ClickUp API, Google Cloud Functions

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/clients/hunter.ts` | Modify | Add `discover()` method, add seniority/department params to `searchDomain()`, add Discover response types, update quota to track searches specifically |
| `src/mapping.ts` | Modify | Replace `CATEGORY_SEARCH_MAP` keyword strings with structured `DiscoverFilters` objects per category, keep `cityToPhase()` |
| `src/types.ts` | Modify | Add `DiscoverCompany`, `DiscoverFilters` types; update `ProspectingRequest` to use `targetVolume` instead of `maxResults`; update `RequestResult` for batch metrics |
| `src/index.ts` | Modify | Rewrite discovery loop: Discover → dedup → Domain Search → score → create. Update `extractRequestFields`, `selectBestContact` removal, `DiscoveryDeps` |
| `src/scoring.ts` | Modify | Use real headcount string from Discover, seniority from Domain Search |
| `src/config.ts` | Modify | Add `hunterDefaultHeadcount` and `hunterDefaultSeniority` config options |
| `tests/clients/hunter.test.ts` | Modify | Add tests for `discover()`, updated `searchDomain()` with filters |
| `tests/mapping.test.ts` | Modify | Update for new `DiscoverFilters` structure |
| `tests/discovery.test.ts` | Modify | Rewrite for two-step pipeline flow |
| `tests/helpers.ts` | Modify | Add `makeDiscoverResponse`, update `makeProspectingRequestTask` for `targetVolume` |
| `tests/scoring.test.ts` | Modify | Add tests for seniority-based scoring adjustments |

---

### Task 1: Discover Response Types and Filters

**Files:**
- Modify: `pipeline/src/types.ts`

- [ ] **Step 1: Write the failing test**

```bash
# No test file for this step — types are compile-checked.
# We'll verify by importing in the next task's tests.
```

- [ ] **Step 2: Add Discover types to types.ts**

Add after the existing `HunterCompany` interface (line 104):

```typescript
export interface DiscoverCompany {
  domain: string;
  organization: string;
  emails_count: {
    personal: number;
    generic: number;
    total: number;
  };
}

export interface DiscoverFilters {
  headquarters_location?: {
    include?: Array<{ country?: string; city?: string }>;
  };
  industry?: {
    include?: string[];
  };
  headcount?: string[];
  company_type?: {
    exclude?: string[];
  };
  keywords?: {
    include?: string[];
    match?: "any" | "all";
  };
}

export const HEADCOUNT_RANGES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
] as const;
export type HeadcountRange = (typeof HEADCOUNT_RANGES)[number];
```

Update `ProspectingRequest` (line 106-112) — replace `maxResults` with `targetVolume`:

```typescript
export interface ProspectingRequest {
  taskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  targetVolume: number;
}
```

Update `RequestResult` (line 119-131) — replace `resultsFound` with `companiesDiscovered` and add `companiesSearched`:

```typescript
export interface RequestResult {
  requestTaskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  companiesDiscovered: number;
  companiesSearched: number;
  leadsCreated: number;
  leadsParked: number;
  duplicatesSkipped: number;
  noContactSkipped: number;
  status: "completed" | "failed";
  error?: string;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx tsc --noEmit`
Expected: No type errors from the new types (existing code will have errors until later tasks fix call sites)

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/types.ts
git commit -m "feat: add Discover API types and volume-based request model"
```

---

### Task 2: Hunter Client — Discover Method and Enhanced Domain Search

**Files:**
- Modify: `pipeline/src/clients/hunter.ts`
- Modify: `pipeline/tests/clients/hunter.test.ts`

- [ ] **Step 1: Write failing tests for discover()**

Add to `hunter.test.ts` inside the main `describe("HunterClient")` block:

```typescript
describe("discover", () => {
  it("posts structured filters to /discover", async () => {
    const mockFetch = mockFetchResponse(200, {
      data: [
        {
          domain: "abcplumbing.ca",
          organization: "ABC Plumbing",
          emails_count: { personal: 5, generic: 2, total: 7 },
        },
      ],
      meta: { results: 1, limit: 100, offset: 0, filters: {} },
    });
    const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

    const result = await client.discover({
      headcount: ["1-10", "11-50"],
      headquarters_location: { include: [{ country: "CA", city: "Surrey" }] },
      keywords: { include: ["plumbing", "HVAC"], match: "any" },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("api.hunter.io/v2/discover");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.headcount).toEqual(["1-10", "11-50"]);
    expect(body.headquarters_location.include[0].city).toBe("Surrey");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].domain).toBe("abcplumbing.ca");
  });

  it("throws HunterRateLimitError on 429", async () => {
    const mockFetch = mockFetchResponse(429, { errors: [{ details: "Rate limit" }] });
    const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

    await expect(
      client.discover({ headcount: ["1-10"] })
    ).rejects.toBeInstanceOf(HunterRateLimitError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/clients/hunter.test.ts`
Expected: FAIL — `client.discover is not a function`

- [ ] **Step 3: Write failing tests for enhanced searchDomain()**

Add to the existing `describe("searchDomain")` block:

```typescript
it("passes seniority and department filters", async () => {
  const mockFetch = mockFetchResponse(200, {
    data: { domain: "test.ca", organization: "Test", emails: [] },
    meta: { results: 0, limit: 10, offset: 0 },
  });
  const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

  await client.searchDomain("test.ca", {
    limit: 10,
    seniority: ["executive", "senior"],
    department: ["executive", "management"],
  });

  const [url] = mockFetch.mock.calls[0];
  expect(url).toContain("seniority=executive%2Csenior");
  expect(url).toContain("department=executive%2Cmanagement");
});

it("searches by domain instead of company keyword", async () => {
  const mockFetch = mockFetchResponse(200, {
    data: { domain: "abcplumbing.ca", organization: "ABC Plumbing", emails: [] },
    meta: { results: 0, limit: 10, offset: 0 },
  });
  const client = createHunterClient({ apiKey: "test_key", fetchFn: mockFetch, logger });

  await client.searchDomain("abcplumbing.ca", { limit: 10 });

  const [url] = mockFetch.mock.calls[0];
  expect(url).toContain("domain=abcplumbing.ca");
  expect(url).not.toContain("company=");
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/clients/hunter.test.ts`
Expected: FAIL — parameter assertions fail

- [ ] **Step 5: Implement discover() and update searchDomain()**

Replace the full `hunter.ts` content:

```typescript
import type { Logger } from "../logger.js";
import type { DiscoverCompany, DiscoverFilters } from "../types.js";

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
      seniority: string | null;
      department: string | null;
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

export interface HunterDiscoverResponse {
  data: DiscoverCompany[];
  meta: {
    results: number;
    limit: number;
    offset: number;
    filters: Record<string, unknown>;
  };
}

export interface DomainSearchOptions {
  limit?: number;
  seniority?: string[];
  department?: string[];
}

export interface HunterAccountQuota {
  searches: { used: number; available: number };
  verifications: { used: number; available: number };
}

export interface HunterClient {
  discover(filters: DiscoverFilters): Promise<HunterDiscoverResponse>;
  searchDomain(domain: string, options?: DomainSearchOptions): Promise<HunterDomainSearchResponse>;
  getAccountQuota(): Promise<HunterAccountQuota>;
}

interface HunterClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  logger: Logger;
}

export class HunterRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HunterRateLimitError";
  }
}

export function createHunterClient(options: HunterClientOptions): HunterClient {
  const fetchFn = options.fetchFn ?? fetch;

  async function get(path: string): Promise<unknown> {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${path}${separator}api_key=${options.apiKey}`;
    const response = await fetchFn(url);

    if (response.status === 429) {
      const text = await response.text();
      throw new HunterRateLimitError(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function post(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}?api_key=${options.apiKey}`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const text = await response.text();
      throw new HunterRateLimitError(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Hunter.io ${path} failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  return {
    async discover(filters) {
      return (await post("/discover", filters)) as HunterDiscoverResponse;
    },

    async searchDomain(domain, options = {}) {
      const params = new URLSearchParams({
        domain,
        type: "personal",
        limit: String(options.limit ?? 10),
      });
      if (options.seniority?.length) {
        params.set("seniority", options.seniority.join(","));
      }
      if (options.department?.length) {
        params.set("department", options.department.join(","));
      }
      return (await get(`/domain-search?${params.toString()}`)) as HunterDomainSearchResponse;
    },

    async getAccountQuota() {
      const data = (await get("/account")) as {
        data: {
          requests: {
            searches: { used: number; available: number };
            verifications: { used: number; available: number };
          };
        };
      };
      return data.data.requests;
    },
  };
}
```

Key changes from previous version:
- `searchDomain` now takes a **domain** string (not a keyword query) + an options object with optional `seniority` and `department` arrays
- New `discover()` method does a POST to `/discover` with structured filter body
- `getAccountQuota()` now returns separate `searches` and `verifications` pools
- Internal `request()` split into `get()` and `post()` helpers
- Domain Search response emails now include `seniority` and `department` fields

- [ ] **Step 6: Update existing tests for the new searchDomain signature**

The existing tests call `client.searchDomain("plumbing Surrey BC")` and `client.searchDomain("test", 25)`. Update these:

In "queries domain-search with company parameter" test — rename to "queries domain-search with domain parameter" and change:
```typescript
const result = await client.searchDomain("abcplumbing.ca");

// ...
expect(url).toContain("domain=abcplumbing.ca");
```

In "passes limit parameter" test, change:
```typescript
await client.searchDomain("test.ca", { limit: 25 });
```

In "returns quota usage" test, update mock response and assertions:
```typescript
const mockFetch = mockFetchResponse(200, {
  data: {
    requests: {
      searches: { used: 150, available: 350 },
      verifications: { used: 100, available: 20000 },
    },
  },
});
// ...
expect(quota.searches.used).toBe(150);
expect(quota.searches.available).toBe(350);
```

- [ ] **Step 7: Run all hunter tests**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/clients/hunter.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add pipeline/src/clients/hunter.ts pipeline/tests/clients/hunter.test.ts
git commit -m "feat: add Discover endpoint and seniority/department filters to Hunter client"
```

---

### Task 3: Mapping — Category-to-Discover-Filters

**Files:**
- Modify: `pipeline/src/mapping.ts`
- Modify: `pipeline/tests/mapping.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the existing `categoryToSearchQuery` tests with Discover filter tests. Keep `cityToPhase` and `buildSearchQuery` tests unchanged for now.

Add to `mapping.test.ts`:

```typescript
import { categoryToDiscoverFilters, cityToPhase } from "../src/mapping.js";
import type { City } from "../src/types.js";

describe("categoryToDiscoverFilters", () => {
  it("returns structured filters for Trades & Contractors", () => {
    const filters = categoryToDiscoverFilters("Trades & Contractors", "Surrey");
    expect(filters.keywords?.include).toEqual(
      expect.arrayContaining(["plumbing", "electrical", "HVAC", "construction", "contractor"])
    );
    expect(filters.keywords?.match).toBe("any");
    expect(filters.headquarters_location?.include).toEqual([{ country: "CA", city: "Surrey" }]);
    expect(filters.headcount).toBeUndefined(); // headcount set at call site, not baked in
  });

  it("returns structured filters for Elementary & Secondary", () => {
    const filters = categoryToDiscoverFilters("Elementary & Secondary", "Langley");
    expect(filters.keywords?.include).toEqual(
      expect.arrayContaining(["school", "elementary", "secondary"])
    );
    expect(filters.headquarters_location?.include).toEqual([{ country: "CA", city: "Langley" }]);
  });

  it("falls back to category name as keyword for unknown categories", () => {
    const filters = categoryToDiscoverFilters("Other" as any, "Vancouver");
    expect(filters.keywords?.include).toEqual(["Other"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/mapping.test.ts`
Expected: FAIL — `categoryToDiscoverFilters` is not exported

- [ ] **Step 3: Implement categoryToDiscoverFilters**

Update `mapping.ts`. Keep `cityToPhase` and `buildSearchQuery` (the latter is still used by the old code until the discovery loop is rewritten — we'll remove it in Task 6). Add:

```typescript
import type { Category, City, GeographicPhase, DiscoverFilters } from "./types.js";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Trades & Contractors": ["plumbing", "electrical", "HVAC", "construction", "contractor"],
  "Restaurants & Hospitality": ["restaurant", "food", "beverage", "hospitality", "catering"],
  "Fitness & Wellness": ["fitness", "gym", "wellness", "yoga", "pilates", "recreation"],
  "Real Estate & Property Mgmt": ["real estate", "property management", "brokerage"],
  "Auto & Trades Shops": ["automotive", "auto repair", "mechanic", "body shop"],
  "Elementary & Secondary": ["school", "elementary", "secondary", "high school", "education"],
  "Independent & Private Schools": ["private school", "independent", "academy"],
  "Daycares & Preschools": ["daycare", "preschool", "childcare", "early learning"],
  "Post-Secondary Clubs": ["university", "college", "student club", "association"],
  "Youth Sports Leagues": ["youth sports", "league", "minor hockey", "soccer", "baseball"],
  "Adult Rec Leagues": ["adult recreation", "league", "sports", "beer league"],
  "Dance & Performance": ["dance studio", "martial arts", "performing arts", "gymnastics"],
  "Community Sport Orgs": ["community sport", "organization", "recreation", "association"],
};

export function categoryToDiscoverFilters(
  category: Category,
  city: City
): DiscoverFilters {
  const keywords = CATEGORY_KEYWORDS[category] ?? [category];
  return {
    headquarters_location: { include: [{ country: "CA", city }] },
    keywords: { include: keywords, match: "any" },
  };
}
```

Note: `headcount` is intentionally NOT baked into the category filters — it's a campaign-level ICP setting applied at the call site in the discovery loop, so the client can control it per-request.

- [ ] **Step 4: Run tests**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/mapping.test.ts`
Expected: All tests PASS (new tests + existing `cityToPhase` tests)

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/mapping.ts pipeline/tests/mapping.test.ts
git commit -m "feat: add categoryToDiscoverFilters for structured Discover API queries"
```

---

### Task 4: Config — ICP Defaults

**Files:**
- Modify: `pipeline/src/config.ts`
- Modify: `pipeline/tests/config.test.ts`

- [ ] **Step 1: Write failing test**

Add to `config.test.ts`:

```typescript
it("loads Hunter ICP defaults from env", () => {
  process.env.HUNTER_DEFAULT_HEADCOUNT = "1-10,11-50,51-200";
  process.env.HUNTER_DEFAULT_SENIORITY = "executive,senior";
  const config = loadConfig();
  expect(config.hunterDefaultHeadcount).toEqual(["1-10", "11-50", "51-200"]);
  expect(config.hunterDefaultSeniority).toEqual(["executive", "senior"]);
});

it("uses sensible ICP defaults when env vars are absent", () => {
  delete process.env.HUNTER_DEFAULT_HEADCOUNT;
  delete process.env.HUNTER_DEFAULT_SENIORITY;
  const config = loadConfig();
  expect(config.hunterDefaultHeadcount).toEqual(["1-10", "11-50", "51-200"]);
  expect(config.hunterDefaultSeniority).toEqual(["executive", "senior"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/config.test.ts`
Expected: FAIL — `hunterDefaultHeadcount` is not a property

- [ ] **Step 3: Implement**

Add to the `Config` interface:

```typescript
hunterDefaultHeadcount: string[];
hunterDefaultSeniority: string[];
```

Add to `loadConfig()` return object:

```typescript
hunterDefaultHeadcount: (process.env.HUNTER_DEFAULT_HEADCOUNT ?? "1-10,11-50,51-200")
  .split(",")
  .map((s) => s.trim()),
hunterDefaultSeniority: (process.env.HUNTER_DEFAULT_SENIORITY ?? "executive,senior")
  .split(",")
  .map((s) => s.trim()),
```

- [ ] **Step 4: Run tests**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Update test helper configs**

In `tests/helpers.ts`, add the new fields to both `makePersonalizationConfig()` and `makeSendConfig()`:

```typescript
hunterDefaultHeadcount: ["1-10", "11-50", "51-200"],
hunterDefaultSeniority: ["executive", "senior"],
```

Also add them to the `makeConfig()` function inside `tests/discovery.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/config.ts pipeline/tests/config.test.ts pipeline/tests/helpers.ts
git commit -m "feat: add Hunter ICP default config (headcount, seniority)"
```

---

### Task 5: Scoring — Use Real Headcount and Seniority

**Files:**
- Modify: `pipeline/src/scoring.ts`
- Modify: `pipeline/tests/scoring.test.ts`

- [ ] **Step 1: Write failing tests for seniority-aware scoring**

Add to `scoring.test.ts`:

```typescript
describe("seniority-based scoring", () => {
  it("+1 for executive seniority", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "CEO",
      seniority: "executive",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(5); // base 3 + DM title +1 + headcount +1 + seniority captured in title
  });

  it("seniority 'senior' still gets DM bonus if title matches", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "Director of Operations",
      seniority: "senior",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("no penalty for unknown headcount when seniority is executive", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "Founder",
      seniority: "executive",
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/scoring.test.ts`
Expected: FAIL — `seniority` is not a property of `ScoreInput`

- [ ] **Step 3: Add seniority to ScoreInput and update scoring logic**

Update `scoring.ts` — add `seniority` field to `ScoreInput`:

```typescript
interface ScoreInput {
  emailConfidence: number;
  contactTitle: string | null;
  seniority: string | null;
  headcount: string | null;
  hasDomain: boolean;
}
```

Update the small/unknown headcount penalty rule — exempt executive seniority the same way decision-maker titles are exempted:

```typescript
if (
  input.contactTitle !== null &&
  !isDecisionMaker(input.contactTitle) &&
  input.seniority !== "executive" &&
  isSmallOrUnknownHeadcount(input.headcount)
) {
  score -= 1;
  reasons.push(input.headcount ? `${input.headcount} headcount` : "unknown headcount");
}
```

- [ ] **Step 4: Fix existing scoreLead call sites in tests**

All existing `scoreLead()` calls in `scoring.test.ts` need `seniority: null` added. Search for every call and add the field. Example:

```typescript
// Before:
scoreLead({ emailConfidence: 91, contactTitle: "Owner", headcount: "15", hasDomain: true })
// After:
scoreLead({ emailConfidence: 91, contactTitle: "Owner", seniority: null, headcount: "15", hasDomain: true })
```

- [ ] **Step 5: Run tests**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/scoring.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/scoring.ts pipeline/tests/scoring.test.ts
git commit -m "feat: add seniority to lead scoring input"
```

---

### Task 6: Discovery Loop Rewrite

This is the largest task — it rewrites the core discovery flow from single-domain to batch Discover → Domain Search.

**Files:**
- Modify: `pipeline/src/index.ts` (lines ~39-442)
- Modify: `pipeline/tests/discovery.test.ts`
- Modify: `pipeline/tests/helpers.ts`

- [ ] **Step 1: Update test helpers**

In `tests/helpers.ts`, add a Discover response helper:

```typescript
import type { DiscoverCompany } from "../src/types.js";

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
```

Update `makeProspectingRequestTask` — replace "Max Results" field with "Target Volume":

```typescript
{
  id: "field-target-volume",
  name: "Target Volume",
  value: opts.targetVolume ?? 25,
  type: "number",
},
```

- [ ] **Step 2: Write core discovery test — happy path**

Replace the existing end-to-end test in `discovery.test.ts`:

```typescript
it("discovers companies then searches each for contacts", async () => {
  const config = makeConfig();
  const clickup = makeMockClickUp();
  const hunter = makeMockHunter();
  const alerter = makeMockAlerter();
  const logger = createLogger("test");

  // Discover returns 2 companies
  (hunter.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeDiscoverResponse([
      makeDiscoverCompany({ domain: "abcplumbing.ca", organization: "ABC Plumbing" }),
      makeDiscoverCompany({ domain: "xyzelectric.ca", organization: "XYZ Electric" }),
    ])
  );

  // Domain Search returns contacts for each
  const searchMock = hunter.searchDomain as ReturnType<typeof vi.fn>;
  searchMock
    .mockResolvedValueOnce(
      makeHunterDomainSearchResponse("abcplumbing.ca", "ABC Plumbing", [
        makeHunterEmail({ value: "mike@abcplumbing.ca", position: "Owner", seniority: "executive" }),
      ])
    )
    .mockResolvedValueOnce(
      makeHunterDomainSearchResponse("xyzelectric.ca", "XYZ Electric", [
        makeHunterEmail({ value: "sarah@xyzelectric.ca", position: "Director", seniority: "senior" }),
      ])
    );

  const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
  getTasksMock
    .mockResolvedValueOnce([]) // stale reset
    .mockResolvedValueOnce([makeProspectingRequestTask({})]) // one request
    .mockResolvedValueOnce([]); // pre-fetch existing prospects (none)

  const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

  // Discover was called once (free)
  expect(hunter.discover).toHaveBeenCalledOnce();
  // Domain Search was called twice (2 credits)
  expect(hunter.searchDomain).toHaveBeenCalledTimes(2);
  // 2 leads created
  expect(result.requests[0].leadsCreated + result.requests[0].leadsParked).toBe(2);
});
```

- [ ] **Step 3: Write dedup test — skips Domain Search for known domains**

```typescript
it("skips Domain Search for companies whose domain is already in CRM", async () => {
  const config = makeConfig();
  const clickup = makeMockClickUp();
  const hunter = makeMockHunter();
  const alerter = makeMockAlerter();
  const logger = createLogger("test");

  (hunter.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeDiscoverResponse([
      makeDiscoverCompany({ domain: "abcplumbing.ca" }),
      makeDiscoverCompany({ domain: "newcompany.ca" }),
    ])
  );

  (hunter.searchDomain as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeHunterDomainSearchResponse("newcompany.ca", "New Co", [
      makeHunterEmail({ value: "owner@newcompany.ca" }),
    ])
  );

  const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
  getTasksMock
    .mockResolvedValueOnce([]) // stale reset
    .mockResolvedValueOnce([makeProspectingRequestTask({})]) // request
    .mockResolvedValueOnce([ // pre-fetch: abcplumbing.ca already exists
      makeClickUpTask({
        custom_fields: [{ id: "f-company-domain", name: "Company Domain", value: "https://abcplumbing.ca", type: "url" }],
      }),
    ]);

  const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

  // Domain Search only called for newcompany.ca, NOT abcplumbing.ca
  expect(hunter.searchDomain).toHaveBeenCalledOnce();
  expect(result.requests[0].duplicatesSkipped).toBe(1);
  expect(result.requests[0].leadsCreated + result.requests[0].leadsParked).toBe(1);
});
```

- [ ] **Step 4: Write quota guard test — stops Domain Search when credits exhausted mid-batch**

```typescript
it("stops processing companies when search credits run out mid-batch", async () => {
  const config = makeConfig();
  const clickup = makeMockClickUp();
  const hunter = makeMockHunter();
  const alerter = makeMockAlerter();
  const logger = createLogger("test");

  // Only 1 search credit available
  (hunter.getAccountQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
    searches: { used: 499, available: 1 },
    verifications: { used: 0, available: 1000 },
  });

  (hunter.discover as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeDiscoverResponse([
      makeDiscoverCompany({ domain: "first.ca" }),
      makeDiscoverCompany({ domain: "second.ca" }),
      makeDiscoverCompany({ domain: "third.ca" }),
    ])
  );

  (hunter.searchDomain as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeHunterDomainSearchResponse("first.ca", "First Co", [
      makeHunterEmail({ value: "a@first.ca" }),
    ])
  );

  const getTasksMock = clickup.getTasks as ReturnType<typeof vi.fn>;
  getTasksMock
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([makeProspectingRequestTask({})])
    .mockResolvedValueOnce([]);

  const result = await runDiscovery({ config, clickup, hunter, alerter, logger });

  // Only 1 Domain Search call despite 3 discovered companies
  expect(hunter.searchDomain).toHaveBeenCalledOnce();
  expect(result.requests[0].companiesSearched).toBe(1);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run tests/discovery.test.ts`
Expected: FAIL — multiple failures

- [ ] **Step 6: Update makeMockHunter in discovery.test.ts**

```typescript
function makeMockHunter(): HunterClient {
  return {
    discover: vi.fn().mockResolvedValue(
      makeDiscoverResponse([makeDiscoverCompany()])
    ),
    searchDomain: vi.fn().mockResolvedValue(
      makeHunterDomainSearchResponse("abcplumbing.ca", "ABC Plumbing", [
        makeHunterEmail(),
      ])
    ),
    getAccountQuota: vi.fn().mockResolvedValue({
      searches: { used: 50, available: 450 },
      verifications: { used: 0, available: 1000 },
    }),
  };
}
```

- [ ] **Step 7: Rewrite the discovery loop in index.ts**

This is the critical change. Replace `runDiscovery` function body. The new flow per request:

1. Extract fields (segment, category, city, targetVolume)
2. Build Discover filters via `categoryToDiscoverFilters(category, city)`
3. Merge in `config.hunterDefaultHeadcount` as the `headcount` filter
4. Call `hunter.discover(filters)` — **free, returns up to 100 companies**
5. Filter out companies whose domain is already in `knownDomains`
6. For each remaining company (up to `targetVolume`), if search credits remain:
   a. Call `hunter.searchDomain(company.domain, { seniority: config.hunterDefaultSeniority })` — **1 credit**
   b. Pick best contact from results (still filter by type=personal, confidence >= 40, but no longer need title-priority ranking since seniority filter handles it)
   c. Score the lead (now with real headcount from Discover filters and seniority from Domain Search)
   d. Create ClickUp task
7. Update the prospecting request with batch metrics

Key changes to the function signature and helpers:
- Remove `selectBestContact`'s title-priority logic. Replace with simpler "highest confidence personal email" since seniority filter already pre-qualifies contacts.
- Remove `buildSearchQuery` import (replaced by `categoryToDiscoverFilters`)
- `extractRequestFields` returns `targetVolume` instead of `maxResults`
- Quota tracking uses `quota.searches.available` instead of flat `quota.available`
- `RequestResult` uses `companiesDiscovered` and `companiesSearched` instead of `resultsFound`

Update `extractRequestFields` — change "Max Results" to "Target Volume":

```typescript
if (field.name === "Target Volume" && typeof field.value === "number") {
  targetVolume = field.value;
}
```

Update `selectBestContact` — simplify since seniority is pre-filtered:

```typescript
export function selectBestContact(
  contacts: HunterContact[]
): HunterContact | null {
  const eligible = contacts.filter(
    (c) => c.type === "personal" && c.confidence >= MIN_CONTACT_CONFIDENCE
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.confidence - a.confidence);
  return eligible[0];
}
```

The full loop body (replacing lines 225-433):

```typescript
for (const requestTask of requests) {
  const { segment, category, targetCity, targetVolume } =
    extractRequestFields(requestTask);
  const requestResult: RequestResult = {
    requestTaskId: requestTask.id,
    segment,
    category,
    targetCity,
    companiesDiscovered: 0,
    companiesSearched: 0,
    leadsCreated: 0,
    leadsParked: 0,
    duplicatesSkipped: 0,
    noContactSkipped: 0,
    status: "completed",
  };

  try {
    await clickup.updateTask(requestTask.id, { status: "Running" });

    // Step 1: Discover companies (free)
    const filters = categoryToDiscoverFilters(category, targetCity);
    filters.headcount = config.hunterDefaultHeadcount;
    logger.info("Discovering companies", { category, targetCity, filters });
    const discoverResponse = await hunter.discover(filters);
    const discoveredCompanies = discoverResponse.data;
    requestResult.companiesDiscovered = discoveredCompanies.length;

    // Step 2: Filter out known domains before spending credits
    const newCompanies = discoveredCompanies.filter((c) => {
      const norm = normalizeDomain(c.domain);
      if (knownDomains.has(norm)) {
        logger.info("SKIP: duplicate domain from Discover", { domain: c.domain });
        requestResult.duplicatesSkipped += 1;
        return false;
      }
      return true;
    });

    // Step 3: Domain Search each new company (1 credit each)
    const companiesToSearch = newCompanies.slice(0, targetVolume);
    const now = new Date();
    const importBatch = `${now.toISOString().slice(0, 10)}-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${targetCity.toLowerCase()}`;

    for (const company of companiesToSearch) {
      if (quota.searches.available < 1) {
        logger.warn("Search credits exhausted mid-batch", {
          domain: company.domain,
          remaining: companiesToSearch.length - requestResult.companiesSearched,
        });
        break;
      }

      const domainResponse = await hunter.searchDomain(company.domain, {
        limit: 10,
        seniority: config.hunterDefaultSeniority,
      });
      quota.searches.available -= 1;
      requestResult.companiesSearched += 1;

      if (!domainResponse.data.emails || domainResponse.data.emails.length === 0) {
        logger.info("No contacts found", { domain: company.domain });
        requestResult.noContactSkipped += 1;
        continue;
      }

      const contacts: HunterContact[] = domainResponse.data.emails.map((e) => ({
        ...e,
        full_name:
          e.first_name && e.last_name
            ? `${e.first_name} ${e.last_name}`
            : e.first_name ?? e.last_name ?? null,
      }));

      const bestContact = selectBestContact(contacts);
      if (!bestContact) {
        logger.info("NO_CONTACT: No suitable contact", { domain: company.domain });
        requestResult.noContactSkipped += 1;
        continue;
      }

      knownDomains.add(normalizeDomain(company.domain));

      const bestEmail = domainResponse.data.emails.find((e) => e.value === bestContact.value);
      const scoreResult = scoreLead({
        emailConfidence: bestContact.confidence,
        contactTitle: bestContact.position,
        seniority: bestEmail?.seniority ?? null,
        headcount: config.hunterDefaultHeadcount[0] ?? null,
        hasDomain: true,
      });

      const status = scoreResult.score >= 3 ? "Enriched" : "Parked";
      const contactName =
        bestContact.full_name ??
        [bestContact.first_name, bestContact.last_name].filter(Boolean).join(" ") ??
        bestContact.value;
      const taskName = `${company.organization || company.domain} — ${contactName}`;
      const caslSourceUrl = extractCaslSourceUrl(bestContact, company.domain);

      if (!config.dryRun) {
        const segmentIndex = resolveDropdownValue(dropdownOptions[config.fields.segment], segment);
        const categoryIndex = resolveDropdownValue(dropdownOptions[config.fields.category], category);
        const cityIndex = resolveDropdownValue(dropdownOptions[config.fields.companyCity], targetCity);
        const phaseLabel = cityToPhase(targetCity);
        const phaseIndex = resolveDropdownValue(dropdownOptions[config.fields.geographicPhase], phaseLabel);

        await clickup.createTask(config.clickupListId, {
          name: taskName,
          status,
          custom_fields: [
            { id: config.fields.companyName, value: company.organization || company.domain },
            { id: config.fields.companyDomain, value: `https://${company.domain}` },
            { id: config.fields.companyIndustry, value: "" },
            { id: config.fields.companyHeadcount, value: config.hunterDefaultHeadcount.join(", ") },
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

      logger.info("Lead created", { taskName, score: scoreResult.score, status, dryRun: config.dryRun });
    }

    // Update Prospecting Request
    if (!config.dryRun) {
      await clickup.updateTask(requestTask.id, {
        status: "Complete",
        custom_fields: [
          { id: config.prospectingFields.resultsFound, value: requestResult.companiesDiscovered },
          { id: config.prospectingFields.leadsCreated, value: requestResult.leadsCreated },
          { id: config.prospectingFields.leadsParked, value: requestResult.leadsParked },
          { id: config.prospectingFields.duplicatesSkipped, value: requestResult.duplicatesSkipped },
        ],
      });
      await clickup.addComment(
        requestTask.id,
        `Completed: ${requestResult.companiesDiscovered} companies discovered, ${requestResult.companiesSearched} searched, ${requestResult.leadsCreated} leads created (score 3+), ${requestResult.leadsParked} parked (score 1-2), ${requestResult.duplicatesSkipped} duplicates skipped`
      );
    }

    result.results.completed += 1;
  } catch (err) {
    if (err instanceof HunterRateLimitError) {
      logger.warn("Hunter.io rate limited — aborting remaining requests");
      await alerter.send("Hunter.io rate limited", "Discovery batch aborted due to 429. Remaining requests will be retried next run.");
      requestResult.status = "failed";
      requestResult.error = "Hunter.io rate limited";
      result.results.failed += 1;
      result.requests.push(requestResult);
      result.requestsProcessed += 1;
      break;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Request processing failed", { requestTaskId: requestTask.id, error: errorMsg });
    requestResult.status = "failed";
    requestResult.error = errorMsg;
    result.results.failed += 1;

    try {
      await clickup.updateTask(requestTask.id, { status: "Failed" });
      await clickup.addComment(requestTask.id, `Error: ${errorMsg}`);
    } catch {
      // Best effort
    }

    await alerter.send(`Discovery agent error on request ${requestTask.id}`, errorMsg);
  }

  result.requests.push(requestResult);
  result.requestsProcessed += 1;
}
```

Also update the quota check before the loop — change from `quota.available` to `quota.searches.available`:

```typescript
const quota = await hunter.getAccountQuota();
logger.info("Hunter.io quota", { searches: quota.searches, verifications: quota.verifications });
```

Remove the pre-loop quota guard (`if (quota.available < 1)`) — quota is now checked per-company inside the inner loop, not per-request.

Update imports — add `categoryToDiscoverFilters` from mapping, remove `buildSearchQuery`:

```typescript
import { categoryToDiscoverFilters, cityToPhase } from "./mapping.js";
```

- [ ] **Step 8: Update remaining discovery tests**

Fix all existing tests to work with the new flow:
- All mock hunter objects need `discover` method
- Quota mock returns `{ searches: {...}, verifications: {...} }` structure
- `requestResult` fields use `companiesDiscovered`/`companiesSearched` instead of `resultsFound`
- Request tasks use "Target Volume" instead of "Max Results"

- [ ] **Step 9: Run full test suite**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add pipeline/src/index.ts pipeline/src/mapping.ts pipeline/tests/discovery.test.ts pipeline/tests/helpers.ts
git commit -m "feat: rewrite discovery to use Discover -> Domain Search two-step pipeline"
```

---

### Task 7: Cleanup — Remove Dead Code

**Files:**
- Modify: `pipeline/src/mapping.ts`
- Modify: `pipeline/src/index.ts`

- [ ] **Step 1: Remove buildSearchQuery and CATEGORY_SEARCH_MAP**

In `mapping.ts`, delete:
- The `CATEGORY_SEARCH_MAP` constant
- The `categoryToSearchQuery` function
- The `buildSearchQuery` function

Keep: `cityToPhase`, `categoryToDiscoverFilters`, `CATEGORY_KEYWORDS`

- [ ] **Step 2: Remove TITLE_PRIORITY from index.ts**

The `TITLE_PRIORITY` constant and `titlePriorityRank` function are no longer used since `selectBestContact` now sorts by confidence only (seniority is pre-filtered by Hunter). Delete:
- `TITLE_PRIORITY` constant (line ~41-45)
- `titlePriorityRank` function (line ~49-56)

- [ ] **Step 3: Remove old mapping test references**

In `tests/mapping.test.ts`, remove any tests for `categoryToSearchQuery` and `buildSearchQuery` if they still exist.

- [ ] **Step 4: Run full test suite**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run`
Expected: All 178+ tests PASS, no references to removed functions

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/mapping.ts pipeline/src/index.ts pipeline/tests/mapping.test.ts
git commit -m "chore: remove dead code from pre-Discover pipeline"
```

---

### Task 8: Account Quota — Track Searches Specifically

**Files:**
- Modify: `pipeline/src/clients/hunter.ts` (already done in Task 2)
- Verify: quota response matches actual Hunter API

- [ ] **Step 1: Verify quota structure against API docs**

The Hunter `/account` endpoint returns:

```json
{
  "data": {
    "requests": {
      "credits": { "used": 550.0, "available": 10000.0 },
      "searches": { "used": 500, "available": 10000 },
      "verifications": { "used": 100, "available": 20000 }
    }
  }
}
```

Our `getAccountQuota()` in Task 2 already returns `data.data.requests` which contains `searches` and `verifications`. Verify the discovery loop uses `quota.searches.available` for the Domain Search credit guard.

- [ ] **Step 2: Run full test suite as final verification**

Run: `cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit (if any changes needed)**

```bash
git add -A
git commit -m "chore: verify quota tracking matches Hunter API structure"
```
