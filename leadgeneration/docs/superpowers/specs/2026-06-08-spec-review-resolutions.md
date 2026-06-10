# Design Spec — Adversarial Review Resolutions

**Date**: 2026-06-08
**Spec**: `docs/superpowers/specs/2026-05-20-lead-generation-system-design.md`
**Findings**: `docs/superpowers/plans/spec-review-findings.md`

---

## Status Summary

| # | Finding | Severity | Status | Resolution Location |
|---|---------|----------|--------|---------------------|
| 1 | Hunter.io Discover vs Domain Search | Blocker | Resolved | Session 1 — Hunter.io has geography/headcount/industry filters via Discover |
| 2 | Cold email tool decision | Blocker | Resolved | Session 1 — Instantly Growth ($37.60/mo) + Zapier Starter ($19.99/mo) |
| 3 | ClickUp data model undefined | Blocker | Resolved | `specs/2026-06-08-clickup-data-model.md` — 53 fields, 13 statuses, 8 automations, 6 Zapier zaps |
| 4 | No API contracts between agents | Blocker | Resolved | `specs/2026-06-08-api-contracts.md` — full input/output schemas for all components |
| 5 | CASL compliance not addressed | Blocker | Resolved | Session 1 — conspicuous publication exemption, Instantly handles unsubscribe/suppression |
| 6 | Email warmup and sending domain missing | Blocker | Resolved | Session 1 — shopjaydees.ca/.net sending domains, 3-4 week warmup, Google Workspace |
| 7 | Website scraping not architected | Underspecified | Resolved | Section 1 below |
| 8 | Sequence state management unclear | Underspecified | Resolved | Section 2 below |
| 9 | Hunter.io → ClickUp import unspecified | Underspecified | Resolved | Section 3 below |
| 10 | Reply tracking flow hand-wavy | Underspecified | Resolved | ClickUp data model Section 8 — 6 Zapier zaps cover all engagement events |
| 11 | Deduplication approach undefined | Underspecified | Resolved | ClickUp data model Section 7 — domain-based dedup with closed-status inclusion |
| 12 | Agent scheduling details thin | Underspecified | Resolved | Section 4 below |
| 13 | Social proof needs fact-checking | Gap | Resolved | Section 5 below |
| 14 | Dormancy re-engagement no mechanism | Gap | Resolved | Section 6 below |
| 15 | Warm intro path undefined | Gap | Resolved | Section 7 below |
| 16 | No testing strategy | Gap | Resolved | Section 8 below |
| 17 | No error handling or failure modes | Gap | Resolved | Section 9 below |
| 18 | LinkedIn circuit breaker missing | Gap | Resolved | Section 10 below |
| 19 | Metrics tracking mechanism undefined | Gap | Resolved | Section 11 below |
| 20 | Owner time budget may be unrealistic | Gap | Resolved | Section 12 below |
| 21 | Volume math doesn't add up | Contradiction | Resolved | Section 13 below |
| 22 | Hunter.io coverage assessment | Contradiction | Resolved | Section 14 below |

---

## 1. Website Scraping Architecture (#7)

### Decision

Use **Firecrawl's `/scrape` endpoint** (REST API). Firecrawl handles JS rendering, Cloudflare bypass, and returns clean markdown — a good fit for the WordPress/Squarespace sites that dominate this prospect pool.

### Pages to Scrape

Scrape **up to 3 pages per prospect**, in order:

1. **Homepage** (Company Domain URL) — always attempted
2. **About page** — only if the homepage markdown contains a link matching `/about`, `/about-us`, `/our-story`, `/our-team`
3. **Community/sponsorship page** — only if homepage or about page links match `/community`, `/giving`, `/sponsor`, `/charity`, `/involvement`

The agent does NOT crawl the full site. It scrapes the homepage, parses returned markdown for internal links matching the above patterns, and fetches at most 2 more pages.

### Extraction

Each page's markdown is sent to Gemini 2.5 Flash with a structured extraction prompt. The LLM extracts:

| Extracted Data | Stored In (ClickUp Field) |
|----------------|---------------------------|
| Business summary, services, brand feel, team size signals | Website Scrape Summary |
| Sponsorships, charity work, community events, causes | Community Signals |
| Recent news, seasonal relevance, growth signals | Personalization Hooks |
| Anti-solicitation notices ("do not contact") | CASL Opt-Out Check (unchecked if found) |

### Firecrawl Configuration

```json
{
  "url": "{company_domain}",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "waitFor": 3000,
  "timeout": 15000
}
```

Retry once at 30,000ms timeout on first timeout failure.

### Fallback Chain

```
1. Attempt Firecrawl scrape
   SUCCESS → extract data via Gemini, scrape additional pages if links found
   FAIL → categorize:

   a. Domain does not resolve (no website):
      → Website Scrape Summary = "No website found"
      → Proceed with Hunter.io data only (minimal-context template)
      → Tag "no-scrape"

   b. Scrape blocked (Cloudflare, 403, CAPTCHA):
      → Website Scrape Summary = "Website blocked scraping"
      → Same minimal-context path
      → Log domain in task comment for manual review

   c. Timeout (after retry):
      → Same as (b)

   d. Firecrawl API rate limited (429) or down (500):
      → Do NOT process this lead — leave as "Enriched"
      → Stop processing remaining leads in batch
      → Log: "Firecrawl rate limit hit — {N} leads deferred to next run"
```

**Key principle: scrape failure never blocks lead processing.** Templates have a "minimal context" variant that works with Hunter.io data alone.

### Storage

