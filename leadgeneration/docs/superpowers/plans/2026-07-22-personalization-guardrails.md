# Personalization Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the personalization agent ("Ellie") from inventing products and naming the wrong season, by adding deterministic seasonality, zero-product-talk guards, and a capped retry loop.

**Architecture:** A new pure `src/seasonality.ts` computes the current selling season from the date (never inferred by the model) and detects forbidden-season mentions. Product/price guards are added to the existing `validateDrafts` in `src/index.ts` alongside the catalog guard. The `runPersonalization` loop injects season context into the prompt and wraps generate+validate in a bounded retry (2 in-run retries), with a cross-run attempt cap that parks and alerts on persistent failure.

**Tech Stack:** TypeScript (ES2022, Node16 modules, `strict`), Vitest. Run tests with `npm test` (which is `vitest run`) from `leadgeneration/pipeline/`.

## Global Constraints

- All work happens in `leadgeneration/pipeline/`. Run all commands from that directory.
- Node16 module resolution: **relative imports must use the `.js` extension** even for `.ts` files (e.g. `import { resolveSeasonalContext } from "./seasonality.js"`).
- `strict` TypeScript. No `any` without cause.
- **Zero product talk:** prospect-facing copy may say "custom apparel" / "branded apparel" only — never a garment, style, fabric, colour, or price.
- **The offer is a no-obligation quote.** Ellie never states or estimates a price herself.
- **Season enforcement:** each period allows only its selling-season word; the other three (plus "autumn" when "fall" is forbidden) fail validation. Calendar in `wiki/topics/seasonal-playbook.md` is the source of truth; mirror it exactly.
- **Season checking is a SEPARATE function** (`findForbiddenSeasonMentions`), NOT part of `validateDrafts`. Do not add season logic inside `validateDrafts` — existing tests rely on season words being harmless there.
- **Retry is capped:** max 3 generate calls per lead per run (1 + 2 retries); max 2 failed runs per lead before permanent park + ntfy alert. Retries never fire on a 429 (`isRateLimited`) — that keeps the existing batch-defer behavior.
- Frequent commits: one per task minimum.

---

## File Structure

- **Create** `src/seasonality.ts` — `SeasonalContext` type, `resolveSeasonalContext(now)`, `findForbiddenSeasonMentions(fields, seasonal)`, `crossRunAttemptCount(tags)`. Pure, no I/O.
- **Create** `tests/seasonality.test.ts` — unit tests for the above.
- **Modify** `src/index.ts` — add `PRODUCT_NOUN_RE`/`PRICE_RE` + checks in `validateDrafts`; rewrite `buildPrompt` (remove product vocab, quote CTA, inject season, add `retryFeedback` param); wire season context + retry loop + cross-run cap into `runPersonalization`; add `personalize-failed` exclusion to the eligibility filter.
- **Modify** `tests/helpers.ts` — clean `makeMockDraftOutput` fixture so prospect-facing fields contain no product nouns, prices, or season words.
- **Modify** `tests/personalization.test.ts` — update `buildPrompt` call sites for the new signature; add product/price/season/retry/cap tests.

---

## Task 1: Seasonality module

**Files:**
- Create: `src/seasonality.ts`
- Test: `tests/seasonality.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface SeasonalContext { period: string; sellingSeason: string; forbiddenSeasons: string[]; theme: string; segmentFocus: string }`
  - `resolveSeasonalContext(now: Date): SeasonalContext`
  - `findForbiddenSeasonMentions(fields: string[], seasonal: SeasonalContext): string[]`
  - `crossRunAttemptCount(tags: Array<{ name: string }>): number`

- [ ] **Step 1: Write the failing tests**

