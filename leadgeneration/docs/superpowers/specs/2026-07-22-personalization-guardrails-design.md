# Personalization Guardrails: Seasonality, Product Scope, and Retry

**Date:** 2026-07-22
**Owner:** Cody
**Status:** Approved, ready for planning

## Problem

The personalization agent ("Ellie") produces two classes of prospect-facing errors that reach Jenn's review queue:

1. **Invented products.** She offers to show people specific products that don't exist. The prompt has no allowed-product vocabulary and only one hard guard (a `catalog|catalogue` regex). Everything else she names is unpoliced. Root cause: the prompt itself hands her a product list (`"branded apparel — uniforms, spirit wear, team gear, corporate swag"`) and instruction 7 tells her to offer "a mockup of their logo on a product" — actively inviting product invention.

2. **Wrong season.** She asked a prospect if they were ready for "the upcoming spring season" in July. Root cause: `buildPrompt()` never passes the current date, so the model guesses the time of year from training data. The wiki seasonal playbook (`wiki/topics/seasonal-playbook.md`) exists but was never wired into the prompt.

A third, pre-existing defect surfaced while scoping: **there is no retry loop and no attempt cap.** A validation failure tags `generation-failed`, resets the lead to `Enriched`, and the lead is re-picked on a later run — re-scraping and re-generating every cycle, forever, silently (`src/index.ts:1063-1078`). Adding more hard guards on top of this would multiply the bounce. The retry mechanics must be fixed as part of this work.

## Decisions (locked)

- **Product scope: zero product talk.** Ellie offers "custom apparel" / "branded apparel" as a service and never names any product, category, garment, style, fabric, colour, or price. `spirit wear`, `team gear`, `hoodies` are all out.
- **The offer: no-obligation quote.** The concrete CTA is a quote. Ellie must never state or estimate a price herself.
- **Season calendar: the wiki playbook** (`wiki/topics/seasonal-playbook.md`) is the single source of truth. It is already lead-time shifted — its June–July row reads "Lock in your fall order early", so applied today it correctly says fall.
- **Enforcement: hard-fail all three** new guard classes (product nouns, prices, out-of-period season words), same mechanism as the existing catalog guard: a hit fails validation and forces a regenerate.
- **Retry is capped:** 2 in-run retries (3 generate calls max per lead), then a cross-run cap after which the lead parks in a terminal failure state and fires an ntfy alert.
- **Gemini billing is a non-issue:** the account is on auto top-up (confirmed 2026-07-22), so retries multiplying generate calls carries no depletion risk. The 429 path is unchanged regardless.

## Section 1 — Seasonality

New pure module `src/seasonality.ts`:

```ts
resolveSeasonalContext(now: Date): SeasonalContext
```

`SeasonalContext = { period, theme, segmentFocus, sellingSeason, forbiddenSeasons }`.

- The five-period table lives as a `const` in this file, mirroring `wiki/topics/seasonal-playbook.md`, with a comment naming the wiki as source of truth.
- Pure and date-injected: tests pin `new Date("2026-07-22")` and assert `fall` without waiting for the calendar. Tests cover all five period boundaries.

| Period | Segment focus | Theme | Selling season |
| --- | --- | --- | --- |
| Mar–May | Teams, trades | Get ready for the season | (per period) |
| Jun–Jul | Schools, businesses | Lock in your fall order early | fall |
| Aug–Sep | Schools, teams | Back to school, back to the field | fall |
| Oct–Nov | Businesses | Year-end gear and appreciation | winter |
| Dec–Feb | Schools, businesses | New year, fresh look | spring |

(Selling-season/forbidden-season values are finalized during planning against the table; the point is they are derived in code, never inferred by the model.)

`buildPrompt()` takes `SeasonalContext` as a new argument and injects:

```
TODAY'S DATE: 2026-07-22
CURRENT SELLING PERIOD: June to July
THEME: Lock in your fall order early
SEGMENT FOCUS: Schools, businesses
You are selling into the FALL season. Lead times mean buyers order
6-10 weeks ahead, so you are always talking about the season that is
coming, never the one happening now.
NEVER reference: spring, summer, winter, or the current season as if
it were upcoming.
```