Extracted data stored directly in ClickUp custom fields. No separate cache, no raw markdown storage. On re-personalization (rejection or dormancy re-engagement), the website is re-scraped.

### Rate Limiting

- 2-second delay between scrape calls to different domains
- Max 15 prospects per daily run × 3 pages = 45 scrapes max per run
- Firecrawl Starter plan: 3,000 credits/month — sufficient for expected volume (120-1,200 scrapes/month)

### Cost

Firecrawl Starter: **$19/mo** (client-paid third-party cost). Updates the tool cost estimate from $66-95 to **$85-114 USD/mo**.

---

## 2. Sequence State Management (#8)

### Decision: Instantly Manages Sequences Natively

Instantly drives all send timing. The send agent adds a lead to an Instantly campaign once with all 3 touches defined, and Instantly handles Day 4 / Day 9 sends automatically. ClickUp tracks sequence state via Zapier for visibility but never drives timing.

### Why

1. Instantly Growth plan includes multi-step sequences with configurable delays — this is core functionality
2. Instantly handles automatic pause on reply/bounce/unsubscribe atomically — no race conditions
3. Send agent fires once per lead, not three times — simpler agent, fewer failure modes
4. The 6 Zapier zaps in the ClickUp data model are already designed as reactive listeners, not drivers

### Data Flow

**Send agent (once per lead, at campaign creation):**

```
1. Read from ClickUp: Contact Email, Contact Name, Email Touch 1/2/3 (body + subject)
2. Call Instantly API: Create lead in campaign with 3-step sequence:
   - Step 1: Touch 1, send immediately (next available slot)
   - Step 2: Touch 2, delay = 4 days after Step 1
   - Step 3: Touch 3, delay = 5 days after Step 2 (Day 9 total)
3. Write back to ClickUp:
   - Instantly Campaign ID, Instantly Lead ID
   - Sending Domain (round-robin shopjaydees.ca / shopjaydees.net)
   - Sequence Status = "Not Started"
   - Status → "Outreach Active"
4. Agent is done with this lead. Never touches it again for sequence purposes.
```

**Instantly handles all subsequent sends (no agent involvement):**

```
Day 0: Touch 1 sent → Zapier Zap 1 → ClickUp: Sequence Status = "Touch 1 Sent"
Day 4: Touch 2 sent → Zapier Zap 1 → ClickUp: Sequence Status = "Touch 2 Sent"
Day 9: Touch 3 sent → Zapier Zap 1 → ClickUp: Sequence Status = "Touch 3 Sent"
After: Sequence complete → Zapier Zap 6 → ClickUp Automation 5 → Dormant (if no replies)
```

**Engagement events (any time, handled by Instantly + Zapier + ClickUp automations):**

| Event | Instantly Action | Zapier Update | ClickUp Automation |
|-------|-----------------|---------------|-------------------|
| Reply | Pauses remaining touches | Replies += 1, Last Reply Date = today | Automation 4: Status → "Responded - Owner Follow-up" |
| Bounce | Stops sequence | Bounced = checked | Automation 2: Status → "Bounced" |
| Unsubscribe | Stops sequence | Unsubscribed = checked | Automation 3: Status → "Unsubscribed" |
| Open | — | Opens += 1, Last Open Date = today | — |

### What Sequence Status Is

A **visibility/reporting field**, not a control field. Nothing reads it to decide what to do next. Instantly decides sends; ClickUp automations decide status transitions based on Replies, Bounced, and Unsubscribed fields. Sequence Status exists so the owner can see where each lead is in the Active Outreach view.

### Edge Cases

- **Owner edits a draft after approval but before send agent runs**: Agent reads current field values — picks up the edit. No issue.
- **Owner wants to edit after push to Instantly**: Not possible without pulling from Instantly. The approval gate catches content issues before send.
- **Instantly delays Touch 1 past Day 0**: Instantly sends within its daily window. Day 4/9 delays are relative to actual Touch 1 send, not agent push time.
- **Zapier fails to update ClickUp**: Visibility issue only — Instantly still sends correctly. Zapier has built-in 3-attempt retry. Weekly manual check for leads stuck in "Outreach Active" > 14 days catches orphans.

---

## 3. Hunter.io → ClickUp Import Workflow (#9)

### Decision: Fully Automated Discovery Agent

A Cloud Function ("Discovery Agent") queries Hunter.io Discover API based on Prospecting Requests that Jenn creates in ClickUp. No web form, no domain pasting, no manual import.

### How It Works

1. **Jenn creates a Prospecting Request** in ClickUp: picks Segment, Category, City from dropdowns (e.g., "Schools — Elementary & Secondary in Langley")
2. **Discovery Agent** (daily at 4 AM Mon-Fri) picks up tasks with status "Requested"
3. Agent queries **Hunter.io Discover** with the matching parameters (industry, geography, company size)
4. For each result:
   - **Dedup check** against existing Prospects list (domain-based, includes closed tasks)
   - **Create lead** in Prospects list with all Hunter.io data populated
   - **Auto-score** using the lead scoring rubric (segment fit, decision-maker quality, email confidence, geography match)
5. Score 3+ → status set to **"Enriched"** (enters personalization pipeline automatically)
6. Score 1-2 → status set to **"Parked"**
7. Agent updates the Prospecting Request task with a results summary (X found, Y created, Z parked, W duplicates)

### What Jenn Does

Creates targeting requests when she wants to explore new segments or geographies. Takes ~2 minutes per request. She can create multiple requests at once (e.g., "Trades in Surrey", "Schools in Langley", "Teams in Abbotsford").