Create `tests/seasonality.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  resolveSeasonalContext,
  findForbiddenSeasonMentions,
  crossRunAttemptCount,
} from "../src/seasonality.js";

describe("resolveSeasonalContext", () => {
  it("July sells fall", () => {
    const s = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z"));
    expect(s.sellingSeason).toBe("fall");
    expect(s.period).toBe("June to August");
    expect(s.forbiddenSeasons).toEqual(["spring", "summer", "winter"]);
  });

  it("June and August both sell fall (quarter boundaries)", () => {
    expect(resolveSeasonalContext(new Date("2026-06-01T12:00:00Z")).sellingSeason).toBe("fall");
    expect(resolveSeasonalContext(new Date("2026-08-31T12:00:00Z")).sellingSeason).toBe("fall");
  });

  it("September pivots to winter (the corrected boundary)", () => {
    const s = resolveSeasonalContext(new Date("2026-09-01T12:00:00Z"));
    expect(s.sellingSeason).toBe("winter");
    expect(s.forbiddenSeasons).toContain("fall");
    expect(s.forbiddenSeasons).toContain("autumn");
  });

  it("December through February sells spring", () => {
    expect(resolveSeasonalContext(new Date("2026-12-15T12:00:00Z")).sellingSeason).toBe("spring");
    expect(resolveSeasonalContext(new Date("2026-01-15T12:00:00Z")).sellingSeason).toBe("spring");
    expect(resolveSeasonalContext(new Date("2026-02-28T12:00:00Z")).sellingSeason).toBe("spring");
  });

  it("March through May sells summer", () => {
    expect(resolveSeasonalContext(new Date("2026-03-15T12:00:00Z")).sellingSeason).toBe("summer");
    expect(resolveSeasonalContext(new Date("2026-05-31T12:00:00Z")).sellingSeason).toBe("summer");
  });
});

describe("findForbiddenSeasonMentions", () => {
  const july = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z")); // fall; forbids spring/summer/winter

  it("flags a forbidden season word", () => {
    const errors = findForbiddenSeasonMentions(["Ready for the spring season?"], july);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("spring");
  });

  it("allows the selling-season word itself", () => {
    expect(findForbiddenSeasonMentions(["Get your fall order in early."], july)).toEqual([]);
  });

  it("is case-insensitive and word-bounded", () => {
    expect(findForbiddenSeasonMentions(["SUMMER is here"], july).length).toBe(1);
    // 'summertime' substring should still trip a word-boundary match on 'summer'? No — \b requires boundary.
    expect(findForbiddenSeasonMentions(["summertime fun"], july)).toEqual([]);
  });

  it("flags autumn when fall is forbidden", () => {
    const sept = resolveSeasonalContext(new Date("2026-09-15T12:00:00Z")); // winter; forbids fall/autumn
    expect(findForbiddenSeasonMentions(["ready for autumn?"], sept).length).toBe(1);
  });

  it("dedupes: one error per forbidden word even across multiple fields", () => {
    const errors = findForbiddenSeasonMentions(["spring cleaning", "spring sale"], july);
    expect(errors.length).toBe(1);
  });
});

describe("crossRunAttemptCount", () => {
  it("returns 1 when no attempt tags present", () => {
    expect(crossRunAttemptCount([{ name: "no-scrape" }])).toBe(1);
  });

  it("reads the highest personalize-attempt-N tag", () => {
    expect(crossRunAttemptCount([{ name: "personalize-attempt-2" }])).toBe(2);
    expect(crossRunAttemptCount([{ name: "personalize-attempt-2" }, { name: "personalize-attempt-3" }])).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- seasonality`
Expected: FAIL — cannot resolve `../src/seasonality.js`.

- [ ] **Step 3: Write the implementation**

Create `src/seasonality.ts`:

```typescript
// The selling calendar. SOURCE OF TRUTH: wiki/topics/seasonal-playbook.md
// (BC Lower Mainland buying occasions + ~6-10wk cold-lead-to-delivery lead time).
// Each period sells the season that is COMING, and allows only its sellingSeason
// word; every other season word fails validation. "autumn" rides with "fall".
export interface SeasonalContext {
  period: string;
  sellingSeason: string;
  forbiddenSeasons: string[];
  theme: string;
  segmentFocus: string;
}

interface Quarter {
  months: number[]; // 0-indexed
  ctx: SeasonalContext;
}

const QUARTERS: Quarter[] = [
  {
    months: [5, 6, 7], // Jun, Jul, Aug
    ctx: {
      period: "June to August",
      sellingSeason: "fall",
      forbiddenSeasons: ["spring", "summer", "winter"],
      theme: "Lock in your fall order early",
      segmentFocus: "Fall-sports teams, businesses",
    },
  },
  {
    months: [8, 9, 10], // Sep, Oct, Nov
    ctx: {
      period: "September to November",
      sellingSeason: "winter",
      forbiddenSeasons: ["spring", "summer", "fall", "autumn"],
      theme: "Year-end gear and appreciation",
      segmentFocus: "Businesses, teams",
    },
  },
  {
    months: [11, 0, 1], // Dec, Jan, Feb
    ctx: {
      period: "December to February",
      sellingSeason: "spring",
      forbiddenSeasons: ["summer", "fall", "autumn", "winter"],
      theme: "New year, fresh look",
      segmentFocus: "Businesses, spring-sports teams",
    },
  },
  {
    months: [2, 3, 4], // Mar, Apr, May
    ctx: {
      period: "March to May",
      sellingSeason: "summer",
      forbiddenSeasons: ["fall", "autumn", "winter", "spring"],
      theme: "Gear up for your season",
      segmentFocus: "Teams, trades, businesses",
    },
  },
];

export function resolveSeasonalContext(now: Date): SeasonalContext {
  const month = now.getUTCMonth();
  const quarter = QUARTERS.find((q) => q.months.includes(month));
  // Every month 0-11 is covered by exactly one quarter above.
  return quarter!.ctx;
}

/**
 * Detects any forbidden-season word in the given prospect-facing fields.
 * One error per distinct forbidden word (not per occurrence). Word-bounded and
 * case-insensitive. Blunt by design: a stray "don't let it fall through" may trip
 * a regenerate — accepted, since the cost is a retry, not bad client-facing copy.
 */
export function findForbiddenSeasonMentions(
  fields: string[],
  seasonal: SeasonalContext
): string[] {
  const errors: string[] = [];
  const haystack = fields.join("\n").toLowerCase();
  for (const word of seasonal.forbiddenSeasons) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(haystack)) {
      errors.push(
        `draft references "${word}"; the selling season is "${seasonal.sellingSeason}" — rewrite the seasonal angle`
      );
    }
  }
  return errors;
}

/** Highest N among `personalize-attempt-N` tags, or 1 if none present. */
export function crossRunAttemptCount(tags: Array<{ name: string }>): number {
  let max = 1;
  for (const tag of tags) {
    const m = /^personalize-attempt-(\d+)$/.exec(tag.name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- seasonality`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/seasonality.ts tests/seasonality.test.ts
