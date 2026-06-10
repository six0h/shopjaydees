# ShopJaydees Lead Generation System — Design Spec

## Overview

An automated lead generation and cold outreach system for ShopJaydees, an online custom clothing company serving businesses, schools, and teams in BC's Lower Mainland and Fraser Valley.

The owner sets targeting direction by creating Prospecting Requests in ClickUp, then a Discovery Agent automatically finds companies, enriches decision-maker contacts via Hunter.io, and scores leads. Qualified leads flow into an AI-powered personalization and outreach pipeline. The owner reviews and approves all outreach before it sends.

### Scope

This project covers the lead generation pipeline only. Organic marketing, social media, referral programs, and website optimization are out of scope.

### Key Constraints

- **Budget**: Lean/bootstrap — total pipeline cost target under $100/mo
- **Owner bandwidth**: ~15-20 min/day for approvals and warm lead follow-up
- **Geography**: Lower Mainland and Fraser Valley initially, expanding to nationwide over time
- **Volume**: 50-150 raw prospects per week, resulting in 20-80 outreach sends per week
- **Channels**: Email (primary, automated send), LinkedIn (secondary, owner sends manually with AI-drafted copy)

---

## 1. Pipeline Architecture

A three-stage pipeline with ClickUp as the central record system.

```
┌──────────────────┐    ┌──────────────┐    ┌─────────────┐
│ 1. DISCOVER +    │───▶│ 2. PERSONALIZE│───▶│ 3. OUTREACH │
│    ENRICH        │    │  (AI Copy)    │    │ (Send)      │
│  (Discovery Agent│    └──────────────┘    └─────────────┘
│   + Hunter.io)   │           │                    │
└──────────────────┘           ▼                    ▼
       │                  Personalized msgs    Sent + tracked
       ▼                  ready for review     in ClickUp
   Scored + enriched
   contacts in ClickUp
```

### Stage 1 — Discover + Enrich (Discovery Agent + Hunter.io)

- Jenn creates a "Prospecting Request" in ClickUp (e.g., "Schools in Langley") by selecting Segment, Category, and City from dropdowns
- A Discovery Agent (Cloud Function) picks up the request and queries Hunter.io's Discover API with those parameters (geography, industry, company size filters)
- The agent finds matching companies and gets decision-maker contacts (names, titles, verified emails)
- The agent deduplicates against existing ClickUp leads to avoid double-outreach
- The agent automatically scores each lead (1-5) using the scoring rubric based on Hunter.io data (headcount, email confidence, title seniority, industry fit)
- Score 3+ leads go to ClickUp with status "Enriched" (enter personalization pipeline automatically)
- Score 1-2 leads go to ClickUp with status "Parked" for future re-evaluation
- Jenn never touches Hunter.io directly — her first interaction with leads is at the Approval Queue when drafts are ready

### Stage 2 — Personalize (AI Copywriter Agent)

- Takes enriched data and generates personalized email + LinkedIn messages
- Uses segment-specific templates as a base, customizes with details from enrichment
- Generates a 3-touch email sequence (initial + 2 follow-ups) and a LinkedIn connection request note
- Output: draft messages queued in ClickUp with status "Ready for Review"
- Runs daily

### Stage 3 — Outreach (Send + Track)

- Owner reviews and approves/edits drafts in ClickUp
- Approved emails get sent via cold email tool (Instantly or Smartlead)
- LinkedIn messages sent manually by owner using pre-written copy
- Tracks opens, replies, and engagement
- Warm responses flagged for owner with status "Responded - Owner Follow-up"
- Runs daily (sends approved messages)

---

## 2. Prospect Targeting Strategy

### Hunter.io Discovery Strategies

The Discovery Agent uses Hunter.io's Discover API to find prospects and their decision-maker contacts in each segment. Searches are configured by segment, using industry classification, geography, and company size filters to find the right companies in target areas.

### Business Prospects — Year-round, heavier spring/fall for trades