### What Jenn Does NOT Do

She never touches Hunter.io, never pastes domains, never manually scores leads. She sees leads for the first time in the Approval Queue when drafts are ready for review.

### Discovery Agent Flow (Cloud Function)

```
For each Prospecting Request in "Requested" status:

  1. PARSE REQUEST
     Read Segment, Category, City from task custom fields
     Map to Hunter.io Discover API parameters (industry, location, company_size)

  2. HUNTER.IO DISCOVER
     GET https://api.hunter.io/v2/domain-search?type=discover
       &industry={industry}&city={city}&state=BC&country=CA
       &api_key={key}

     Returns: list of companies with domain, name, industry, headcount,
     and contacts with name, title, email, confidence score, LinkedIn URL,
     phone, source URLs

  3. FOR EACH RESULT — DEDUP CHECK
     GET /list/{list_id}/task?custom_fields=[{field_id: company_domain_id,
       operator: "=", value: domain}]&include_closed=true

     - No match → proceed to lead creation
     - Match + same email → skip (count as "Duplicate")
     - Match + different email → proceed but tag "possible-duplicate"

  4. CONTACT SELECTION
     Select best decision-maker by title priority:
     Owner > President > CEO > Principal > Director > Manager > Coordinator
     Then by highest email confidence score.

  5. AUTO-SCORING
     Apply lead scoring rubric automatically:
     - Segment fit (category match to request)
     - Decision-maker quality (title rank + email confidence)
     - Geography match (Phase 1-3 mapping)
     - Company size signals
     Score 3+ → "Enriched" | Score 1-2 → "Parked"

  6. CLICKUP TASK CREATION
     POST /list/{list_id}/task
     - Task name: "{Company Name} — {Contact Name}"
     - Status: "Enriched" or "Parked" (based on auto-score)
     - Custom fields: 11 contact/company, 3 qualification,
       Lead Score, Score Rationale (auto-generated),
       CASL Source URL, Import Batch (auto-generated from request),
       Geographic Phase (auto-mapped)

     If "possible-duplicate": add tag + comment linking existing task

  7. UPDATE PROSPECTING REQUEST
     Post comment: "Results: X found, Y created (Z enriched, W parked),
       N duplicates skipped, M no contacts"
     Set status: "Completed"
```

### Geographic Phase Auto-Mapping

| City | Geographic Phase |
|------|-----------------|
| Surrey, Langley, Abbotsford, Chilliwack, Mission, Maple Ridge | Phase 1 - Fraser Valley Core |
| Burnaby, New Westminster, Coquitlam, Port Coquitlam, Pitt Meadows | Phase 2 - Tri-Cities & Burnaby |
| Richmond, Delta, North Vancouver, Vancouver | Phase 3 - Metro Vancouver |
| Other | Future - Rest of BC+ |

### Hunter.io API Quota Note

Hunter.io Starter allows 500 requests/month. The Discovery Agent consumes these requests automatically, so quota monitoring is more important than it would be with manual searches — the agent could burn through requests faster than a human would. Monitor usage from day one; upgrade to Growth ($89/mo) if consistently exceeding.

---

## 4. Agent Scheduling (#12)

### Decision: HTTP-Triggered Cloud Functions via Cloud Scheduler

HTTP triggers (HTTPS POST) for all scheduled tasks. Simpler than Pub/Sub — no fan-out, no multi-subscriber pattern, single caller (Cloud Scheduler).

### Schedule Configuration

| Agent | Cron Expression | Time (Pacific) | Rationale |
|-------|----------------|----------------|-----------|
| Discovery | `0 4 * * 1-5` | 4:00 AM Mon-Fri | Runs before personalization (5 AM) so new leads are ready for same-day personalization |
| Personalization | `0 5 * * 1-5` | 5:00 AM Mon-Fri | Drafts ready by owner's morning review |
| Send | `0 9 * * 1-5` | 9:00 AM Mon-Fri | After owner's review window; business-hours send for better open rates |
| Dormancy check | `0 6 * * 0` | 6:00 AM Sunday | Weekly. Reactivated leads ready for Monday's personalization run |

### Cloud Function Configuration

| Setting | Discovery | Personalization | Send | Dormancy |
|---------|-----------|----------------|------|----------|
| Runtime | Node.js 20 | Node.js 20 | Node.js 20 | Node.js 20 |
| Memory | 512 MB | 512 MB | 256 MB | 256 MB |
| Timeout | 540s (9 min) | 540s (9 min) | 300s (5 min) | 120s (2 min) |
| Max instances | 1 | 1 | 1 | 1 |
| Concurrency | 1 | 1 | 1 | 1 |

### Batch Sizes

| Agent | Batch Size | Rationale |
|-------|-----------|-----------|
| Personalization | 15 leads/run | At ~30-45s per lead (scrape + generate), 15 leads = 7.5-11 min. If queue has more, they wait for next day. |
| Send | No hard limit | Send operations are fast (5-10s each). Even 50 leads finish in < 5 min. |
| Dormancy | No limit | 0-5 leads per week. Trivial workload. |

### Timeout Recovery

**Personalization agent**: Uses "Personalizing" status as a lock. At the start of each run, checks for tasks stuck in "Personalizing" for > 30 minutes and resets them to "Enriched" with a comment. Self-healing — no manual intervention needed.

**Send agent**: Idempotent by design. If timeout hits after Instantly push but before ClickUp update, next run finds the lead still "Approved", checks if email already exists in Instantly (via `skip_if_in_workspace`), skips duplicate creation, updates ClickUp. Safe to re-run.

