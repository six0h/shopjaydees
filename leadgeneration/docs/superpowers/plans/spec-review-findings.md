# Design Spec — Adversarial Review Findings

**Reviewed**: 2026-06-08
**Spec**: `docs/superpowers/specs/2026-05-20-lead-generation-system-design.md`
**Reviewer**: SixOhQuad (Cody + Claude)

---

## Summary

22 findings across 4 severity levels. **All 22 resolved** across two sessions.

- 6 blockers → resolved (session 1: #1, #2, #5, #6; session 2: #3, #4)
- 6 underspecified → resolved (session 2: #7-12; #10 and #11 resolved by ClickUp data model)
- 8 gaps → resolved (session 2: #13-20)
- 2 contradictions → resolved (session 2: #21-22)

**Resolution documents:**
- `specs/2026-06-08-clickup-data-model.md` — resolves #3 (data model), #10 (reply tracking), #11 (dedup)
- `specs/2026-06-08-api-contracts.md` — resolves #4 (API contracts)
- `specs/2026-06-08-spec-review-resolutions.md` — resolves #7-9, #12-22

---

## BLOCKERS — Can't build without resolving these

### 1. Hunter.io doesn't do what Stage 1 claims

The spec says the owner uses Hunter.io to "search for target companies by domain, industry, and geography." But Hunter.io's Domain Search requires you to *already know the company's domain*. It finds email addresses *at a known domain* — it doesn't discover companies by industry or geography.

The targeting tables (Section 2) describe industry/geo searches that Hunter.io can't do. The owner needs a *discovery* step before Hunter.io: Google Maps, business directories, school district websites, league websites, etc. to build a list of domains. Then Hunter.io enriches those domains.

**Impact**: Changes the owner's workflow and time commitment. The pipeline diagram needs a new step. The targeting tables need rewriting to describe how to find domains, not how to search Hunter.io.

### 2. Cold email tool decision is still unmade

"Instantly or Smartlead" appears throughout. The APIs are completely different, pricing differs, and the integration code changes entirely depending on the choice.

**Impact**: Blocks send agent implementation, sequence management design, and reply tracking integration.

### 3. ClickUp data model is undefined

The agents read from and write to ClickUp constantly, but there's no schema:
- What Space/Folder/List structure?
- What custom fields on a lead task? (segment, score, company domain, decision-maker name, title, email, enrichment data, draft messages, approval status...)
- Where do draft messages live — custom fields? Comments? Subtasks?
- What statuses map to the pipeline stages?
- What ClickUp plan tier is assumed? (API rate limits and custom field limits vary)

**Impact**: Blocks all agent development. Every agent reads/writes ClickUp — the data model is the foundation.

### 4. No API contracts between agents

The personalization agent reads from ClickUp and writes drafts back. The send agent reads approved drafts and sends them. Neither has a defined input/output schema.

**Impact**: Can't implement either agent without knowing the data shape.

### 5. CASL compliance is not addressed

CASL (Canada's Anti-Spam Legislation) is one of the strictest anti-spam laws in the world. Cold commercial email requires either prior consent or falls under narrow exemptions (like the "conspicuous publication" exemption for B2B email found on public websites). The spec doesn't mention compliance at all.

CASL violations carry penalties up to $10M per violation. At minimum, the spec needs to document: which exemption applies, what the unsubscribe mechanism is, and how consent records are maintained.

**Impact**: Legal risk. Could block the entire cold email channel if no valid exemption applies.

### 6. Email warmup and sending domain setup are missing

Cold email tools require 2-4 weeks of domain warmup before you can send at volume without landing in spam. The spec doesn't address whether ShopJaydees needs a separate sending domain (e.g., `mail.shopjaydees.com` or `shopjaydees.co`) to protect the main domain's reputation.

**Impact**: Affects implementation timeline (warmup adds 2-4 weeks before real sends can start) and requires domain/DNS setup that the owner needs to action.

---

## UNDERSPECIFIED — Workable but needs detail before coding

### 7. Website scraping is mentioned but not architected

Section 3 says the agent scrapes "the homepage of the prospect's website" before drafting — but this step doesn't appear in the pipeline diagram, there's no tool specified, and there's no error handling for: sites behind Cloudflare, Facebook-only businesses with no website, domains that don't resolve, rate limiting.

**Needs**: Tool choice, fallback behavior when scraping fails, how scraped content is stored/cached.

### 8. Sequence state management is unclear

When the send agent sends Touch 1, who/what tracks that Touch 2 should go out on Day 4? Does the cold email tool manage the sequence natively (Instantly does), or does ClickUp need to track sequence state and the send agent fires each touch individually?

**Needs**: Decision on whether sequences are managed by the cold email tool or by ClickUp + the send agent.

### 9. Hunter.io to ClickUp import mechanism is unspecified

How do enriched contacts get from Hunter.io into ClickUp? Manual CSV export/import? API sync? Copy-paste?

**Needs**: Defined workflow — manual or automated, with steps.

### 10. Reply tracking flow is hand-wavy

"Tracks opens, replies, and engagement" with "warm responses flagged" — but how do engagement events flow from the cold email tool back into ClickUp? Webhook? Polling? Does the system stop remaining sequence touches when someone replies?

**Needs**: Integration approach (webhook vs polling), status update logic, sequence cancellation on reply.

### 11. Deduplication approach is undefined

"Owner deduplicates against existing ClickUp contacts" — how? Manual eyeball check? Lookup by email/domain before import? At 50-150 prospects/week, manual dedup is a time sink.

**Needs**: Dedup key (email? domain?), mechanism (automated check vs manual), and where it runs.

### 12. Agent trigger and scheduling details are thin

Cloud Scheduler triggers Cloud Functions — but what's the exact trigger? HTTP? Pub/Sub? What time of day? What happens if the function times out mid-batch? Retry strategy?

**Needs**: Trigger type, schedule times, timeout handling, retry/idempotency strategy.

---

## GAPS — Things that will bite you in weeks 2-4

### 13. Social proof statements need fact-checking

"We work with over 100 schools" — is this accurate? "We've helped teams raise thousands through apparel-based fundraising" — verified? These are going in cold outreach emails. If aspirational rather than factual, that's a credibility risk.

### 14. Dormancy re-engagement has no mechanism

"Lead goes dormant for 90 days, can re-enter with a different angle" — who triggers re-evaluation? Automated check at 90 days? Or just "maybe someday the owner goes back through old leads"?

### 15. "I know this person" warm intro path is undefined

The review gate lets the owner flag a lead as known — but what changes? Different messaging? Different sequence? Great idea with no implementation detail.

### 16. No testing strategy

How do we validate the pipeline before sending real outreach? Test leads with your own email addresses? Dry-run mode? Staging vs. production distinction?

### 17. No error handling or failure modes

What happens when Hunter.io API is down? ClickUp API rate-limited? Gemini returns garbage? A send fails? No error handling strategy defined.

### 18. LinkedIn volume may be risky

"20-40 connection requests/week" is within LinkedIn's limits, but if acceptance rate is low, LinkedIn can restrict the account. The health signals table notes this but doesn't define a circuit breaker.

### 19. Metrics tracking mechanism is undefined

"Tracked weekly" — where? ClickUp dashboard? Spreadsheet? The spec defines what to measure but not how data gets aggregated or viewed.

### 20. Owner time budget may be unrealistic

The spec says 15-20 min/day. But the owner is also: doing Hunter.io prospecting sessions (now with a discovery step first), reviewing 10-20 drafts, sending LinkedIn messages manually, and following up on warm leads. That adds up to more than 20 minutes, especially early on.

---

## CONTRADICTIONS / INCONSISTENCIES

### 21. Volume math doesn't add up

50-150 raw prospects/week -> 20-80 sends/week implies ~50% pass rate. But the spec says only 3+ scores proceed (most should score 3+) and targets 80%+ approval rate. If most leads score 3+ and 80% are approved, the conversion should be higher than 50%. Either the volume targets are off, or the scoring is expected to filter more aggressively than stated.

### 22. "Enrichment rate below 40%" health signal

If Hunter.io can't find contacts for 60% of the domains, the owner is wasting significant prospecting time. The spec treats this as a tuning knob, but for small local businesses in BC, Hunter.io's coverage may genuinely be low. This could be a fundamental limitation, not a parameter to adjust.