git commit -m "feat(seasonality): deterministic BC selling-season resolver + guards"
```

---

## Task 2: Product & price guards + clean fixture

**Files:**
- Modify: `src/index.ts` (add regexes near line 730; add checks inside `validateDrafts`, ~line 825)
- Modify: `tests/helpers.ts` (`makeMockDraftOutput`, lines 202-228)
- Test: `tests/personalization.test.ts` (add a new describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateDrafts(drafts, lead)` now also returns product-noun and price errors. Signature unchanged.

**Why the fixture must change:** the current `makeMockDraftOutput` prospect-facing copy contains "crew uniforms", "safety vests", "work wear", and "team store" — all banned once the product guard lands. Cleaning it keeps the existing `toEqual([])` / `toHaveLength(0)` tests green.

- [ ] **Step 1: Clean the shared fixture**

In `tests/helpers.ts`, replace the `makeMockDraftOutput` return object (lines 205-226) with product/price/season-clean prospect-facing copy:

```typescript
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
```

- [ ] **Step 2: Run existing tests to confirm the clean fixture still passes**

Run: `npm test -- personalization`
Expected: PASS (fixture change alone must not break anything — guards not added yet).

- [ ] **Step 3: Write the failing product/price tests**

Add this describe block at the end of `tests/personalization.test.ts`:

```typescript
describe("validateDrafts — product & price guardrails (zero product talk)", () => {
  const lead = () => makeLeadData({ companyName: "Monark", contactName: "Pardeep Dosanjh" });
  const cleanBody = `Hi Pardeep, Monark caught my eye. We do custom apparel for local teams. ${"x".repeat(80)}`;

  it("passes a clean draft that names no product", () => {
    expect(validateDrafts(makeMockDraftOutput({ email_touch_1_body: cleanBody }), lead())).toEqual([]);
  });

  it("rejects a specific garment noun in a body", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we can do tri-blend hoodies for your team. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects 'spirit wear' and 'team gear' phrases", () => {
    const d1 = makeMockDraftOutput({ email_touch_2_body: `Following up, our spirit wear is great. ${"x".repeat(60)}` });
    const d2 = makeMockDraftOutput({ email_touch_2_body: `Following up, our team gear is great. ${"x".repeat(60)}` });
    expect(validateDrafts(d1, lead()).some((e) => e.includes("product"))).toBe(true);
    expect(validateDrafts(d2, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects a product noun in a subject line", () => {
    const drafts = makeMockDraftOutput({ email_touch_1_body: cleanBody, email_touch_1_subject: "Custom polos for Monark" });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("product"))).toBe(true);
  });

  it("rejects a stated price ($ + digit)", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we can start around $28 a piece. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(true);
  });

  it("rejects 'per unit' / 'per shirt' pricing language", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, pricing is great per unit. ${"x".repeat(80)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(true);
  });

  it("does NOT false-positive on the Business social-proof number range", () => {
    const drafts = makeMockDraftOutput({
      email_touch_1_body: `Hi Pardeep, Monark, we work with businesses of 12 to 250+ employees. ${"x".repeat(60)}`,
    });
    expect(validateDrafts(drafts, lead()).some((e) => e.includes("price"))).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `npm test -- personalization`
Expected: the new product/price cases FAIL (guards not implemented); existing cases still PASS.

- [ ] **Step 5: Add the guards**

In `src/index.ts`, immediately after the `NONEXISTENT_COLLATERAL_RE` definition (~line 730), add:

```typescript
// Zero product talk: Ellie sells "custom apparel" and nothing more specific.
// A denylist of the ~30 nouns a model reaches for (not an allowlist — English
// can't be enumerated). Extend by adding a word when Jenn flags one, exactly
// like the catalog guard. Bare "gear" is intentionally excluded (too broad);
// only the "team gear" phrase is caught.
const PRODUCT_NOUN_RE =
  /\b(hoodies?|t-?shirts?|tees?|polos?|quarter-?zips?|jerseys?|toques?|beanies?|jackets?|sweatshirts?|crewnecks?|softshells?|vests?|lanyards?|totes?|mugs?|hats?|caps?|uniforms?|work\s?wear|spirit\s?wear|team\s?gear|swag|embroidery|screen\s?print(?:ing|ed)?|dtg)\b/i;