### Retry Strategy

- **Cloud Scheduler**: 0 retries. Functions are self-healing and idempotent. Next scheduled run handles remaining leads.
- **Within-function retries**:
  - Firecrawl: 1 retry on timeout
  - ClickUp: 2 retries on 5xx with 3s backoff
  - Gemini: 2 retries on 5xx/429 with 5s backoff
  - Instantly: 2 retries on 5xx with 3s backoff
- **Per-lead error isolation**: One bad lead does not kill the batch. Error is caught, logged, and the agent continues to the next lead.

### Authentication

Cloud Scheduler uses OIDC tokens from a dedicated service account (`scheduler-sa`) with only `cloudfunctions.invoker` role. Cloud Functions are not publicly accessible.

### Queue Backlog

If the Discovery Agent creates 100+ leads from a batch of Prospecting Requests, the personalization queue processes 15/day. Clears in 3-4 days. If chronically overloaded, add a second daily run at 2 PM (`0 14 * * 1-5`).

---

## 5. Social Proof Fact-Checking (#13)

### Action Required: Jenn Must Verify

These statements go in cold outreach emails. If aspirational rather than factual, it is a credibility risk. Only Jenn can confirm the real numbers.

| Statement | What to Verify |
|-----------|---------------|
| "We work with over 100 schools" | Has ShopJaydees fulfilled orders for 100+ distinct schools? Is this cumulative or active? |
| "We've helped teams raise thousands through fundraising" | Has ShopJaydees run fundraising programs? Is "thousands" ($2,000+) accurate? |
| "We frequently work with businesses with 12 to 250+ employees" | Multiple active corporate clients in that range? Has a 250+ employee company been served? |

### Alternative Phrasings by Scenario

**Schools:**
- True (100+): Use as-is
- Partially true (30-60): "We've worked with dozens of schools across the Lower Mainland and Fraser Valley"
- Aspirational (<20): "We make spirit wear, staff shirts, and event gear for schools across the Lower Mainland"

**Teams:**
- True: Use as-is
- Partially true: "We've helped teams run apparel-based fundraisers — no inventory, no hassle"
- Aspirational: "We set up online team stores where every order supports your team — no inventory, no risk"

**Corporate:**
- True: Use as-is
- Partially true: "We work with local businesses on everything from crew uniforms to branded gear for the whole team"
- Aspirational: "Whether you've got a crew of 10 or a team of 200, we handle branded apparel from design to delivery"

### Implementation: Template Variables

Use `{{social_proof_schools}}`, `{{social_proof_teams}}`, `{{social_proof_corporate}}` variables in the personalization agent templates. Swap the value based on Jenn's verification without touching template logic.

---

## 6. Dormancy Re-engagement Mechanism (#14)

### Cloud Function: `dormancy-check`

Runs weekly (Sunday 6:00 AM Pacific) via Cloud Scheduler. Cannot be a ClickUp automation — ClickUp automations trigger on field changes, not calendar-based date comparisons.

### Logic

```
1. Query ClickUp:
   GET tasks WHERE status = "Dormant" AND include_closed = true
   AND Dormant Reactivation Date <= today

2. For each eligible lead:

   a. Score check: If Lead Score was lowered to 1-2 → skip
   b. Tag check: If "do-not-reactivate" tag present → skip
   c. Cycle check: If Previous Outreach Count >= 2 → move to Lost
      ("Two full outreach cycles with no response")
   d. Safety check: Verify Unsubscribed and Bounced are not checked

   If all checks pass:
   - Move status: Dormant → Enriched
   - Add tag: "re-engagement"
   - Increment: Previous Outreach Count += 1
   - Set: Seasonal Campaign to current season
   - Clear: Email Touch 1/2/3 + subjects, LinkedIn Message,
     Website Scrape Summary, Community Signals, Personalization Hooks
   - Add comment: "Re-activated after 90-day dormancy.
     Previous outreach: [dates]. Re-engagement with fresh angle
     for [new seasonal campaign]."
   - Clear: Dormant Date, Dormant Reactivation Date

3. Summary email to cody@sixohquad.com
```

### How Personalization Agent Handles Re-engagement

When the agent detects the `re-engagement` tag:

1. **Modified Gemini prompt**: "This is a re-engagement lead. Use a DIFFERENT value proposition angle. Do NOT reference previous emails. Re-scrape website for fresh context. If previous campaign was product-focused, lead with community angle, or vice versa."
2. **Fresh website scrape**: 90 days is long enough for website changes
3. **Different subject lines**: Completely fresh approach

### New Data Model Additions

| Item | Type | Purpose |
|------|------|---------|
| `Previous Outreach Count` | Number field (default 0) | Prevents infinite re-engagement. Max 2 cycles. |
| `do-not-reactivate` | Tag (owner-applied) | Escape hatch for genuinely bad fits |

---

## 7. Warm Intro Path (#15)

### What Happens When Owner Clicks "I Know This Person"

**Step 1 — Automation 7 (existing, modified):**
- Status → "Responded - Owner Follow-up"
- Add tag `warm-intro` (new: add this action to existing Automation 7)

**Step 2 — New Automation 9: Warm Intro Context Prompt**
- Trigger: Review Decision changes to "I Know This Person"
- Action: Post comment with warm intro guide:

