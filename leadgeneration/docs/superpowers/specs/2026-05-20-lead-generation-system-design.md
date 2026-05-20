# ShopJayDees Lead Generation System — Design Spec

## Overview

An agent-first automated lead generation and cold outreach system for ShopJayDees, an online custom clothing company serving businesses, schools, and teams in BC's Lower Mainland and Fraser Valley.

The system scrapes Google Maps for prospects, enriches contacts with decision-maker info and company context, generates personalized cold email and LinkedIn outreach, and manages the pipeline through ClickUp. The owner reviews and approves all outreach before it sends.

### Scope

This project covers the automated agent pipeline only. Organic marketing, social media, referral programs, and website optimization are out of scope.

### Key Constraints

- **Budget**: Lean/bootstrap — total pipeline cost target under $80/mo
- **Owner bandwidth**: ~15-20 min/day for approvals and warm lead follow-up
- **Geography**: Lower Mainland and Fraser Valley initially, expanding to nationwide over time
- **Volume**: 50-150 raw prospects per week, resulting in 20-80 outreach sends per week
- **Channels**: Email (primary, automated send), LinkedIn (secondary, owner sends manually with AI-drafted copy)

---

## 1. Pipeline Architecture

A four-stage pipeline with ClickUp as the central record system.

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  1. DISCOVER │───▶│ 2. ENRICH   │───▶│ 3. PERSONALIZE│───▶│ 4. OUTREACH │
│  (Scrape)    │    │ (Research)  │    │  (AI Copy)    │    │ (Send)      │
└─────────────┘    └─────────────┘    └──────────────┘    └─────────────┘
       │                  │                  │                    │
       ▼                  ▼                  ▼                    ▼
   Raw leads         Enriched leads    Personalized msgs    Sent + tracked
   in ClickUp        in ClickUp        ready for review     in ClickUp