// Stated prices. Currency-anchored ONLY (a digit next to $/dollars, or explicit
// per-unit phrasing) so the Business social proof ("12 to 250+ employees") never
// false-positives. Bare "each"/bare numbers are deliberately NOT matched.
const PRICE_RE =
  /(\$\s?\d|\b\d[\d,.]*\s?(?:dollars?|usd|cad)\b|\bper[- ](?:unit|shirt|piece|item|garment)\b|\/\s?(?:unit|shirt|piece)\b)/i;
```

Then inside `validateDrafts`, after the existing catalog check block (right before `return errors;` at ~line 842), add:

```typescript
  if (prospectFacing.some((t) => PRODUCT_NOUN_RE.test(t))) {
    errors.push(
      "draft names a specific product/garment — Ellie sells 'custom apparel' only, never a named item"
    );
  }
  if (prospectFacing.some((t) => PRICE_RE.test(t))) {
    errors.push(
      "draft states a price — Ellie must offer a no-obligation quote, never quote a number"
    );
  }
```

Note: `prospectFacing` is the array already declared for the catalog check (touch 1/2/3 bodies + subjects + linkedin_message). Reuse it; do not redeclare.

- [ ] **Step 6: Run tests to verify all pass**

Run: `npm test -- personalization`
Expected: PASS (new and existing).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/index.ts tests/helpers.ts tests/personalization.test.ts
git commit -m "feat(guardrails): reject named products and stated prices in drafts"
```

---

## Task 3: Prompt rewrite + season injection & validation

**Files:**
- Modify: `src/index.ts` (`buildPrompt` ~lines 599-705; `runPersonalization` loop — the `buildPrompt` call ~line 994 and validation block ~line 1072)
- Test: `tests/personalization.test.ts` (`buildPrompt` describe block, ~lines 261-363)

**Interfaces:**
- Consumes: `SeasonalContext`, `resolveSeasonalContext`, `findForbiddenSeasonMentions` from `./seasonality.js`.
- Produces: `buildPrompt(lead: LeadData, scrapedContent: string, seasonal: SeasonalContext, retryFeedback?: string): string`. The `retryFeedback` param is added here but only exercised in Task 4.

- [ ] **Step 1: Update the `buildPrompt` tests for the new signature**

At the top of `tests/personalization.test.ts`, add to the imports from `../src/seasonality.js`:

```typescript
import { resolveSeasonalContext } from "../src/seasonality.js";
```

In the `describe("buildPrompt", ...)` block, define a shared context and update every `buildPrompt(...)` call to pass it. Add this line at the top of the describe block:

```typescript
  const seasonal = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z")); // fall
```

Then change each call: `buildPrompt(lead, scrapedContent)` → `buildPrompt(lead, scrapedContent, seasonal)`, `buildPrompt(lead, "")` → `buildPrompt(lead, "", seasonal)`, and the three at lines 360-362 likewise (`buildPrompt(schoolLead, "", seasonal)`, etc.).

Add these new assertions inside the same describe block:

```typescript
  it("injects the resolved selling season and forbids the others", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt).toContain("FALL");
    expect(prompt).toContain("NEVER reference: spring, summer, winter");
    expect(prompt).toContain("Lock in your fall order early");
  });

  it("does NOT tell the model to offer a mockup or catalog", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt.toLowerCase()).not.toContain("mockup");
    expect(prompt.toLowerCase()).not.toContain("catalog");
  });

  it("instructs a no-obligation quote as the concrete offer", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal);
    expect(prompt.toLowerCase()).toContain("no-obligation quote");
  });

  it("appends retry feedback when provided", () => {
    const prompt = buildPrompt(makeLeadData(), "", seasonal, 'draft names a specific product');
    expect(prompt).toContain("YOUR PREVIOUS DRAFT WAS REJECTED");
    expect(prompt).toContain("draft names a specific product");
  });
```