```
--- WARM INTRO GUIDE ---

1. HOW DO YOU KNOW THEM?
   Add a note in "Owner Notes" — e.g., "Met at BNI", "Kid plays
   on same soccer team"

2. SUGGESTED APPROACH (pick one):
   - Text/call them directly
   - Personal email from your regular inbox (not the cold system)
   - Message on social media / LinkedIn
   - Mention it next time you see them

3. TALKING POINTS:
   - "Hey [name], I was putting together some outreach and your
     name came up — figured I'd just reach out directly instead"
   - Reference your connection naturally
   - Mention what Jaydees does for their type of org
   - If relevant, bring up Wear It Forward

4. DO NOT:
   - Send the AI-generated drafts to this person
   - Put them through the automated sequence

5. UPDATE THIS TASK:
   - Interested → keep as "Responded - Owner Follow-up"
   - Not interested → move to "Lost"
   - Converts → move to "Won"
```

**Step 3 — CASL**: Change CASL Consent Basis to "Referral" (existing relationship).

**Step 4 — AI Drafts**: Left on the task as reference material (personalization hooks, community signals). NOT sent — owner uses them as inspiration for personal outreach.

**Step 5 — Visibility**: Lead appears in "My Follow-ups" view alongside cold responses. The `warm-intro` tag differentiates them visually.

---

## 8. Testing Strategy (#16)

### Phase 1: Component Testing

**1a. ClickUp workspace:**
- Create all 53 fields, 8 automations, 7 views
- Create 5 fake test leads (one per segment category)
- Walk each through every status transition manually
- Verify all automations fire correctly
- Have Jenn walk through the Approval Queue view
- Duration: 1-2 hours

**1b. Personalization agent (local run):**
- Run against 5 test leads using real company websites for scrape targets
- Verify full field population (drafts, CASL, scrape summary)
- Review draft quality (tone, personalization, length)
- Test failure case: one lead with a non-existent domain
- Duration: 2-3 hours

**1c. Send agent (dry-run mode):**
- Environment variable `DRY_RUN=true`
- Agent queries and reads ClickUp normally but logs what it *would* send instead of calling Instantly
- Sets Instantly Campaign ID to "DRY-RUN-{timestamp}"
- Duration: 1-2 hours

**1d. Discovery agent:**
- Create 3 test Prospecting Requests covering different segments/cities
- Run agent manually; verify Hunter.io Discover queries, dedup checks, auto-scoring, and lead creation
- Include deliberate duplicates to verify dedup logic and "possible-duplicate" tagging
- Verify Prospecting Request tasks are updated with results summaries
- Duration: 1-2 hours

### Phase 2: Integration Testing

Full pipeline end-to-end with test data:

1. Create Prospecting Requests and run Discovery Agent — verify leads are created and auto-scored
2. Run personalization agent — verify only 3+ scored leads (auto-scored by Discovery Agent) get drafts
3. Jenn does a real approval session (tests her actual workflow)
4. Run send agent in dry-run mode
5. Test Zapier zaps using Zapier's built-in test payloads
6. Test dormancy check with a manually-backdated Dormant lead
- Duration: 3-4 hours

### Phase 3: Live Dry-Run

Real email delivery to controlled addresses:

1. Create test leads with: cody@sixohquad.com, jenn@shopjaydees.com, a Gmail test address
2. Run personalization agent (scrapes real websites — sixohquad.com, shopjaydees.com)
3. Jenn approves
4. Run send agent with `DRY_RUN=false` — actually pushes to Instantly
5. Verify: emails received, formatting correct, unsubscribe link works, sending domain correct
6. Reply to one test email → verify Zapier fires, ClickUp updates, Jenn gets notified
7. Click unsubscribe on another → verify Unsubscribed flow
- Duration: 2-3 hours (including wait times)

**After Phase 3**: Clean up all test data. `DRY_RUN` env var stays permanently in codebase.

**No separate staging environment.** At this scale, dry-run mode + controlled test targets provides sufficient safety without doubling infrastructure.

---

## 9. Error Handling Strategy (#17)

### Design Principle

Detect, log, alert, make recovery easy. All Cloud Functions log structured JSON to Google Cloud Logging. Error alerts email cody@sixohquad.com.

### Failure Mode Table

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **Hunter.io API down** | Discovery Agent cannot process Prospecting Requests. No data loss. | HTTP error logged, alert email to Cody | Requests stay in "Requested" status; next scheduled run retries. Dedup prevents double-imports on partial batch. |
| **ClickUp API rate limited** (100 req/min free) | Agent operations slow/fail | HTTP 429 with Retry-After header | Shared client wrapper: proactive throttle at 90/min + 3x retry on 429. If chronic, upgrade ClickUp plan (900/min on Business). |
| **Gemini refuses to generate** (content policy) | No drafts for this lead | `finish_reason: SAFETY` or empty candidates | Tag "generation-failed", reset to Enriched, alert Cody. Agent skips these on future runs until tag removed. |
| **Gemini returns garbage** | Unusable drafts reach review queue | Post-generation validation (min length, company name present, subject line check) | Validation failure → same as refusal. Subtle quality issues caught by owner's review gate. |
| **Firecrawl fails** (timeout, Cloudflare, 404) | Less personalized drafts | HTTP error or thin content (<100 chars) | Graceful degradation: proceed with Hunter.io data only, tag "no-scrape". Pipeline never blocks on scrape failure. |
| **Instantly rejects lead** (invalid email) | Email not sent | Instantly 4xx error | Mark Bounced (triggers Automation 2). |
| **Instantly duplicate** | Double-send risk | Instantly duplicate error | Tag "instantly-duplicate", alert Cody to investigate dedup gap. |
| **Cloud Function timeout** | Partially processed batch | GCP execution log status TIMEOUT | Stuck-lead self-healing: next run detects leads in "Personalizing" > 30 min and resets. Send agent uses Instantly `skip_if_in_workspace` for idempotency. |
| **Zapier can't match task** | Engagement data lost | Zapier search returns 0 results | Zapier Path B: email alert with event data. Weekly reconciliation function compares Instantly leads vs ClickUp tasks. |