`forbiddenSeasons` is derived from the period and drives a validator (Section 3) that rejects any prospect-facing field naming one.

**Accepted trade-off:** a blunt word-match on "summer" also kills innocent filler like "hope you're enjoying the summer". That register of filler is already banned by the anti-AI-tells section, so the loss is acceptable.

## Section 2 — Product scope

Three coordinated prompt/validator changes:

1. **Remove the product vocabulary from the prompt.** Line ~616's `"branded apparel — uniforms, spirit wear, team gear, corporate swag"` becomes `"custom apparel for businesses, schools, and teams."` Segment varies the *message*, not the product.

2. **Replace instruction 7** (catalog + mockup) with a single collateral+product+price rule:
   > Never name a specific product, garment, style, fabric, colour, or price. You sell *custom apparel* — that is the most specific you may ever be. If you want to offer something concrete, offer a no-obligation quote. Never state or estimate a price yourself.

3. **Two new validators**, alongside the retained `NONEXISTENT_COLLATERAL_RE`:
   - `PRODUCT_NOUN_RE` — a **denylist** of ~30 nouns a model reaches for: hoodie, tee/t-shirt, polo, quarter-zip, jersey, cap/hat, toque, jacket, sweatshirt, crewneck, softshell, vest, lanyard, tote, mug, spirit wear, team gear, swag, uniform, embroidery, screen print. Extended by adding a word when Jenn flags one — same maintenance model as the catalog guard. Gaps on day one are acceptable; it is strictly better than the current zero coverage.
   - `PRICE_RE` — **currency-anchored only**: `$`, "dollars", "per unit", "/unit", "per shirt", "each". Deliberately **not** bare numbers — the Business social-proof string ("12 to 250+ employees") is legitimately numeric and would false-positive on every corporate draft.

All new validators run in the same `validateDrafts` pass over the same prospect-facing fields as the catalog guard.

## Section 3 — Retry mechanics

**In-run retry, reusing the scrape.** `scrapedContent` is already in hand on a validation failure, so no new Firecrawl scrape is needed. On failure, retry `generateDrafts` in-process **up to 2 extra times** (3 generate calls max), feeding the specific validation errors back as corrective instruction:

```
YOUR PREVIOUS DRAFT WAS REJECTED:
- draft names a product ("quarter-zips")
- touch 2 references "spring"; the selling season is fall
Rewrite all touches. Fix these specifically.
```

This converts most guard trips into self-correction inside one run, costing a Gemini call rather than a full scrape+generate cross-run cycle. The retry-prompt builder is a pure function and is unit-tested.

**Cross-run cap.** If all 3 attempts fail, existing behavior holds (tag `generation-failed`, reset to `Enriched`) **plus** an escalating attempt tag (`personalize-attempt-2`, `-3`) so a lead failing across runs is visible and bounded. At the cross-run cap the lead parks in a terminal failure state and fires an ntfy alert instead of bouncing forever. This retroactively fixes the current silent infinite loop, independent of the new guards.

**Hard constraints:**
- Retries must **not** fire on 429. That path already defers the whole batch and must keep doing so — 429 is rate-limit, not a validation failure.
- Retries consume the personalize self-drain budget (1800s in-process), so a run may drain fewer leads. Accepted: bad copy reaching Jenn is worse than lower throughput.

## Testing

All four new units are pure functions, testable without network:
- `resolveSeasonalContext` — pinned dates across all five period boundaries.
- `PRODUCT_NOUN_RE`, `PRICE_RE` — both directions: "custom apparel" passes, "our tri-blend hoodies" and "$28/unit" fail.
- retry-prompt builder — given errors, emits the corrective block.

Guard tests assert the season validator both ways: in-period season word passes, forbidden season word fails.

## Out of scope

- No allowlist-based product validation (English can't be enumerated; denylist is the deliberate choice).
- No change to the 429 deferral path.
- No unrelated refactoring of the personalize loop beyond the retry/cap wiring.