- [ ] **Step 2: Run the buildPrompt tests to verify they fail**

Run: `npm test -- personalization`
Expected: FAIL — `buildPrompt` expects 2 args / new assertions unmet.

- [ ] **Step 3: Rewrite `buildPrompt`**

In `src/index.ts`, add to the seasonality import at the top of the file:

```typescript
import { resolveSeasonalContext, findForbiddenSeasonMentions, crossRunAttemptCount, type SeasonalContext } from "./seasonality.js";
```

Change the signature and remove the product vocabulary. Replace line 614-616's company description:

```typescript
  let prompt = `You are writing cold outreach for Jaydees Apparel (shopjaydees.com), a custom
apparel company in BC's Lower Mainland. They make custom apparel for businesses,
schools, and teams. Keep it at that level — "custom apparel" or "branded apparel"
is the most specific you may ever be.
```

Update the function signature (line 599):

```typescript
export function buildPrompt(
  lead: LeadData,
  scrapedContent: string,
  seasonal: SeasonalContext,
  retryFeedback?: string
): string {
```

Replace instruction 7 (lines 681-684) with the combined product/price/quote rule:

```typescript
7. Never name a specific product, garment, style, fabric, colour, or price. You sell
   "custom apparel" — that is the most specific you may ever be (no hoodies, tees,
   uniforms, spirit wear, team gear, etc.). Do NOT offer a catalog, brochure, lookbook,
   price list, or mockup — Jaydees has none of these. If you want to offer something
   concrete, offer a no-obligation quote. Never state or estimate a price yourself.
```

Immediately before `Return your response as structured JSON matching the schema provided.` (line 691), inject the season block:

```typescript
  prompt += `

SEASONAL TIMING (non-negotiable):
TODAY'S DATE: ${new Date().toISOString().slice(0, 10)}
CURRENT SELLING PERIOD: ${seasonal.period}
THEME: ${seasonal.theme}
You are selling into the ${seasonal.sellingSeason.toUpperCase()} season. Lead times mean
an order placed now is delivered weeks out, so you always talk about the season that is
coming, never the one happening now.
NEVER reference: ${seasonal.forbiddenSeasons.filter((s) => s !== "autumn").join(", ")}.
`;
```

(Note: the injected date uses `new Date()` for display only; the authoritative season decision was already made by `resolveSeasonalContext` in the caller and passed in as `seasonal`.)

Then, just before `return prompt;` (after the re-engagement block, line 703), append the retry feedback if present:

```typescript
  if (retryFeedback) {
    prompt += `

YOUR PREVIOUS DRAFT WAS REJECTED for these reasons:
- ${retryFeedback}
Rewrite all touches and fix these specifically.`;
  }
```

- [ ] **Step 4: Wire season context + validation into the loop**

In `runPersonalization`, right after `const now = new Date();` (line 860), add:

```typescript
  const seasonal = resolveSeasonalContext(now);
```

Update the `buildPrompt` call (line 994):

```typescript
      const prompt = buildPrompt(lead, scrapedContent, seasonal);
```

In the validation block, after `const validationErrors = validateDrafts(drafts, lead);` (line 1072), fold in the season errors:

```typescript
      const validationErrors = validateDrafts(drafts, lead);
      validationErrors.push(
        ...findForbiddenSeasonMentions(
          [
            drafts.email_touch_1_body,
            drafts.email_touch_2_body,
            drafts.email_touch_3_body,
            drafts.email_touch_1_subject,
            drafts.email_touch_2_subject,
            drafts.email_touch_3_subject,
            drafts.linkedin_message,
          ],
          seasonal
        )
      );
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm test -- personalization`
Expected: PASS. (The cleaned fixture from Task 2 has no season words in prospect-facing fields, so end-to-end success tests pass regardless of the machine's date.)

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/index.ts tests/personalization.test.ts
git commit -m "feat(prompt): inject deterministic season, quote CTA, drop product vocab"
```

---

## Task 4: Capped retry loop + cross-run park

**Files:**
- Modify: `src/index.ts` (eligibility filter ~line 904; the generate→validate section of the loop ~lines 993-1084)
- Test: `tests/personalization.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `crossRunAttemptCount` from `./seasonality.js` (imported in Task 3).
- Produces: no new exports. Behavior: up to 3 generate calls per lead per run; on total failure, increment `personalize-attempt-N` tag; at 2 failed runs, tag `personalize-failed` + ntfy alert; `personalize-failed` leads are excluded from eligibility.

- [ ] **Step 1: Write the failing retry/cap tests**

First, review the existing end-to-end test setup in `tests/personalization.test.ts` (the `runPersonalization` describe around lines 55-100) to reuse `makeMockClickUp`, `makeMockFirecrawl`, `makePersonalizationConfig`, and the alerter mock. Add this describe block at the end of the file:

```typescript
describe("runPersonalization — capped retry & cross-run park", () => {
  function makeAlerter() {
    return { send: vi.fn().mockResolvedValue(undefined) };
  }
  function badDrafts() {
    // Names a product -> fails validateDrafts every time.
    return makeMockDraftOutput({
      email_touch_1_body: `Hi Mike, ABC Plumbing, we do custom hoodies for your crew. ${"x".repeat(80)}`,
    });
  }

  it("retries in-run and succeeds on the second attempt", async () => {
    const clickup = makeMockClickUp();
    clickup.getTasks = vi
      .fn()
      .mockResolvedValueOnce([]) // stuck-lead sweep
      .mockResolvedValueOnce([makeEnrichedClickUpTask({ leadScore: 4 })]); // enriched
    const gemini = {
      generateDrafts: vi
        .fn()
        .mockResolvedValueOnce({ drafts: badDrafts(), tokensUsed: 100 })
        .mockResolvedValueOnce({ drafts: makeMockDraftOutput(), tokensUsed: 100 }),
    };
    const result = await runPersonalization({
      config: makePersonalizationConfig(),
      clickup,
      firecrawl: makeMockFirecrawl(),
      gemini: gemini as any,
      alerter: makeAlerter() as any,
      logger: createLogger(),
    });
    expect(gemini.generateDrafts).toHaveBeenCalledTimes(2);
    expect(result.results.success).toBe(1);
  });

  it("caps in-run retries at 3 generate calls", async () => {
    const clickup = makeMockClickUp();
    clickup.getTasks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({ leadScore: 4 })]);
    const gemini = { generateDrafts: vi.fn().mockResolvedValue({ drafts: badDrafts(), tokensUsed: 100 }) };
    const result = await runPersonalization({
      config: makePersonalizationConfig(),
      clickup,
      firecrawl: makeMockFirecrawl(),
      gemini: gemini as any,
      alerter: makeAlerter() as any,
      logger: createLogger(),
    });
    expect(gemini.generateDrafts).toHaveBeenCalledTimes(3);
    expect(result.results.generationFailed).toBe(1);
    // First failed run -> escalates to attempt-2, not yet permanent.
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "personalize-attempt-2");
  });

  it("parks permanently and alerts on the final failed run", async () => {
    const clickup = makeMockClickUp();
    clickup.getTasks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({ leadScore: 4, tags: ["personalize-attempt-2"] })]);
    const gemini = { generateDrafts: vi.fn().mockResolvedValue({ drafts: badDrafts(), tokensUsed: 100 }) };
    const alerter = makeAlerter();
    const result = await runPersonalization({
      config: makePersonalizationConfig(),
      clickup,
      firecrawl: makeMockFirecrawl(),
      gemini: gemini as any,
      alerter: alerter as any,
      logger: createLogger(),
    });
    expect(clickup.addTag).toHaveBeenCalledWith("task_lead_001", "personalize-failed");
    expect(alerter.send).toHaveBeenCalled();
    expect(result.results.generationFailed).toBe(1);
  });

  it("excludes personalize-failed leads from eligibility", async () => {
    const clickup = makeMockClickUp();
    clickup.getTasks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({ leadScore: 4, tags: ["personalize-failed"] })]);
    const gemini = { generateDrafts: vi.fn() };
    const result = await runPersonalization({
      config: makePersonalizationConfig(),
      clickup,
      firecrawl: makeMockFirecrawl(),
      gemini: gemini as any,
      alerter: makeAlerter() as any,
      logger: createLogger(),
    });
    expect(gemini.generateDrafts).not.toHaveBeenCalled();
    expect(result.leadsAvailable).toBe(0);
  });

  it("does NOT retry on a 429 — defers the batch instead", async () => {
    const clickup = makeMockClickUp();
    clickup.getTasks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeEnrichedClickUpTask({ leadScore: 4 })]);
    const gemini = {
      generateDrafts: vi.fn().mockResolvedValue({ tokensUsed: 0, error: "Gemini 429", isRateLimited: true }),
    };
    await runPersonalization({
      config: makePersonalizationConfig(),
      clickup,
      firecrawl: makeMockFirecrawl(),
      gemini: gemini as any,
      alerter: makeAlerter() as any,
      logger: createLogger(),
    });
    expect(gemini.generateDrafts).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- personalization`
Expected: the new cases FAIL (no retry loop / cap yet).

- [ ] **Step 3: Add the eligibility exclusion**

In `runPersonalization`, extend the eligibility filter (lines 904-910) to skip permanently-parked leads:

```typescript
  const eligible = allEnriched.filter((task) => {
    if (task.tags.some((t) => t.name === "personalize-failed")) return false;
    const scoreField = task.custom_fields.find(
      (f) => f.id === config.fields.leadScore
    );
    const score = numericFieldValue(scoreField?.value);
    return score >= 3;
  });