### Error State Tags

| Tag | Applied By | Meaning | Recovery |
|-----|-----------|---------|----------|
| `generation-failed` | Personalization agent | Gemini refused or invalid output | Cody reviews, adjusts prompt/data, removes tag |
| `no-scrape` | Personalization agent | Scrape failed; minimal-context drafts | Owner decides if quality acceptable |
| `send-failed` | Send agent | Instantly unknown error | Cody investigates |
| `instantly-duplicate` | Send agent | Already exists in Instantly | Cody investigates dedup gap |

### Shared Infrastructure

**ClickUp API client wrapper:**
- Proactive throttle at 90 requests/min
- 3x retry on 429 with Retry-After backoff
- 3x retry on 5xx with 3s backoff

**Error alerting helper:**
- Emails cody@sixohquad.com with component, error type, details, task link
- Subject: "[ShopJaydees Pipeline] {component}: {error_type}"

**GCP Monitoring alert policy:**
- Fires when any Cloud Function has execution status != "OK"
- Catches all crashes, timeouts, and OOM errors

### Weekly Reconciliation Check

Part of the dormancy check function (or separate lightweight function). Compares Instantly campaign leads vs ClickUp "Outreach Active" tasks. Alerts on orphans in either direction.

---

## 10. LinkedIn Circuit Breaker (#18)

### Traffic Light Model

| Zone | Conditions | Action |
|------|-----------|--------|
| **Green** | Acceptance rate > 30%, pending invites < 150, no LinkedIn warnings | Continue at current volume |
| **Yellow** | Acceptance rate 20-30% OR pending 150-250 OR LinkedIn notice | Cut weekly sends in half. Withdraw oldest 20-30 pending invites (3+ weeks old). Review copy with SixOhQuad. Resume normal volume after 2 consecutive weeks above 30%. |
| **Red** | Acceptance rate < 15% OR pending > 250 OR any account restriction | Full stop immediately. Withdraw ALL pending invites > 2 weeks. No requests for minimum 2 weeks. Notify SixOhQuad. |

### Tracking

Recurring weekly ClickUp task: "LinkedIn Health Check — Weekly" (Friday, in Lead Generation space, not Prospects list)

Checklist: (1) Check LinkedIn Sent Invitations page, (2) Count pending invites, (3) Note accepted this week, (4) Post numbers in task comment, (5) If pending > 150 or acceptance < 30%, flag SixOhQuad

### Recovery Protocol (After LinkedIn Restriction)

1. Stop all connection requests immediately
2. Within 24 hours: withdraw all pending invites > 2 weeks old
3. No LinkedIn outreach for minimum 2 full weeks (email pipeline continues normally)
4. After 2 weeks: test with 5 requests. Wait a full week.
5. If no warning and 2+ accepted: increase by 5/week until back to target volume
6. Ramp back takes 3-4 weeks — patience is non-negotiable
7. Copy review with SixOhQuad required before resuming

---

## 11. Metrics Tracking (#19)

### Source Map

| Metric | Source | View |
|--------|--------|------|
| Pipeline flow (new leads, status distribution, approval rate) | ClickUp task data | ClickUp "Pipeline Health" dashboard |
| Email delivery (sends, opens, replies, bounces) | Instantly | Instantly analytics dashboard |
| LinkedIn health (requests, acceptance, pending) | Manual count | LinkedIn Health ClickUp task comments |
| Conversion (responded, won) | ClickUp task data | ClickUp dashboard |

### ClickUp Dashboard Additions

Add to the existing "Pipeline Health" dashboard:

- **Responded This Month** (count) — most important conversion metric
- **Won This Month** (count)
- **Leads by Category** (bar chart)
- **Leads by City** (bar chart)

### No Separate Spreadsheet

ClickUp dashboard for pipeline metrics (auto-calculated), Instantly for email metrics (built-in analytics), LinkedIn Health task for LinkedIn numbers. Three sources reviewed together monthly.

### Monthly Review Workflow

1. **SixOhQuad pre-work** (30 min): Pull data from ClickUp dashboard, Instantly analytics, LinkedIn Health comments. Prepare one-page summary.
2. **Review call** (30 min): Walk through summary, discuss what's working, agree on adjustments.
3. **Post-call**: SixOhQuad updates templates/targeting/config. Notes stored as ClickUp Doc.

### What Jenn Sees vs What SixOhQuad Reviews

- **Jenn daily**: Approval Queue, My Follow-ups, Pipeline Board — operational views only
- **Jenn weekly (Friday, 5 min)**: LinkedIn Health check + quick dashboard glance
- **SixOhQuad monthly**: All three data sources, full performance analysis, recommendations

---

## 12. Owner Time Budget (#20)

### Assessment: 15-20 Min/Day Is Realistic

With the Discovery Agent handling prospecting and auto-scoring, Jenn's daily workload is limited to reviewing drafts, checking responses, and sending LinkedIn requests. The original spec's 15-20 min/day estimate is now accurate.

### Realistic Activity Breakdown

**Daily tasks:**