| Category | Discovery Agent Filters | Why They Need Custom Apparel |
|----------|------------------------|------------------------------|
| Trades & contractors | Industry: construction, plumbing, electrical; Geography: Fraser Valley; Size: 5-200 | Branded work wear, safety vests, crew uniforms |
| Restaurants & hospitality | Industry: restaurants, food & beverage; Geography: Lower Mainland; Size: 5-100 | Staff uniforms, branded merch for customers |
| Fitness & wellness | Industry: fitness, wellness, recreation; Geography: Lower Mainland; Size: 5-50 | Staff + member branded gear |
| Real estate & property mgmt | Industry: real estate, property management; Geography: Lower Mainland; Size: 5-100 | Team branded polos, jackets, open house gear |
| Auto & trades shops | Industry: automotive, trades; Geography: Fraser Valley; Size: 5-50 | Shop uniforms, branded outerwear |

### School Prospects — Heavy late Aug through Feb

| Category | Discovery Agent Filters | Why |
|----------|------------------------|-----|
| Elementary & secondary | Industry: education, K-12; Geography: Lower Mainland; Size: 10-500 | Spirit wear, staff shirts, event merch, grad gear |
| Independent & private schools | Industry: private education; Geography: Metro Vancouver; Size: 10-200 | Higher budgets, branded everything |
| Daycares & preschools | Industry: childcare, early education; Geography: Lower Mainland; Size: 5-50 | Staff uniforms, branded gear for parents to buy |
| Post-secondary clubs | Industry: higher education, student organizations; Geography: Lower Mainland | Club merch, event shirts |

### Team & Sports Prospects — Heavy spring and fall

| Category | Discovery Agent Filters | Why |
|----------|------------------------|-----|
| Youth sports leagues | Industry: sports, youth athletics; Geography: Lower Mainland/Fraser Valley; Size: 5-100 | Team jerseys, warmups, parent fan gear |
| Adult rec leagues | Industry: recreation, sports leagues; Geography: Lower Mainland/Fraser Valley; Size: 5-50 | Team shirts, tournament gear |
| Dance & performance | Industry: dance, martial arts, performing arts; Geography: Lower Mainland; Size: 5-50 | Performance wear, recital merch, branded gear |
| Community sport orgs | Industry: community recreation, sports organizations; Geography: Lower Mainland; Size: 10-200 | Program-branded apparel, staff uniforms |

### Geographic Phasing

- **Phase 1**: Surrey, Langley, Abbotsford, Chilliwack, Mission, Maple Ridge (Fraser Valley core)
- **Phase 2**: Burnaby, New Westminster, Coquitlam, Port Coquitlam, Pitt Meadows
- **Phase 3**: Richmond, Delta, North Vancouver, Vancouver proper
- **Future**: Expand to rest of BC, then nationwide

### Seasonal Campaign Calendar

| Period | Priority Segment | Outreach Theme |
|--------|-----------------|----------------|
| Mar-May | Teams (spring sports), Trades (spring ramp) | "Get your team/crew ready for the season" |
| Jun-Jul | Schools (planning ahead), Businesses | "Lock in your fall order early" |
| Aug-Sep | Schools (heavy), Teams (fall sports) | "Back to school, back to the field" |
| Oct-Nov | Businesses (holiday gifts/year-end) | "Year-end branded gear, employee appreciation" |
| Dec-Feb | Schools (still active), Businesses (new year) | "New year, fresh look for your team" |

---

## 3. Messaging Framework & Personalization

### Prospect Research Protocol

Before drafting any message, the personalization agent gathers context from two sources:

**From Hunter.io** (Stage 1 output): company name, domain, decision-maker name + title, industry, verified email