```

### Stage 1 — Discover (Google Maps Scraper Agent)

- Searches Google Maps for target prospect types in configured geographies
- Search queries organized by segment (businesses, schools, teams) with specific categories per segment
- Deduplicates against existing ClickUp contacts to avoid double-outreach
- Output: raw prospect records (business name, address, phone, website, category) pushed to ClickUp with status "New"
- Runs weekly

### Stage 2 — Enrich (Research Agent)

- Takes each raw prospect and researches deeper: scrapes their website, finds decision-maker names and emails, checks LinkedIn for key contacts, pulls recent news or social posts
- Scores leads on fit (1-5 scale)
- Only leads scoring 3+ proceed to personalization; scores 1-2 get parked
- Output: enriched prospect records with contact person, email, LinkedIn URL, company context, and fit score in ClickUp with status "Enriched"
- Runs daily

### Stage 3 — Personalize (AI Copywriter Agent)

- Takes enriched data and generates personalized email + LinkedIn messages
- Uses segment-specific templates as a base, customizes with details from enrichment
- Generates a 3-touch email sequence (initial + 2 follow-ups) and a LinkedIn connection request note
- Output: draft messages queued in ClickUp with status "Ready for Review"
- Runs daily

### Stage 4 — Outreach (Send + Track)

- Owner reviews and approves/edits drafts in ClickUp
- Approved emails get sent via cold email tool (Instantly or Smartlead)
- LinkedIn messages sent manually by owner using pre-written copy
- Tracks opens, replies, and engagement
- Warm responses flagged for owner with status "Responded - Owner Follow-up"
- Runs daily (sends approved messages)

---

## 2. Prospect Targeting Strategy

### Business Prospects — Year-round, heavier spring/fall for trades

| Category | Example Google Maps Searches | Why They Need Custom Apparel |
|----------|------------------------------|------------------------------|
| Trades & contractors | "plumbing company Surrey", "electrical contractor Langley" | Branded work wear, safety vests, crew uniforms |
| Restaurants & hospitality | "restaurant Burnaby", "brewery New Westminster" | Staff uniforms, branded merch for customers |
| Fitness & wellness | "gym Abbotsford", "yoga studio Coquitlam" | Staff + member branded gear |
| Real estate & property mgmt | "real estate brokerage Vancouver", "property management Richmond" | Team branded polos, jackets, open house gear |
| Auto & trades shops | "auto body shop Delta", "mechanic Chilliwack" | Shop uniforms, branded outerwear |

### School Prospects — Heavy late Aug through Feb

| Category | Example Searches | Why |
|----------|-----------------|-----|
| Elementary & secondary | "elementary school Maple Ridge", "high school Mission" | Spirit wear, staff shirts, event merch, grad gear |
| Independent & private schools | "private school Vancouver", "independent school Surrey" | Higher budgets, branded everything |
| Daycares & preschools | "daycare Langley", "preschool Abbotsford" | Staff uniforms, branded gear for parents to buy |
| Post-secondary clubs | "student association BCIT", "SFU clubs" | Club merch, event shirts |

### Team & Sports Prospects — Heavy spring and fall

| Category | Example Searches | Why |
|----------|-----------------|-----|
| Youth sports leagues | "minor hockey Coquitlam", "soccer league Surrey" | Team jerseys, warmups, parent fan gear |
| Adult rec leagues | "adult softball Richmond", "rec volleyball Burnaby" | Team shirts, tournament gear |
| Dance & performance | "dance studio Langley", "martial arts Abbotsford" | Performance wear, recital merch, branded gear |
| Community sport orgs | "community centre Delta", "recreation centre Chilliwack" | Program-branded apparel, staff uniforms |

### Geographic Phasing

- **Phase 1**: Surrey, Langley, Abbotsford, Chilliwack, Mission, Maple Ridge (Fraser Valley core)
- **Phase 2**: Burnaby, New Westminster, Coquitlam, Port Coquitlam, Pitt Meadows
- **Phase 3**: Richmond, Delta, North Vancouver, Vancouver proper
- **Future**: Expand to rest of BC, then nationwide

### Seasonal Campaign Calendar

| Period | Priority Segment | Outreach Theme |
|--------|-----------------|----------------|
| Mar–May | Teams (spring sports), Trades (spring ramp) | "Get your team/crew ready for the season" |
| Jun–Jul | Schools (planning ahead), Businesses | "Lock in your fall order early" |
| Aug–Sep | Schools (heavy), Teams (fall sports) | "Back to school, back to the field" |
| Oct–Nov | Businesses (holiday gifts/year-end) | "Year-end branded gear, employee appreciation" |
| Dec–Feb | Schools (still active), Businesses (new year) | "New year, fresh look for your team" |

---

## 3. Enrichment & Personalization

### Enrichment Data Points (Stage 2)

For each raw prospect, the research agent gathers:

| Data Point | Source | Purpose |
|------------|--------|---------|
| Decision-maker name & role | Website "About/Team" page, LinkedIn | Who to address outreach to |
| Email address | Website, Hunter.io, pattern matching (first@domain.com) | Primary outreach channel |
| LinkedIn profile URL | LinkedIn search | Secondary outreach channel |
| Company size estimate | Website, Google reviews count, LinkedIn employee count | Fit scoring + messaging |
| Recent news/milestones | Google News, their social media, website blog | Personalization hooks |
| Current branding quality | Website screenshots, social media presence | Gauge if they invest in brand |
| Existing apparel provider (if visible) | Website photos, team photos on social | Competitive intelligence |
| Community involvement | Website, social media, local news | "Wear It Forward" alignment |

### Lead Scoring — 1-5 Fit Score

| Score | Criteria |
|-------|----------|
| 5 | High-volume apparel need, decision-maker found, email confirmed, recent growth signal |
| 4 | Clear apparel need, contact found, active business |
| 3 | Likely apparel need, some contact info, stable business |
| 2 | Possible apparel need, limited info found |
| 1 | Unclear need or very small operation |

Only leads scoring 3+ proceed to personalization. Scores 1-2 get parked for future re-evaluation.

### Personalization Framework (Stage 3)

Each message is built from a segment template plus personalization layers:

1. **Template (segment-specific)**: Value prop for their segment, relevant social proof, clear CTA
2. **Personalization Layer 1 — Context**: Reference their business by name, mention something specific (new location, award, event)
3. **Personalization Layer 2 — Relevance**: Why custom apparel matters for their specific situation, connect to their industry/season
4. **Personalization Layer 3 — Community**: "Wear It Forward" mention where relevant (community-oriented orgs), local connection / shared values

### Outreach Sequence — 3 Touches

| Touch | Email | LinkedIn | Timing |
|-------|-------|----------|--------|
| 1 | Personalized intro, value prop, soft CTA ("worth a quick chat?") | Connection request with short personalized note | Day 0 |
| 2 | Follow-up with specific idea ("here's what we did for a similar school/team/business") | If connected: DM with value-add | Day 4 |
| 3 | Final touch, lighter tone, leave the door open | — | Day 9 |

No response after touch 3: lead goes dormant for 90 days, then can re-enter the pipeline with a different angle if still scoring 3+.

### Client Review Gate

Before any message sends, the owner can:
- Approve as-is
- Edit and approve
- Reject (with optional note for the AI to learn from)
- Flag "I know this person" (switches to warm intro approach)

Over time, approval patterns help tune the personalization templates to better match the owner's voice.

---

## 4. Tooling & Infrastructure

### Technology Stack

| Component | Tool/Platform | Role |
|-----------|--------------|------|
| Agent LLM | Gemini 2.5 Flash | Runs all agent logic — data parsing, personalization, template filling |
| Agent hosting | Google Cloud Functions | Serverless execution of pipeline stages on schedule |
| Scheduling | Google Cloud Scheduler | Triggers Cloud Functions (weekly discover, daily enrich/personalize/send) |
| Google Maps scraping | Firecrawl | Extracts business listings by query + geography |
| Website scraping | Firecrawl | Pulls company pages for enrichment data |
| Email finding | Hunter.io (free tier) + pattern matching | Locates decision-maker emails |
| LinkedIn lookup | Manual by owner (with agent-provided search context) | Finds profiles for connection requests |
| CRM & task management | ClickUp | Central record system, approval queue, tracking |
| Email sending | Instantly or Smartlead | Cold email delivery, warmup, open/reply tracking |
| LinkedIn outreach | Manual by owner (with AI-drafted copy) | Connection requests + DMs |

### Key Design Decisions

1. **ClickUp is the single source of truth** — every lead lives there with its status, score, enrichment data, and outreach history. No separate databases.
2. **LinkedIn stays manual** — LinkedIn aggressively flags automated outreach. The agent writes the messages, the owner sends them. Keeps the account safe and adds a human touch.
3. **Dedicated cold email tool for sending** — ClickUp's email features are for marketing, not cold outreach deliverability. Instantly or Smartlead handles warmup, rotation, and deliverability at low cost.
4. **Approval queue is async** — owner reviews a batch of 10-20 drafts once per day (15-20 min), not real-time. Pipeline keeps filling while they review.
5. **Gemini 2.5 Flash for all agent LLM calls** — the personalization and data parsing tasks don't require frontier-model reasoning. Flash is ~1/10th the cost of Claude/GPT-4 and more than capable at this workload.

### Run Schedule

| Agent | Frequency | What It Does |
|-------|-----------|-------------|
| Discover | Weekly | Scrapes Google Maps for new prospects, pushes raw leads to ClickUp |
| Enrich | Daily | Picks up "New" leads, researches and scores them, updates ClickUp |
| Personalize | Daily | Picks up "Enriched" 3+ leads, generates draft outreach, queues for review |
| Send | Daily | Picks up "Approved" messages, sends via email tool, updates tracking |

### Data Flow

```
Weekly:  Discover agent → 50-150 raw leads → ClickUp (status: "New")
Daily:   Enrich agent picks up "New" → scores & enriches → ClickUp (status: "Enriched")
Daily:   Personalize agent picks up "Enriched" 3+ → drafts messages → ClickUp (status: "Ready for Review")
Daily:   Owner reviews → approves/edits → ClickUp (status: "Approved")
Daily:   Send agent picks up "Approved" → sends email sequence → ClickUp (status: "Outreach Active")
Ongoing: Replies/engagement tracked → warm leads flagged → ClickUp (status: "Responded - Owner Follow-up")
```

### Estimated Monthly Cost

| Item | Estimated Cost |
|------|----------------|
| Cold email tool (Instantly/Smartlead) | $30-50 |
| Hunter.io (email finding, free tier to start) | $0-49 |
| Gemini 2.5 Flash API | $2-5 |
| Firecrawl (scraping) | $0-20 |
| Google Cloud Functions + Scheduler | $0-5 |
| ClickUp (already planned) | Existing |
| **Total** | **$32-129/mo** |

### Roles

| Who | Does What |
|-----|-----------|
| SixOhQuad | Builds agents, maintains pipeline, monitors performance, adjusts targeting |
| ShopJayDees owner | Reviews/approves outreach daily (~15-20 min), handles warm responses, sends LinkedIn messages |

---

## 5. Metrics & Success Criteria

### Pipeline Metrics (tracked weekly)

| Stage | Metric | Target |
|-------|--------|--------|
| Discover | Raw leads scraped per week | 50-150 |
| Enrich | % of raw leads successfully enriched (email found, scored 3+) | 40-60% |
| Personalize | Drafts generated per week | 20-90 (based on enrichment pass rate) |
| Approve | Owner approval rate | 80%+ (if lower, templates need tuning) |
| Send | Emails sent per week | 20-80 |
| Engage | Email open rate | 40%+ (cold email benchmark) |
| Reply | Reply rate | 5-15% (good for cold outreach) |
| Convert | Replies that become quotes/conversations | 30-50% of replies |
| Close | Quotes that become orders | Depends on owner's close rate |

### LinkedIn Metrics (tracked monthly)

| Metric | Target |
|--------|--------|
| Connection requests sent | 20-40/week |
| Connection acceptance rate | 25-40% |
| DM conversations started | 5-15/month |

### Health Signals — When to Adjust

| Signal | Means | Action |
|--------|-------|--------|
| Open rate below 30% | Subject lines or deliverability issue | Test new subject lines, check email warmup |
| Reply rate below 3% | Messaging isn't landing | Revisit personalization, try different value props |
| Approval rate below 60% | AI drafts don't match owner's voice | Refine templates, review rejection patterns |
| Enrichment rate below 30% | Scraping targets are too small/obscure | Adjust prospect categories, try different search queries |
| Owner spending 30+ min/day on reviews | Too much volume or too many edits needed | Reduce volume, improve draft quality |
| Bounce rate above 5% | Email finding is pulling bad addresses | Tighten email verification step in enrichment |
| LinkedIn connection rate below 15% | Profile or note not compelling | Revise connection request copy |

### Monthly Review Cadence

SixOhQuad and ShopJayDees owner review once a month:
- Pipeline numbers end-to-end (discovery through close)
- Which segments and prospect types are converting best
- Which personalization angles get the most replies
- Adjust targeting, templates, and volume based on data
- Plan seasonal shifts per the campaign calendar

### Definition of Success at 90 Days

- Pipeline running reliably on schedule with minimal manual intervention
- Owner spending 15-20 min/day on approvals and warm follow-ups
- Generating 5-15 qualified conversations per month from cold outreach
- At least 2-3 closed deals attributable to the pipeline
- Clear data on which segments and messaging angles work best
- Enrichment and personalization quality high enough that approval rate stays above 80%

### Definition of Success at 6 Months

- Pipeline optimized based on 90-day learnings — targeting narrowed to best-converting segments
- Volume scaled up or down based on owner's capacity to handle warm leads
- Repeatable seasonal playbooks established (e.g., "school outreach ramps in July")
- Pipeline generating predictable monthly revenue contribution
- System stable enough to require minimal SixOhQuad intervention week-to-week