| Activity | Time | Notes |
|----------|------|-------|
| Review & approve drafts | 10-15 min | Early weeks: 2-3 min/lead. After tuning: 30-60 sec/lead. |
| Check for warm responses | 0-10 min | 0-2 replies most days. Substantive response: 5-7 min. |
| Send LinkedIn requests | 5-10 min | 4-6 requests/day at 1-2 min each. Batch them. |

**Periodic tasks:**

| Activity | Time | Frequency |
|----------|------|-----------|
| Create targeting requests | ~5 min | Weekly (as needed) |
| LinkedIn health check | 3 min | Weekly (Friday) |
| Monthly review call | 30 min | Monthly |

### Weekly Hours — Three Scenarios

| Scenario | Drafts/week | Replies | LinkedIn sends | Weekly Total |
|----------|-------------|---------|---------------|-------------|
| Low | 50 | 1 | 15 | ~1.5 hrs (~18 min/day) |
| Mid | 75 | 3 | 25 | ~2 hrs (~24 min/day) |
| High | 100 | 5 | 30 | ~2.5 hrs (~30 min/day) |

### Revised Time Commitment (for Client Communication)

**Update client-facing materials to say:**

> "15-20 minutes per day for approvals, follow-ups, and LinkedIn sends. Plus ~5 minutes per week to create targeting requests. Total: approximately 1.5-2 hours per week at steady state."

### Ramp-Up Period

Weeks 1-3 will take more time (25-35 min/day) due to:
1. Learning ClickUp and the approval workflow
2. More draft editing while templates are being tuned (50-60% approval rate early)
3. Back-and-forth with SixOhQuad on template adjustments

### Recommendations to Keep Time Manageable

1. **Start at low volume, ramp gradually** — Week 1: 20-30 prospects. Week 2: 35-50. Week 3: 50-75. Week 4+: target volume.
2. **Batch LinkedIn sends** — one session per day, not intermittent
3. **Default-approve mindset** after week 4-6 — scan and approve unless something is obviously wrong (30 sec/lead vs 2 min/lead)
4. **Reduce LinkedIn if time-tight** — cut to 10-15/week. Email is the primary volume driver; LinkedIn is relationship quality.

---

## 13. Volume Math Reconciliation (#21)

### Funnel Model

The pipeline has four conversion gates between raw prospects and sent emails:

1. Hunter.io enrichment rate (% of domains yielding a verified contact)
2. Lead scoring filter (% scoring 3+)
3. Draft generation (100% — every 3+ lead gets a draft)
4. Owner approval rate

### Three Scenarios

**Low scenario:**

| Stage | Input | Rate | Output |
|-------|-------|------|--------|
| Raw prospects/week | 50 | — | 50 |
| Enriched (Hunter.io finds contact) | 50 | 35% | 18 |
| Score 3+ | 18 | 70% | 13 |
| Approved | 13 | 75% | 10 |
| **Sends/week** | | | **10** |

**Mid scenario (realistic baseline):**

| Stage | Input | Rate | Output |
|-------|-------|------|--------|
| Raw prospects/week | 100 | — | 100 |
| Enriched | 100 | 50% | 50 |
| Score 3+ | 50 | 80% | 40 |
| Approved | 40 | 80% | 32 |
| **Sends/week** | | | **32** |

**High scenario:**

| Stage | Input | Rate | Output |
|-------|-------|------|--------|
| Raw prospects/week | 150 | — | 150 |
| Enriched | 150 | 65% | 98 |
| Score 3+ | 98 | 85% | 83 |
| Approved | 83 | 85% | 71 |
| **Sends/week** | | | **71** |

### Key Insights

1. **The spec's 20-80 sends/week range is defensible** if enrichment lands between 35-65% (realistic for this market — see Finding #22).
2. **Enrichment rate is the primary volume control knob** — it naturally throttles the pipeline.
3. **Owner bandwidth is not the bottleneck**: since prospecting and scoring are automated, Jenn's only daily task is reviewing drafts. At ~2 min per review, 15-20 min/day = 8-10 drafts/day = 40-50/week. This review capacity is not competing with other tasks, so the ceiling is comfortable.
4. **80 sends/week is a stretch target**, achievable after templates are well-tuned and the owner can skim-approve in 30 sec/lead.

### Recommendation

Anchor steady-state target at **30-40 sends/week**. Frame 80 as achievable after month 2-3 when approval speed increases. Make the funnel math explicit in the spec.

---

## 14. Hunter.io Coverage Assessment (#22)

### Realistic Enrichment Rates by Segment

**Schools (55-75%)** — Best coverage
- Public schools use standardized `.sd##.bc.ca` domains. Hunter.io crawls these reliably.
- Staff directories often publicly listed (principals, vice-principals, PAC contacts)
- Exception: daycares/preschools drop to 20-30% (small operations, often no domain)

**Teams (30-50%)** — Moderate coverage
- Organized leagues (minor hockey, youth soccer associations) usually have websites with board contacts
- Individual teams within leagues have no web presence — target the league
- Dance studios and martial arts schools: 50-60% coverage
- Facebook-only clubs: invisible to Hunter.io

**Businesses (25-45%)** — Weakest coverage
- Trades/contractors: many operate with personal gmail/shaw/telus emails, no company domain
- Restaurants: often just Google Maps + Instagram, no crawlable email
- Real estate: better (60-70%) — brokerages have domains with agent pages
- Fitness studios: moderate — many use MindBody as primary presence

**Blended estimate across all segments: 35-55%**, depending on segment mix. Starting point: ~45%.

### Impact on Pipeline Volume