**From website scrape** (homepage of prospect's website): what they do, their services/products, any visible community involvement (sponsorships, charity work, causes they support), recent events or news, general sense of their brand

The agent looks specifically for **community signals** — these are natural bridges to the Wear It Forward angle. A school that sponsors a food drive, a construction company that supports minor hockey, a dance studio that does charity recitals — these are gold for personalization.

| Data Source | Data Points | Purpose |
|-------------|-------------|---------|
| Hunter.io (Stage 1) | Decision-maker name + title, verified email, confidence score, company domain, sources | Who to contact and how |
| Website scrape (Stage 2) | Services/products, community involvement, recent events/news, brand feel | Personalization hooks, Wear It Forward bridges |

### Tone & Voice

Priority order: **Friendly > Professional > Casual > Community**

- Warm and approachable — like a local business owner reaching out to another
- First-name basis, no corporate jargon, no buzzwords
- Professional but not stiff — clear and direct without being salesy
- Community-minded undertone woven naturally, not forced

### Lead Scoring — 1-5 Fit Score

Scoring is performed automatically by the Discovery Agent in Stage 1, based on data available from Hunter.io:

- **Headcount** — larger organizations score higher (more apparel volume potential)
- **Email confidence score** — higher confidence = more reliable contact
- **Title seniority** — Owner/CEO/Principal/Director score higher than generic titles
- **Industry fit** — how well the company matches the target category for their segment
- **Web presence** — has a domain vs no domain found

| Score | Criteria |
|-------|----------|
| 5 | High-volume apparel need, decision-maker found, email verified, recent growth signal |
| 4 | Clear apparel need, contact found, active business |
| 3 | Likely apparel need, some contact info, stable business |
| 2 | Possible apparel need, limited info found |
| 1 | Unclear need or very small operation |

Only leads scoring 3+ proceed to personalization. Scores 1-2 get parked for future re-evaluation. Jenn can override any score in ClickUp if she disagrees with the agent's assessment.

### Message Structure

**Value-first** open → **Wear It Forward** as co-lead → **Soft CTA**

1. Open with what Jaydees does for them specifically (referencing their business/situation)
2. Bridge to Wear It Forward as a meaningful differentiator — not a hard pitch, a natural "and here's what makes this different"
3. Soft call to action — "worth a quick chat?" not "book a demo now"

### Social Proof by Segment

| Segment | Proof Statement |
|---------|----------------|
| Schools | "We work with over 100 schools in the Lower Mainland" |
| Teams | "We've helped teams raise thousands through apparel-based fundraising — no inventory, no hassle" |
| Corporate | "We frequently work with businesses with anywhere from 12 to 250+ employees" |

### Personalization Layers

Each message is built from a segment template plus layered personalization:

1. **Segment template** — value prop tailored to schools/teams/corporate
2. **Business context** — reference what they specifically do, pulled from their website
3. **Community signals** — if they have visible community involvement, connect it to Wear It Forward ("I noticed you sponsor the Langley food bank — that's exactly the kind of thing Wear It Forward supports")
4. **Seasonal/timing** — tie to the campaign calendar where relevant ("with fall sports season coming up...")

### 3-Touch Email Sequence

**Touch 1 (Day 0)** — Intro + value prop

- Personalized opening referencing their business by name + something specific from research
- What Jaydees does for organizations like theirs (segment-tailored)
- Wear It Forward as differentiator
- Soft CTA: "Worth a quick conversation?"

**Touch 2 (Day 4)** — Share something useful, no hard sell

- Lead with value: a specific idea for their situation, a relevant insight, or a useful angle
- Example for a school: "A lot of schools we work with use spirit wear as an ongoing fundraiser — the store stays open year-round and the PAC gets a cut of every order"
- Example for corporate: "One thing businesses like yours tell us is that consistent branded gear across their crew makes a real difference at job sites / client meetings"
- Light mention of how Jaydees makes this easy
- No hard ask

**Touch 3 (Day 9)** — Circle back, lighter tone, door open

- Brief, friendly check-in
- Restate the offer from a different angle or with a lighter touch
- "If the timing isn't right, no worries — happy to connect whenever it makes sense for you"
- Genuinely leave the door open — no pressure, no scarcity tactics

After Touch 3 with no response: lead goes dormant for 90 days, can re-enter with a different angle if still scoring 3+.

### LinkedIn Connection Request

- Short personalized note (not a pitch)
- Reference something specific about them or their organization
- Friendly connection, no sell: "Hi [name] — I came across [their org] and love what you're doing with [specific thing]. Would love to connect."

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
| Prospect discovery + enrichment | Hunter.io (via Discovery Agent) | Discover API finds companies by industry/geography/size, returns decision-maker contacts with verified emails |
| Agent LLM | Gemini 2.5 Flash | Runs personalization agent — template filling, context-aware copy generation |
| Agent hosting | Google Cloud Functions | Serverless execution of discovery, personalization, and send agents on schedule |
| Scheduling | Google Cloud Scheduler | Triggers Cloud Functions (daily personalize/send) |
| CRM & task management | ClickUp | Central record system, approval queue, pipeline tracking |
| Email sending | Instantly or Smartlead | Cold email delivery, warmup, open/reply tracking |
| LinkedIn outreach | Manual by owner (with AI-drafted copy) | Connection requests + DMs |

### Key Design Decisions

1. **ClickUp is the single source of truth** — every lead lives there with its status, score, enrichment data, and outreach history. No separate databases.
2. **Hunter.io for discovery + enrichment** — combines prospect finding and contact enrichment in a single tool. The Discover API finds companies by industry, geography, and size, and returns verified decision-maker emails, eliminating the need for separate discovery and enrichment tools. Accessed entirely through the Discovery Agent — no manual Hunter.io usage required.
3. **LinkedIn stays manual** — LinkedIn aggressively flags automated outreach. The agent writes the messages, the owner sends them. Keeps the account safe and adds a human touch.
4. **Dedicated cold email tool for sending** — ClickUp's email features are for marketing, not cold outreach deliverability. Instantly or Smartlead handles warmup, rotation, and deliverability at low cost.
5. **Approval queue is async** — owner reviews a batch of 10-20 drafts once per day (15-20 min), not real-time. Pipeline keeps filling while they review.
6. **Gemini 2.5 Flash for personalization** — the personalization and template tasks don't require frontier-model reasoning. Flash is cost-effective and more than capable at this workload.

### Workflow

```
Periodic:  Jenn creates Prospecting Request in ClickUp → Discovery Agent queries Hunter.io → scores leads → ClickUp (status: "Enriched" or "Parked")
Daily:     Personalize agent picks up "Enriched" 3+ → drafts messages → ClickUp (status: "Ready for Review")
Daily:     Jenn reviews → approves/edits → ClickUp (status: "Approved")
Daily:     Send agent picks up "Approved" → sends email sequence → ClickUp (status: "Outreach Active")
Ongoing:   Replies/engagement tracked → warm leads flagged → ClickUp (status: "Responded - Owner Follow-up")
```

### Estimated Monthly Cost

| Item | Estimated Cost |
|------|----------------|
| Hunter.io (Starter) | $34/mo |
| Cold email tool (Instantly/Smartlead) | $30-50/mo |
| Gemini 2.5 Flash API | $2-5/mo |
| Google Cloud Functions + Scheduler | $0-5/mo |
| ClickUp (already planned) | Existing |
| **Total** | **~$66-95/mo** |

### Roles

| Who | Does What |
|-----|-----------|
| SixOhQuad | Builds and maintains all agents (discovery, personalization, send), monitors performance, adjusts targeting strategy, agent configuration |
| ShopJaydees owner (Jenn) | Creates Prospecting Requests in ClickUp to set targeting direction, reviews/approves outreach daily (~15-20 min), handles warm responses, sends LinkedIn messages manually |

---

## 5. Metrics & Success Criteria

### Pipeline Metrics (tracked weekly)

| Stage | Metric | Target |
|-------|--------|--------|
| Discover + Enrich | Companies found with verified decision-maker contacts per request | 50-150 |
| Personalize | Drafts generated per week | 20-90 (based on enrichment yield) |
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
| Enrichment rate below 40% | Hunter.io not finding contacts for target companies | Adjust Discovery Agent filters (industry, geography, company size) |
| Owner spending 30+ min/day on reviews | Too much volume or too many edits needed | Reduce volume, improve draft quality |
| Bounce rate above 5% | Email verification missing bad addresses | Use Hunter.io's email verifier on all addresses before sending, raise confidence threshold |
| LinkedIn connection rate below 15% | Profile or note not compelling | Revise connection request copy |

### Monthly Review Cadence

SixOhQuad and ShopJaydees owner review once a month:
- Pipeline numbers end-to-end (discovery through close)
- Which segments and prospect types are converting best
- Which personalization angles get the most replies
- Adjust targeting, templates, and volume based on data
- Plan seasonal shifts per the campaign calendar

### Definition of Success at 90 Days

- Pipeline running reliably with minimal manual intervention beyond Prospecting Requests and approvals
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