```

- [ ] **Step 4: Wrap generate+validate in the retry loop**

Replace the section from the `buildPrompt` call through the validation-failure `continue` (current lines 993-1084) with the bounded retry below. This subsumes the existing single-shot generate, the 429 defer, the Gemini-error path, the CASL check, and the validation check into one loop. Constants go at module scope near the other guards:

```typescript
// Retry caps. In-run: 1 + 2 retries. Cross-run: after this many failed runs a
// lead is parked permanently (tagged personalize-failed) and an alert fires.
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_PERSONALIZE_RUNS = 2;
```

Loop body (replacing lines 993-1084):

```typescript
      // Step 5-6: Generate + validate, with bounded in-run retry reusing the scrape.
      let drafts: GeminiDraftOutput | undefined;
      let validationErrors: string[] = [];
      let retryFeedback: string | undefined;
      let rateLimited = false;
      let hardGeminiError: string | undefined;

      for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
        const prompt = buildPrompt(lead, scrapedContent, seasonal, retryFeedback);
        const geminiResult = await gemini.generateDrafts(prompt);
        leadResult.geminiTokensUsed += geminiResult.tokensUsed;

        if (geminiResult.isRateLimited) {
          rateLimited = true;
          break;
        }
        if (geminiResult.error || !geminiResult.drafts) {
          hardGeminiError = geminiResult.error ?? "no drafts returned";
          break;
        }

        const candidate = sanitizeDrafts(geminiResult.drafts);

        // CASL block is terminal — no retry can fix a do-not-contact site.
        if (!candidate.casl_opt_out_check) {
          logger.warn("CASL block — prospect website has do-not-contact", {
            taskId: lead.taskId,
            company: lead.companyName,
          });
          if (!config.dryRun) {
            await clickup.addTag(lead.taskId, "casl-block");
            await clickup.updateTask(lead.taskId, { status: "Enriched" });
          }
          leadResult.tagsAdded.push("casl-block");
          leadResult.status = "casl_blocked";
          result.results.caslBlocked += 1;
          result.leads.push(leadResult);
          result.leadsProcessed += 1;
          drafts = undefined;
          validationErrors = [];
          hardGeminiError = undefined;
          break;
        }

        validationErrors = validateDrafts(candidate, lead);
        validationErrors.push(
          ...findForbiddenSeasonMentions(
            [
              candidate.email_touch_1_body,
              candidate.email_touch_2_body,
              candidate.email_touch_3_body,
              candidate.email_touch_1_subject,
              candidate.email_touch_2_subject,
              candidate.email_touch_3_subject,
              candidate.linkedin_message,
            ],
            seasonal
          )
        );

        if (validationErrors.length === 0) {
          drafts = candidate;
          break;
        }

        logger.warn("Draft validation failed — retrying", {
          taskId: lead.taskId,
          company: lead.companyName,
          attempt,
          errors: validationErrors,
        });
        retryFeedback = validationErrors.join("; ");
        drafts = undefined; // keep last-failed drafts out of writeback
      }

      // Rate limit: defer the whole remaining batch (unchanged behavior).
      if (rateLimited) {
        logger.warn("Gemini 429 — deferring remaining batch", {
          taskId: lead.taskId,
          company: lead.companyName,
        });
        if (!config.dryRun) {
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.status = "deferred";
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        const currentIndex = batch.indexOf(task);
        result.deferredRemaining = batch.length - currentIndex - 1;
        await alerter.send(
          "Gemini rate limit — personalization batch deferred",
          `Rate limited after processing lead ${lead.companyName}. ${result.deferredRemaining} leads deferred to next run.`
        );
        break;
      }

      // Hard Gemini error (transport/safety/parse): existing single-run failure path.
      if (hardGeminiError) {
        logger.error("Gemini generation failed", {
          taskId: lead.taskId,
          company: lead.companyName,
          error: hardGeminiError,
        });
        if (!config.dryRun) {
          await clickup.addTag(lead.taskId, "generation-failed");
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.tagsAdded.push("generation-failed");
        leadResult.status = "generation_failed";
        leadResult.error = hardGeminiError;
        result.results.generationFailed += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      // CASL-blocked lead already recorded inside the loop.
      if (leadResult.status === "casl_blocked") {
        continue;
      }

      // Validation still failing after all in-run attempts -> cross-run cap.
      if (!drafts) {
        const runsSoFar = crossRunAttemptCount(task.tags);
        logger.error("Draft validation failed after all retries", {
          taskId: lead.taskId,
          company: lead.companyName,
          runsSoFar,
          errors: validationErrors,
        });
        leadResult.status = "generation_failed";
        leadResult.error = `Validation: ${validationErrors.join("; ")}`;
        result.results.generationFailed += 1;

        if (runsSoFar >= MAX_PERSONALIZE_RUNS) {
          if (!config.dryRun) {
            await clickup.addTag(lead.taskId, "personalize-failed");
            await clickup.updateTask(lead.taskId, { status: "Enriched" });
          }
          leadResult.tagsAdded.push("personalize-failed");
          await alerter.send(
            "Personalization permanently failed for a lead",
            `${lead.companyName} failed validation across ${runsSoFar} runs and is parked (tag personalize-failed). Last errors: ${validationErrors.join("; ")}`
          );
        } else {
          if (!config.dryRun) {
            await clickup.addTag(lead.taskId, `personalize-attempt-${runsSoFar + 1}`);
            await clickup.addTag(lead.taskId, "generation-failed");
            await clickup.updateTask(lead.taskId, { status: "Enriched" });
          }
          leadResult.tagsAdded.push(`personalize-attempt-${runsSoFar + 1}`, "generation-failed");
        }
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }
```

Everything after this point (the `// Step 7: Write results back to ClickUp` block, line 1086 onward) uses `drafts`, which is now the validated, sanitized output — no change needed there. Verify the old standalone 429 block, Gemini-error block, CASL block, `sanitizeDrafts` call, and validation block (old lines 993-1084) are fully removed and not duplicated.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all files, including the new retry/cap cases and every pre-existing personalization test.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/index.ts tests/personalization.test.ts
git commit -m "feat(personalize): capped in-run retry + cross-run park with alert"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass, no type errors. Confirm the pre-existing test count did not shrink (no tests silently deleted) and the new describe blocks appear in the output.

- [ ] **Step 2: Grep for leftover contradictions**

Run: `grep -n "mockup\|catalog" src/index.ts`
Expected: only the `NONEXISTENT_COLLATERAL_RE` guard and its error string / instruction 7's prohibition remain — no instruction telling the model to *offer* a mockup or catalog.

Run: `grep -rn "Get ready for the season\|back to school\|Back to school" src/ wiki/topics/seasonal-playbook.md`
Expected: no stale calendar phrasing in `src/`; the wiki reflects the revised 4-quarter calendar only.

- [ ] **Step 3: Confirm the reported bug is fixed (manual reasoning check)**

`resolveSeasonalContext(new Date("2026-07-22"))` returns `sellingSeason: "fall"`, `forbiddenSeasons: ["spring","summer","winter"]`. A draft saying "ready for the upcoming spring season" now fails `findForbiddenSeasonMentions` and triggers a regenerate. Confirm the Task 1 test `"July sells fall"` and the Task 3 assertion `"injects the resolved selling season"` both cover this.

---

## Self-Review

**Spec coverage:**
- Section 1 (seasonality): Task 1 (resolver + guard), Task 3 (prompt injection + loop validation). ✓ BC 4-quarter calendar with per-period forbidden seasons. ✓
- Section 2 (product scope): Task 2 (`PRODUCT_NOUN_RE`, `PRICE_RE`, fixture clean), Task 3 (prompt vocab removal, quote CTA, instruction 7 rewrite). ✓
- Section 3 (retry mechanics): Task 4 (in-run retry reusing scrape, feedback prompt, cross-run cap, park + alert, 429 not retried, eligibility exclusion). ✓
- "Segment focus not injected into per-lead prompt": the season block in Task 3 deliberately omits `segmentFocus`. ✓
- "Schools out of scope": handled at the wiki/spec level already; no code path added (socialProofMap `School` branch intentionally left in place per spec). ✓
- Testing (all four pure units): `resolveSeasonalContext`, `PRODUCT_NOUN_RE`, `PRICE_RE`, retry-prompt feedback all have tests. ✓

**Placeholder scan:** No TBD/TODO. All steps carry concrete code and exact commands. ✓

**Type consistency:** `SeasonalContext` fields (`period`, `sellingSeason`, `forbiddenSeasons`, `theme`, `segmentFocus`) are used identically in `seasonality.ts`, `buildPrompt`, and the loop. `crossRunAttemptCount(tags)` takes `Array<{name}>`, matching `task.tags`. `buildPrompt` 4-arg signature is consistent across Task 3 tests and the Task 4 loop call. `MAX_GENERATION_ATTEMPTS` / `MAX_PERSONALIZE_RUNS` named consistently. ✓