Using mid scenario (100 raw/week, 80% score 3+, 80% approval):

| Enrichment Rate | Sends/week | Monthly Conversations (at 8% reply) |
|----------------|------------|--------------------------------------|
| 30% | 19 | 6-7 |
| 40% | 26 | 8-9 |
| 50% | 32 | 10-11 |
| 60% | 38 | 12-13 |
| 70% | 45 | 14-15 |

Below 40% enrichment, email alone won't reliably hit the 90-day target of 5-15 qualified conversations/month.

### Fallback Enrichment Methods (Ordered by Effort)

1. **Google Maps / Google Business Profile** — many local businesses list email/phone. Lowest-effort manual fallback.
2. **LinkedIn manual lookup** — find owner/manager, send connection request. Bypasses need for email.
3. **Direct website contact forms** — for high-value 4-5 score prospects only (doesn't scale)
4. **Local business directories** — Surrey Board of Trade, Langley Chamber of Commerce, BIA listings
5. **Industry-specific directories** — BC Ministry of Education school directory, community rec program guides
6. **Apollo.io as supplement** — if Hunter.io consistently underperforms for a segment (~$50/mo, broader small-business coverage)

### Recommendations

1. **Jenn creates targeting requests focused on schools as the primary segment** for the first 30 days — best enrichment rates, predictable decision-makers, seasonal urgency
2. **Add fallback enrichment as a documented pipeline step**, not an afterthought — the Discovery Agent tries Hunter.io first, then Google Maps/LinkedIn for high-scoring prospects that Hunter.io missed
3. **Track enrichment rate by segment from day one** as a first-class metric — the Discovery Agent logs per-request enrichment rates automatically
4. **Do NOT pre-filter to domains-only** — this excludes much of the target market. The Discovery Agent prospects broadly via Hunter.io Discover, enriches where possible, and flags gaps for fallback methods.

---

## Appendix: New Data Model Additions

### New Custom Fields

| Field Name | Type | Default | Populated By | Finding |
|------------|------|---------|-------------|---------|
| Previous Outreach Count | Number | 0 | Dormancy check function | #14 |

### New Tags

| Tag | Applied By | Purpose | Finding |
|-----|-----------|---------|---------|
| `do-not-reactivate` | Owner (manual) | Prevents dormant lead re-engagement | #14 |
| `generation-failed` | Personalization agent | Gemini generation failure — requires manual review | #17 |
| `no-scrape` | Personalization agent | Website scrape failed — minimal-context drafts | #17 |
| `send-failed` | Send agent | Instantly unknown error | #17 |
| `instantly-duplicate` | Send agent | Lead already exists in Instantly | #17 |

### New / Modified ClickUp Automations

| # | Automation | Change | Finding |
|---|-----------|--------|---------|
| 7 | "I Know This Person" → Follow-up | **Add**: also apply `warm-intro` tag | #15 |
| 9 | Warm Intro Context Prompt (NEW) | Posts warm intro guide comment on "I Know This Person" | #15 |

### New Cloud Functions

| Function | Schedule | Purpose | Finding |
|----------|----------|---------|---------|
| `discovery-agent` | Mon-Fri 4:00 AM Pacific (`0 4 * * 1-5`) | Process Prospecting Requests, query Hunter.io Discover, create and auto-score leads | #9 |
| `dormancy-check` | Sunday 6:00 AM Pacific (`0 6 * * 0`) | Reactivate dormant leads past 90-day cool-off | #14 |
| Reconciliation check (part of dormancy-check) | Same | Compare Instantly vs ClickUp for sync drift | #17 |

### Modifications to Existing Components

| Component | Change | Finding |
|-----------|--------|---------|
| Personalization agent | Add re-engagement detection (`re-engagement` tag → modified Gemini prompt) | #14 |
| Personalization agent | Add Firecrawl scrape with fallback chain | #7, #17 |
| Personalization agent | Add Gemini output validation (length, name presence, subject check) | #17 |
| Personalization agent | Add stuck-lead detection at start of run | #12, #17 |
| Send agent | Add `DRY_RUN` mode (env var) | #16 |
| Send agent | Reorder: Instantly push before ClickUp status update | #17 |
| Send agent | Add per-error-type Instantly handling | #17 |
| Send agent | Use `skip_if_in_workspace` for idempotency | #12 |
| All Zapier zaps | Add Path B for no-match error alerting | #17 |

### Updated Cost Estimate

| Item | Monthly Cost | Paid By |
|------|-------------|---------|
| Hunter.io Starter | $34/mo USD | Client |
| Instantly Growth | $37.60/mo USD | Client |
| Zapier Starter | $19.99/mo USD | Client |
| Firecrawl Starter | $19/mo USD | Client |
| Gemini 2.5 Flash API | $2-5/mo USD | Client |
| Google Cloud Functions + Scheduler | $0-5/mo USD | Client |
| **Total third-party** | **~$113-122/mo USD** | Client |

Note: This is higher than the original $66-95/mo estimate. The additions are Zapier ($19.99) and Firecrawl ($19). Both are necessary — Zapier for Instantly↔ClickUp sync, Firecrawl for website scraping. The Firecrawl free tier (500 credits/month) could reduce cost to ~$94-103/mo during the low-volume launch phase.

Note: The Discovery Agent now consumes Hunter.io requests automatically, so quota monitoring is more important — the agent could burn through the 500 requests/month limit faster than manual searches would. The Discovery Agent logs quota usage after each run. If usage consistently exceeds 400/month, upgrade Hunter.io to Growth ($89/mo).
