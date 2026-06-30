# ClickUp Data Model — ShopJaydees Lead Generation Pipeline

## Overview

This document defines the complete ClickUp workspace structure for the ShopJaydees lead generation pipeline. It covers workspace hierarchy, pipeline statuses, every custom field, views, automations, draft message storage, deduplication, and Zapier integration points.

ClickUp is the single source of truth. Every lead, every draft message, every approval decision, and every engagement data point lives here. Three actors interact with the workspace:

1. **Owner (Jenn)** — creates Prospecting Requests to set targeting direction, reviews drafts, approves/edits/rejects, follows up on warm responses, sends LinkedIn messages manually
2. **Personalization agent** — reads enriched leads, scrapes prospect websites, generates draft email sequences + LinkedIn message, writes them back to ClickUp
3. **Send agent** — reads approved leads + their approved messages, pushes to Instantly, updates ClickUp with campaign IDs and send status
4. **Discovery agent** — picks up Prospecting Requests, queries Hunter.io Discover API, finds and enriches companies, scores leads, creates tasks in the Prospects list

All four interact via the ClickUp API v2. The owner also uses the ClickUp web/mobile UI directly.

---

## 1. Workspace Structure

Keep it flat and simple. One person, one pipeline, three segments — no need for multiple Spaces or deep folder nesting.

```
Workspace: ShopJaydees
└── Space: Lead Generation
    └── Folder: Outbound Pipeline
        ├── List: Prospects
        └── List: Prospecting Requests
```

### Why This Structure

| Level | Name | Purpose |
|-------|------|---------|
| Workspace | ShopJaydees | Top-level container. The client already has this or will create it. |
| Space | Lead Generation | Separates lead gen work from any other future ClickUp usage (e.g., order management, internal tasks). Allows its own set of statuses and custom fields. |
| Folder | Outbound Pipeline | Groups the pipeline list(s). If we add a "Warm Leads" or "Referrals" list later, it slots in here without restructuring. |
| List | Prospects | **The single list where every lead lives as a task.** All statuses, custom fields, and views attach to this list. One list is correct because: the volume is low (50-150 raw prospects/week), all leads follow the same pipeline, and having one list makes API queries, dedup, and reporting simple. |
| List | Prospecting Requests | **Where Jenn tells the system what to look for.** Each task is a targeting request that the Discovery Agent picks up and executes. Has its own statuses and custom fields (see Section 1b below). |

### What Does NOT Get Its Own List

- **Segments** (Business, School, Team) — handled by a custom field + filtered views, not separate lists. Splitting into three lists would triple the API queries and complicate dedup.
- **Archived/Closed leads** — handled by ClickUp's built-in Closed Statuses section. Leads in terminal states (Won, Lost, Unsubscribed, Bounced) move to closed statuses and drop out of active views automatically.
- **Draft messages** — stored as custom fields on the lead task itself (see Section 6 for full rationale).

### 1b. Prospecting Requests List

This is where Jenn tells the system what to look for. Each task is a targeting request that the Discovery Agent picks up and executes.

#### Statuses (defined at this list level)

| Status Name | Color | Description |
|-------------|-------|-------------|
| **Requested** (default) | Light gray `#c4c4c4` | Jenn created the request, waiting for agent pickup. |
| **Running** | Blue `#4ea8de` | Discovery agent is actively processing this request. |
| **Complete** | Green `#4caf50` | Agent finished, results summary in comments. |
| **Failed** | Red `#f44336` | Agent encountered an error (alert sent to Cody). |

#### Custom Fields

| Field Name | Type | Options | Required | Populated By |
|------------|------|---------|----------|-------------|
| Segment | Dropdown | Business, School, Team | Yes | Jenn |
| Category | Dropdown | (same categories as Prospects list) | Yes | Jenn |
| Target City | Dropdown | (same cities as Prospects list) | Yes | Jenn |
| Max Results | Number | Default: 25 | No | Jenn (optional) |
| Results Found | Number | — | No | Discovery agent |
| Leads Created | Number | — | No | Discovery agent |
| Leads Parked | Number | — | No | Discovery agent |
| Duplicates Skipped | Number | — | No | Discovery agent |

#### Task Naming Convention

```
{Segment} — {Category} in {City}
```

Examples:
- `Schools — Elementary & Secondary in Langley`
- `Business — Trades & Contractors in Surrey`
- `Team — Youth Sports Leagues in Abbotsford`

---

## 2. Pipeline Statuses

Statuses are defined at the List level (the "Prospects" list). ClickUp groups statuses into Active and Closed.

### Active Statuses

These appear in the main board/list views.

| Order | Status Name | Color | Pipeline Stage | Description |
|-------|-------------|-------|----------------|-------------|
| 1 | **New** | Light gray `#c4c4c4` | Import | Just created by Discovery Agent from Hunter.io results. Agent immediately scores and moves to Enriched (3+) or Parked (1-2). Jenn does not interact with leads in this status. |
| 2 | **Enriched** | Blue `#4ea8de` | Qualification | Scored and enriched with Hunter.io contact data. Awaiting personalization agent pickup. Leads scoring 1-2 get moved to Parked instead. |
| 3 | **Personalizing** | Purple `#ab6ee1` | Personalization | Personalization agent is actively working on this lead (website scrape + draft generation). Transient status — prevents another agent run from double-picking. |
| 4 | **Ready for Review** | Orange `#ff9800` | Approval queue | Drafts generated. Awaiting owner review. |
| 5 | **Approved** | Teal `#36b37e` | Send queue | Owner approved (as-is or after edits). Awaiting send agent pickup. |
| 6 | **Outreach Active** | Dark blue `#2196f3` | Sending | Pushed to Instantly. 3-touch sequence in progress. |
| 7 | **Responded - Owner Follow-up** | Gold `#ffc107` | Warm lead | Prospect replied. Owner needs to follow up personally. |
| 8 | **Parked** | Light brown `#bcaaa4` | Holding | Score 1-2, or manually parked. Can be re-evaluated later. |

### Closed Statuses

These are terminal states. ClickUp collapses them out of active views.

| Status Name | Color | Description |
|-------------|-------|-------------|
| **Won** | Green `#4caf50` | Converted to a customer (quote accepted, order placed). |
| **Lost** | Red `#f44336` | Owner decided not to pursue, or prospect explicitly declined. |
| **Dormant** | Gray `#9e9e9e` | 3-touch sequence completed with no response. 90-day cool-off before re-engagement. |
| **Unsubscribed** | Dark red `#b71c1c` | Prospect opted out. **Never contact again.** |
| **Bounced** | Dark gray `#616161` | Email address bounced. Lead removed from active outreach. |

### Status Transition Map

```
    Discovery Agent creates lead:
          New ──── (agent scores 1-2) ──── Parked
           │                                 │
           │ Agent scores 3+                 │ Re-scored 3+ (manual or re-eval)
           ▼                                 ▼
       Enriched ◄────────────────────────────┘
           │
           │ Personalization agent picks up
           ▼
     Personalizing
           │
           │ Drafts written
           ▼
   Ready for Review
      │    │    │
      │    │    └──── Reject ──── back to Enriched (with note)
      │    │                      or Parked (if fundamentally bad fit)
      │    │
      │    └──── "I know this person" ──── Responded - Owner Follow-up
      │                                     (warm intro path)
      │
      └──── Approve (as-is or after edit)
              │
              ▼
          Approved
              │
              │ Send agent picks up
              ▼
       Outreach Active
         │    │    │    │
         │    │    │    └──── Bounce ──── Bounced (closed)
         │    │    │
         │    │    └──── Unsubscribe ──── Unsubscribed (closed)
         │    │
         │    └──── Reply ──── Responded - Owner Follow-up
         │
         └──── 3 touches, no response ──── Dormant (closed)

    Responded - Owner Follow-up
         │    │
         │    └──── Deal progresses ──── Won (closed)
         │
         └──── Prospect declines / no fit ──── Lost (closed)

    Dormant ──── (after 90 days, re-evaluate) ──── Enriched or Parked
```

---

## 3. Custom Fields

All custom fields are defined on the **Prospects** list. Organized by category. Every field includes its exact name, type, options, whether it is required, and which system populates it.

### Naming Convention

Field names use Title Case with no prefix. Categories are logical groupings for this document — ClickUp does not have field categories, but the fields will be visually ordered in this sequence on the task detail view.

---

### 3.1 Contact & Company Info

These fields come from Hunter.io enrichment and are populated during the import step.

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Company Name** | Short Text | — | Yes | Hunter.io import | The task name itself will also be set to "Company Name — Contact Name" for readability. This field stores the clean company name for filtering/search. |
| **Company Domain** | URL | — | Yes | Hunter.io import | e.g., `https://abcplumbing.ca`. Primary dedup key. |
| **Company Industry** | Short Text | — | No | Hunter.io import | Industry as reported by Hunter.io (e.g., "Construction", "Education"). |
| **Company Headcount** | Short Text | — | No | Hunter.io import | Headcount range from Hunter.io (e.g., "11-50", "51-200"). |
| **Company City** | Dropdown | `Surrey`, `Langley`, `Abbotsford`, `Chilliwack`, `Mission`, `Maple Ridge`, `Burnaby`, `New Westminster`, `Coquitlam`, `Port Coquitlam`, `Pitt Meadows`, `Richmond`, `Delta`, `North Vancouver`, `Vancouver`, `Other` | Yes | Hunter.io import | Maps to geographic phases. Dropdown enables easy filtering. |
| **Contact Name** | Short Text | — | Yes | Hunter.io import | Decision-maker's full name. |
| **Contact Title** | Short Text | — | No | Hunter.io import | e.g., "Owner", "Principal", "Operations Manager". |
| **Contact Email** | Email | — | Yes | Hunter.io import | Verified email from Hunter.io. Primary outreach address. |
| **Email Confidence** | Number | 0-100, whole numbers | No | Hunter.io import | Hunter.io's confidence score for the email address. |
| **Contact LinkedIn** | URL | — | No | Hunter.io import or manual | LinkedIn profile URL. Used for LinkedIn outreach. |
| **Contact Phone** | Phone | — | No | Hunter.io import or manual | Optional. Some Hunter.io results include phone. |

---

### 3.2 Lead Qualification

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Segment** | Dropdown | `Business`, `School`, `Team` | Yes | Hunter.io import | Primary segmentation. Drives template selection and reporting. |
| **Category** | Dropdown | `Trades & Contractors`, `Restaurants & Hospitality`, `Fitness & Wellness`, `Real Estate & Property Mgmt`, `Auto & Trades Shops`, `Elementary & Secondary`, `Independent & Private Schools`, `Daycares & Preschools`, `Post-Secondary Clubs`, `Youth Sports Leagues`, `Adult Rec Leagues`, `Dance & Performance`, `Community Sport Orgs`, `Other` | Yes | Hunter.io import | Sub-segment category from the targeting strategy. "Other" for prospects that don't fit neatly. |
| **Lead Score** | Number | 1-5, whole numbers | Yes | Discovery agent | See scoring rubric in Section 2 of the design spec. Only 3+ proceed to personalization. |
| **Score Rationale** | Long Text (plain) | — | No | Owner or agent | Brief note explaining the score. Useful for learning and recalibration. |
| **Geographic Phase** | Dropdown | `Phase 1 - Fraser Valley Core`, `Phase 2 - Tri-Cities & Burnaby`, `Phase 3 - Metro Vancouver`, `Future - Rest of BC+` | No | Derived from Company City | Which expansion phase this prospect falls into. Informational. |

---

### 3.3 CASL Compliance

These fields are legally required for every lead that receives cold outreach. They document the basis under Canada's Anti-Spam Legislation for contacting this person.

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **CASL Source URL** | URL | — | Yes (before outreach) | Hunter.io import / agent | The URL where the email address was found. Must be the company's own website (not a third-party directory). Hunter.io provides the source URLs. |
| **CASL Opt-Out Check** | Checkbox | Checked = confirmed no "do not contact" on source page | Yes (before outreach) | Personalization agent | Agent checks the prospect's website for any "do not contact" or "do not solicit" statements during the website scrape. |
| **CASL Relevance Rationale** | Long Text (plain) | — | Yes (before outreach) | Personalization agent | One sentence explaining why custom apparel outreach is relevant to this person's role. e.g., "Operations Manager at a 50-person construction company — likely responsible for ordering crew uniforms and branded safety gear." |
| **CASL Consent Basis** | Dropdown | `Conspicuous Publication`, `Existing Business Relationship`, `Referral`, `Express Consent` | Yes (before outreach) | Personalization agent / owner | Which CASL exemption applies. Almost always "Conspicuous Publication" for cold outreach (email was published on their company website). "Referral" when owner flags "I know this person". |
| **CASL Date Verified** | Date | YYYY-MM-DD | Yes (before outreach) | Personalization agent | Date when compliance fields were populated/verified. |

---

### 3.4 Personalization & Draft Messages

These fields are populated by the personalization agent during the website scrape and draft generation phase.

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Website Scrape Summary** | Long Text (plain) | — | No | Personalization agent | Structured summary of what was found on the prospect's website: what they do, services, brand feel. Kept for reference and audit trail. |
| **Community Signals** | Long Text (plain) | — | No | Personalization agent | Any community involvement, sponsorships, charity work, or causes found on the website. These are bridges to the Wear It Forward angle. Empty if none found. |
| **Personalization Hooks** | Long Text (plain) | — | No | Personalization agent | Key personalization elements the agent identified: recent news, seasonal timing, specific services to reference. Working notes that explain *why* the drafts say what they say. |
| **Email Touch 1** | Long Text (rich text) | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Day 0 — Intro + value prop. Full email body (no subject line — subject is a separate field). |
| **Email Touch 1 Subject** | Short Text | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Subject line for Touch 1. |
| **Email Touch 2** | Long Text (rich text) | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Day 4 — Value-add follow-up. Full email body. |
| **Email Touch 2 Subject** | Short Text | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Subject line for Touch 2. |
| **Email Touch 3** | Long Text (rich text) | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Day 9 — Friendly check-in. Full email body. |
| **Email Touch 3 Subject** | Short Text | — | Yes (at Ready for Review) | Personalization agent; owner may edit | Subject line for Touch 3. |
| **LinkedIn Message** | Long Text (plain) | — | No | Personalization agent; owner may edit | LinkedIn connection request note. Short, personal, no sell. Owner sends this manually. |

---

### 3.5 Owner Review

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Review Decision** | Dropdown | `Pending Review`, `Approved`, `Approved with Edits`, `Rejected`, `I Know This Person` | Yes (at Ready for Review) | Owner | Defaults to "Pending Review" when personalization agent moves to Ready for Review. Owner selects one of the other options. |
| **Rejection Note** | Long Text (plain) | — | No | Owner | Why the drafts were rejected. Helps tune personalization over time. |
| **Review Date** | Date | YYYY-MM-DD | No | Owner / ClickUp automation | When the owner made their review decision. Auto-set by ClickUp automation when Review Decision changes from Pending Review. |
| **Owner Notes** | Long Text (plain) | — | No | Owner | Free-form notes. "I met this person at a trade show", "Their competitor is already a client — be careful", etc. |

---

### 3.6 Outreach Tracking

These fields track the actual sending and engagement. Populated by the send agent and Zapier syncing from Instantly.

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Instantly Campaign ID** | Short Text | — | No | Send agent | The Instantly campaign this lead was added to. Needed for Zapier lookups and debugging. |
| **Instantly Lead ID** | Short Text | — | No | Send agent | The lead ID within Instantly. Used by Zapier to match engagement events back to the ClickUp task. |
| **Sending Domain** | Dropdown | `shopjaydees.ca`, `shopjaydees.net` | No | Send agent | Which sending domain was used. For tracking deliverability per domain. |
| **Outreach Started Date** | Date | epoch ms | No | Send agent | When the lead was activated into Instantly (status → Outreach Active). The reply-poll agent's Phase B sweep reads this to decide a sequence is complete (older than `SEQUENCE_COMPLETE_AFTER_DAYS`, default 14) and moves the lead to Dormant. Added 2026-06-29. |
| **Sequence Status** | Dropdown | `Not Started`, `Touch 1 Sent`, `Touch 2 Sent`, `Touch 3 Sent`, `Sequence Complete`, `Paused`, `Cancelled` | No | Send agent / Zapier | Tracks where in the 3-touch sequence this lead is. Updated by Zapier as Instantly sends each touch. |
| **Touch 1 Sent Date** | Date | YYYY-MM-DD | No | Zapier | When Touch 1 was actually sent. |
| **Touch 2 Sent Date** | Date | YYYY-MM-DD | No | Zapier | When Touch 2 was sent. |
| **Touch 3 Sent Date** | Date | YYYY-MM-DD | No | Zapier | When Touch 3 was sent. |
| **Opens** | Number | Whole number | No | Zapier | Total email opens across all touches. |
| **Replies** | Number | Whole number | No | Zapier | Total replies received. |
| **Last Open Date** | Date | YYYY-MM-DD | No | Zapier | Most recent email open. |
| **Last Reply Date** | Date | epoch ms | No | Reply-poll agent | Most recent reply. Set by the reply-poll agent (was Zapier; superseded 2026-06-29). |
| **Bounced** | Checkbox | — | No | Zapier | Checked if any email in the sequence bounced. |
| **Unsubscribed** | Checkbox | — | No | Zapier | Checked if the prospect clicked an unsubscribe link. |
| **Dormant Date** | Date | YYYY-MM-DD | No | Automation / agent | Date the lead entered Dormant status. Used to calculate the 90-day cool-off. |
| **Dormant Reactivation Date** | Date | YYYY-MM-DD | No | Automation | Dormant Date + 90 days. When this lead becomes eligible for re-engagement. |

---

### 3.7 Metadata

| Field Name | Type | Options / Format | Required | Populated By | Notes |
|------------|------|------------------|----------|-------------|-------|
| **Import Batch** | Short Text | — | No | Import process | Identifier for the Hunter.io import session (e.g., "2026-06-08-schools-surrey"). Groups leads that were imported together for tracking and debugging. |
| **Seasonal Campaign** | Dropdown | `Spring Sports + Trades`, `Summer Early Lock-in`, `Back to School + Fall Sports`, `Year-End + Holiday`, `New Year Fresh Look` | No | Agent or owner | Which seasonal campaign calendar period this lead is being targeted in. |

---

### Custom Field Count Summary

| Category | Field Count |
|----------|------------|
| Contact & Company Info | 11 |
| Lead Qualification | 5 |
| CASL Compliance | 5 |
| Personalization & Draft Messages | 10 |
| Owner Review | 4 |
| Outreach Tracking | 16 |
| Metadata | 2 |
| **Total** | **53** |

This is a high field count. In ClickUp, custom fields on a task are only visible when populated or when the user scrolls through the field panel, so the empty ones for early-stage leads (e.g., all the outreach tracking fields) will not clutter the UI. The views defined in Section 4 will show only the relevant fields for each workflow.

---

## 4. Views

Views are saved filters/layouts on the Prospects list. The owner uses the ClickUp UI views. The agents use equivalent API queries (filter by status, sort by date).

### 4.1 Owner's Daily Views

These are the views the owner interacts with during their 15-20 minute daily review.

#### View: Approval Queue

- **Type**: List view
- **Filter**: Status = "Ready for Review"
- **Sort**: Lead Score descending (highest-value leads first), then date created ascending (oldest first)
- **Visible columns**: Company Name, Contact Name, Segment, Category, Lead Score, Email Touch 1 Subject, Review Decision
- **Purpose**: The primary daily view. Owner opens each task, reads the draft emails, approves/edits/rejects.
- **Grouping**: By Segment

#### View: My Follow-ups

- **Type**: List view
- **Filter**: Status = "Responded - Owner Follow-up"
- **Sort**: Last Reply Date descending (most recent replies first)
- **Visible columns**: Company Name, Contact Name, Segment, Contact Email, Contact LinkedIn, Last Reply Date, Owner Notes
- **Purpose**: Warm leads that need personal follow-up. Owner handles these after approvals.

#### View: Pipeline Board

- **Type**: Board (Kanban) view
- **Grouping**: By status
- **Filter**: Exclude closed statuses (show only active pipeline)
- **Purpose**: Visual overview of the entire pipeline. See how many leads are at each stage. Drag-and-drop for manual status changes.
- **Color coding**: Tasks colored by Segment (Business = blue, School = green, Team = orange)

#### View: Active Outreach

- **Type**: List view
- **Filter**: Status = "Outreach Active"
- **Sort**: Touch 1 Sent Date ascending
- **Visible columns**: Company Name, Contact Name, Segment, Sequence Status, Opens, Replies, Sending Domain
- **Purpose**: Monitor what is currently being sent. Spot engagement patterns.

#### View: LinkedIn Queue

- **Type**: List view
- **Filter**: Status IN ("Ready for Review", "Approved", "Outreach Active") AND LinkedIn Message IS NOT EMPTY
- **Sort**: Status order, then Lead Score descending
- **Visible columns**: Company Name, Contact Name, Contact LinkedIn, LinkedIn Message, Segment
- **Purpose**: Owner's reference when doing manual LinkedIn outreach. Shows all leads that have a LinkedIn message draft, grouped by where they are in the pipeline.

#### View: Parked Leads

- **Type**: List view
- **Filter**: Status = "Parked"
- **Sort**: Lead Score descending, then date created ascending
- **Visible columns**: Company Name, Segment, Category, Lead Score, Score Rationale, Company City
- **Purpose**: Occasional review of parked leads. Owner can re-score and promote to Enriched. Not a daily task — check weekly or when prospecting in a new segment.

#### View: Won Deals

- **Type**: List view
- **Filter**: Status = "Won"
- **Sort**: Date closed descending
- **Visible columns**: Company Name, Contact Name, Segment, Category, Company City, Owner Notes
- **Purpose**: Track successes. Monthly review reference.

#### View: Prospecting Requests

- **Type**: List view
- **Filter**: List = Prospecting Requests (this is a separate list, not a filter on Prospects)
- **Sort**: Date created descending
- **Visible columns**: Task name, Segment, Category, Target City, Status, Results Found, Leads Created
- **Purpose**: Jenn sees her targeting requests and their results. She creates new requests here.

#### View: Weekly Dashboard

- **Type**: List view
- **Filter**: Date created within last 7 days (for new leads) — OR use a ClickUp Dashboard widget instead
- **Purpose**: Weekly overview of pipeline activity. Best implemented as a ClickUp Dashboard (see note below).

**ClickUp Dashboard Note**: In addition to list views, create a ClickUp Dashboard called "Pipeline Health" with the following widgets:
- Status Distribution (pie chart) — how many leads at each stage
- New Leads This Week (count) — tasks created in last 7 days
- Leads by Segment (bar chart) — segment distribution
- Approval Rate (calculated) — Approved / (Approved + Rejected) in last 30 days
- Active Outreach count — tasks in Outreach Active status

### 4.2 Agent API Queries

The agents do not use ClickUp views directly — they query the API with filters. These are the logical queries each agent makes.

#### Discovery Agent — Runs on Schedule (or On-Demand)

```
Query: Get tasks from Prospecting Requests list
  WHERE status = "Requested"
  ORDER BY date_created ASC
```

The agent processes each request:
1. Sets status to "Running"
2. Queries Hunter.io Discover API with Segment, Category, Target City parameters
3. For each result: dedup check against Prospects list (by Company Domain, including closed tasks)
4. Creates new lead tasks in the Prospects list with status "New"
5. Automatically scores each lead (1-5) using the scoring rubric
6. Moves scored leads to "Enriched" (score 3+) or "Parked" (score 1-2)
7. Updates the Prospecting Request task: Results Found, Leads Created, Leads Parked, Duplicates Skipped
8. Adds a comment with detailed results summary
9. Sets request status to "Complete"

If the agent encounters an error, it sets the request status to "Failed" and adds a comment with the error details.

#### Personalization Agent — Daily Run

```
Query: Get tasks from Prospects list
  WHERE status = "Enriched"
  AND lead_score >= 3
  ORDER BY lead_score DESC, date_created ASC
  LIMIT 25 (configurable batch size)
```

The agent processes each task:
1. Immediately sets status to "Personalizing" (prevents double-pick on overlapping runs)
2. Reads Company Domain, Contact Name, Contact Title, Segment, Category
3. Scrapes the company website
4. Populates: Website Scrape Summary, Community Signals, Personalization Hooks, all Email Touch fields, LinkedIn Message, CASL fields
5. Sets Review Decision to "Pending Review"
6. Sets status to "Ready for Review"

If the scrape or generation fails, the agent sets status back to "Enriched" and logs the error in a task comment.

#### Send Agent — Daily Run

```
Query: Get tasks from Prospects list
  WHERE status = "Approved"
  ORDER BY lead_score DESC, date_created ASC
```

The agent processes each task:
1. Reads Contact Email, Contact Name, all Email Touch fields + subjects
2. Creates a lead + campaign in Instantly (or adds to an existing campaign)
3. Populates: Instantly Campaign ID, Instantly Lead ID, Sending Domain, Sequence Status = "Not Started"
4. Sets status to "Outreach Active"

#### Zapier — Engagement Sync

Zapier does not query ClickUp — it receives webhook events from Instantly and updates ClickUp by searching for the matching task (see Section 8).

---

## 5. ClickUp-Native Automations

These are automations configured within ClickUp's Automation feature (not code — these are point-and-click rules).

### Automation 1: Set Review Date on Decision

- **Trigger**: Custom field "Review Decision" changes from "Pending Review" to any other value
- **Action**: Set custom field "Review Date" to today's date
- **Purpose**: Automatically records when the owner reviewed the lead, without requiring them to set a date manually.

### Automation 2: Flag Bounce — Move to Bounced

- **Trigger**: Custom field "Bounced" checkbox is checked (set by Zapier)
- **Action**: Change status to "Bounced"
- **Purpose**: Automatically removes bounced leads from the active pipeline.

### Automation 3: Flag Unsubscribe — Move to Unsubscribed

- **Trigger**: Custom field "Unsubscribed" checkbox is checked (set by Zapier)
- **Action**: Change status to "Unsubscribed"
- **Purpose**: Immediately removes opted-out leads. CASL compliance — no further contact.

### Automation 4: Reply Detected — Flag for Follow-up

- **Trigger**: Custom field "Replies" changes AND new value >= 1
- **Action**: Change status to "Responded - Owner Follow-up"
- **Secondary action**: Send notification to owner (ClickUp notification + email)
- **Purpose**: Warm leads get flagged immediately so the owner can respond quickly. Speed to reply matters.

### Automation 5: Sequence Complete — Check for Dormancy

- **Trigger**: Custom field "Sequence Status" changes to "Sequence Complete"
- **Condition**: Custom field "Replies" equals 0
- **Action**: Change status to "Dormant", set "Dormant Date" to today, set "Dormant Reactivation Date" to today + 90 days
- **Purpose**: Leads that completed all 3 touches with no response automatically enter the 90-day cool-off.

### Automation 6: Rejection — Move Back to Enriched

- **Trigger**: Custom field "Review Decision" changes to "Rejected"
- **Action**: Change status to "Enriched"
- **Purpose**: Rejected leads re-enter the queue. The personalization agent will pick them up again on the next run and can use the Rejection Note to adjust. If the rejection is because the lead is a bad fit (not just bad copy), the owner should manually move to Parked instead.

### Automation 7: "I Know This Person" — Move to Follow-up

- **Trigger**: Custom field "Review Decision" changes to "I Know This Person"
- **Action**: Change status to "Responded - Owner Follow-up"
- **Purpose**: Owner bypasses the automated outreach entirely and handles this as a warm intro.

### Automation 8: Daily Review Reminder

- **Trigger**: Recurring daily at 8:00 AM Pacific
- **Condition**: There are tasks with status "Ready for Review"
- **Action**: Send notification to owner: "You have leads waiting for review"
- **Purpose**: Keeps the daily review habit on track. ClickUp supports scheduled automations on paid plans.

---

## 6. Draft Message Storage — Design Decision

### The Question

Where do the AI-generated draft emails and LinkedIn message live within a ClickUp task?

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A. Custom fields (Long Text)** | Structured, individually addressable via API, owner sees each touch as a distinct field, agent can read/write specific touches | Many fields (6 for emails + subjects, 1 for LinkedIn = 7 fields). Long Text fields have a 10,000 character limit per field (more than enough for an email). |
| **B. Task description** | Single rich-text area, lots of space, easy to read | Only one description per task. Would need to use formatting/headers to separate touches. API has to parse the full description to extract individual touches. Hard for the send agent to reliably extract Touch 1 vs Touch 2. |
| **C. Comments** | Unlimited space, threaded discussion possible | Comments are append-only — cannot be edited by a different user via API. Owner cannot easily edit a comment posted by the agent. Comments are chronological, not structured. Agent would need to parse comment threads. |
| **D. Subtasks** | Each touch is its own subtask, can have its own status | Over-engineers a simple 3-email sequence. Creates 3-4 subtasks per lead (300-600 subtasks per week at volume). Complicates API queries. Owner has to click into each subtask. |

### Decision: Option A — Custom Fields

Each email touch gets two custom fields (body + subject line), and the LinkedIn message gets one. Total: 7 fields for draft messages.

**Why this is the right choice:**

1. **API clarity**: The personalization agent writes to `Email Touch 1`, `Email Touch 1 Subject`, etc. The send agent reads those exact fields. No parsing, no ambiguity.
2. **Owner editing**: In the ClickUp task detail view, the owner sees each touch as a labeled field. They can click into any field and edit the text directly. They know exactly what they are approving.
3. **Atomic operations**: If the owner edits Touch 2 but leaves Touch 1 and 3 alone, the send agent picks up the correct version of each. With a description or comments approach, edits risk accidentally changing adjacent content.
4. **Filtering**: ClickUp can filter on whether a field is empty or not. The LinkedIn Queue view filters on "LinkedIn Message IS NOT EMPTY" — this would not be possible with description or comment storage.
5. **Field limit is a non-issue**: ClickUp's free plan supports unlimited custom fields on a list. The 53 total fields are well within limits.

**Trade-off acknowledged**: The task detail panel will show many fields. This is managed by:
- ClickUp's field ordering — put the draft message fields in a contiguous block so the owner sees them together
- Fields that are empty do not take up visual space in ClickUp's detail panel (they collapse)
- The Approval Queue view shows only the columns relevant to review, not all 53 fields

---

## 7. Deduplication Strategy

### The Problem

The Discovery Agent runs periodic Hunter.io searches and imports batches of leads. The same company (or even the same contact) may appear in multiple searches — a plumber in Surrey could appear in both a "plumbing company Surrey" and a "trades contractor Fraser Valley" search.

### Dedup Key

**Primary key: Company Domain** (the `Company Domain` custom field).

Two leads with the same domain are the same company. This is the strongest dedup signal because:
- Company names have variations ("ABC Plumbing" vs "ABC Plumbing Ltd." vs "A.B.C. Plumbing")
- Email addresses could have multiple contacts at the same company
- Domain is canonical and unique per company

**Secondary check: Contact Email** (the `Contact Email` custom field).

If the domain is the same, check if the contact email is also the same. If so, it is a true duplicate. If the domain matches but the email differs, it may be a second decision-maker at the same company — flag for owner review rather than auto-skipping.

### Can ClickUp Enforce Uniqueness?

**No.** ClickUp does not have unique constraints on custom fields. There is no way to tell ClickUp "reject a task if Company Domain already exists."

### How Dedup Works in Practice

Deduplication is enforced at import time by the import process (either a script or the personalization agent).

#### Import-Time Dedup Flow

```
For each prospect in the Hunter.io export:
  1. Query ClickUp API: GET tasks from Prospects list
     WHERE Company Domain = [this prospect's domain]
  
  2. If no match found:
     → Create new task. Proceed normally.
  
  3. If match found AND Contact Email is the same:
     → Skip. This is a true duplicate. Log it.
  
  4. If match found AND Contact Email is different:
     → Create the task but add a tag "possible-duplicate"
     → Add a comment: "Another contact at [domain] — existing lead: [link to existing task]"
     → Owner reviews during their next session.
```

#### ClickUp API Query for Dedup

The ClickUp API v2 supports filtering tasks by custom field values. The dedup query:

```
GET /list/{list_id}/task?custom_fields=[{"field_id": "{company_domain_field_id}", "operator": "=", "value": "{domain}"}]
```

This returns any existing tasks with the same domain. The Discovery Agent checks the result before creating a new task.

#### Dedup Against Closed Statuses

Critically, the dedup check must include tasks in **closed statuses** (Won, Lost, Dormant, Unsubscribed, Bounced). This prevents:
- Re-contacting someone who unsubscribed (CASL violation)
- Re-importing a company that was already won or lost
- Re-importing a bounced contact

The API query must set `include_closed=true`:

```
GET /list/{list_id}/task?custom_fields=[...]&include_closed=true
```

#### Special Case: Dormant Re-engagement

When a Dormant lead's 90-day cool-off expires, it should not be re-imported as a new lead. Instead:
1. A scheduled check (weekly) queries Dormant tasks where `Dormant Reactivation Date <= today`
2. Eligible leads are moved back to "Enriched" status for re-personalization with a fresh angle
3. This keeps the full history on the same task

---

## 8. Zapier Integration Points

> **SUPERSEDED 2026-06-29 — Zapier retired.** All six zaps below and the engagement-sync
> automations are replaced by the **reply-poll agent** (`runReplyPoll`, `ff.http("replyPoll")`),
> a scheduled Cloud Function that polls the Instantly `GET /emails` API. This change was forced
> by Jenn's Instantly **Growth** plan: webhooks (which the native Zapier "instant" triggers rely
> on) require Hypergrowth. See `2026-06-29-instantly-reply-poll-agent-design.md`. Scope changes
> from the original Zapier design:
> - **Replies** (Zap 3): now set by the reply-poll agent → status **Responded - Owner Follow-up**, assign Jenn, set Last Reply Date, comment with snippet.
> - **Auto-replies**: tagged `auto-reply`, no status change (new — distinguishes out-of-office from genuine replies).
> - **Sequence complete → Dormant** (Zap 6): now the agent's time-based Phase B sweep (reads Outreach Started Date), not an Instantly event.
> - **Bounces** (Zap 4): detection logic exists but is **not yet functional** — pending live-payload validation (see the design doc's Go-live section).
> - **Unsubscribes** (Zap 5): **out of scope** — Instantly handles suppression itself; not reflected in ClickUp.
> - **Opens / clicks / per-touch sent dates** (Zaps 1, 2): **dropped** — engagement counters are available in Instantly's own analytics; the agent tracks only status-changing signals.
>
> The detail below is retained for provenance.

Zapier provides bidirectional sync between Instantly and ClickUp. All zaps use the Instantly and ClickUp native Zapier integrations.

### Zap 1: Instantly Email Sent → Update ClickUp Sequence Status

- **Trigger**: Instantly — "Email Sent" event (fires each time a touch is sent)
- **Filter**: Match the Instantly lead email to a ClickUp task (search by Contact Email)
- **Actions**:
  1. Search ClickUp task where Contact Email = [email from Instantly event]
  2. Update the matching task:
     - If this is the first email: Set `Sequence Status` = "Touch 1 Sent", set `Touch 1 Sent Date` = today
     - If second email: Set `Sequence Status` = "Touch 2 Sent", set `Touch 2 Sent Date` = today
     - If third email: Set `Sequence Status` = "Touch 3 Sent", set `Touch 3 Sent Date` = today

**Implementation note**: Instantly's webhook payload includes a `step` or `sequence_step` field indicating which email in the sequence was sent. The Zapier zap uses a Paths step to determine which ClickUp fields to update based on the step number.

### Zap 2: Instantly Email Opened → Update ClickUp Open Count

- **Trigger**: Instantly — "Email Opened" event
- **Filter**: Match by email address
- **Actions**:
  1. Search ClickUp task where Contact Email = [email]
  2. Update the matching task:
     - Increment `Opens` by 1 (Zapier's Formatter step can calculate current value + 1)
     - Set `Last Open Date` = today

### Zap 3: Instantly Reply Received → Flag in ClickUp

- **Trigger**: Instantly — "Reply Received" event
- **Actions**:
  1. Search ClickUp task where Contact Email = [email]
  2. Update the matching task:
     - Increment `Replies` by 1
     - Set `Last Reply Date` = today
  3. The ClickUp Automation (Automation 4) will automatically change the status to "Responded - Owner Follow-up" and notify the owner

**Note**: This zap only updates the data fields. The status change is handled by ClickUp's native automation (Automation 4) triggered by the Replies field change. This separation keeps the logic in one place.

### Zap 4: Instantly Bounce → Flag in ClickUp

- **Trigger**: Instantly — "Email Bounced" event
- **Actions**:
  1. Search ClickUp task where Contact Email = [email]
  2. Update the matching task:
     - Check the `Bounced` checkbox
  3. The ClickUp Automation (Automation 2) handles the status change to "Bounced"

### Zap 5: Instantly Unsubscribe → Flag in ClickUp

- **Trigger**: Instantly — "Unsubscribe" event
- **Actions**:
  1. Search ClickUp task where Contact Email = [email]
  2. Update the matching task:
     - Check the `Unsubscribed` checkbox
  3. The ClickUp Automation (Automation 3) handles the status change to "Unsubscribed"

### Zap 6: Instantly Sequence Complete → Update ClickUp

- **Trigger**: Instantly — "Sequence Completed" event (all scheduled emails in the campaign for this lead have been sent)
- **Actions**:
  1. Search ClickUp task where Contact Email = [email]
  2. Set `Sequence Status` = "Sequence Complete"
  3. The ClickUp Automation (Automation 5) checks if Replies = 0 and moves to Dormant if so

### Zapier Zap Summary

| # | Trigger (Instantly) | Action (ClickUp) | Fields Updated |
|---|--------------------|--------------------|----------------|
| 1 | Email Sent | Update task | Sequence Status, Touch N Sent Date |
| 2 | Email Opened | Update task | Opens (+1), Last Open Date |
| 3 | Reply Received | Update task | Replies (+1), Last Reply Date |
| 4 | Email Bounced | Update task | Bounced (checked) |
| 5 | Unsubscribe | Update task | Unsubscribed (checked) |
| 6 | Sequence Complete | Update task | Sequence Status = "Sequence Complete" |

### Zapier Plan Requirements

The Starter plan at $19.99/mo provides:
- 750 tasks/month — sufficient for the expected volume (50-150 prospects/week = 200-600 tasks created, plus multiple zap events per lead, but many are simple updates)
- Multi-step zaps — needed for the Search + Update pattern
- Paths — needed for Zap 1 to determine which touch was sent
- Filters — needed to match events to tasks

**Volume estimate**: At 80 leads/week in active outreach, each lead generates approximately 6-8 Zapier tasks (3 sends + opens + possible reply + sequence complete). That is 480-640 tasks/month from engagement events alone, plus imports. The 750 task limit should be sufficient initially. If volume scales up, the next Zapier tier (Professional, 2,000 tasks/month) is available.

---

## 9. Task Naming Convention

Each lead task in ClickUp follows this naming pattern:

```
{Company Name} — {Contact Name}
```

Examples:
- `Fraser Valley Plumbing — Mike Thompson`
- `Langley Secondary School — Sarah Chen`
- `Surrey Minor Hockey — David Park`

This puts the company name first (which the owner recognizes) and the contact second. It reads well in list views, board views, and search results.

If a second contact is imported for the same company (different decision-maker), the task names naturally differentiate:
- `Fraser Valley Plumbing — Mike Thompson`
- `Fraser Valley Plumbing — Lisa Rodriguez`

---

## 10. Tags Strategy

ClickUp tags are used for lightweight cross-cutting labels that do not fit into custom fields.

| Tag | Applied By | Purpose |
|-----|-----------|---------|
| `possible-duplicate` | Discovery agent | Flags leads that share a domain with an existing lead but have a different contact email. Owner reviews. |
| `re-engagement` | Dormancy reactivation process | Marks leads re-entering the pipeline after a 90-day dormancy cool-off. Personalization agent uses this to generate a different angle. |
| `warm-intro` | Owner (via "I Know This Person") | Marks leads where the owner has a personal connection. These skip automated outreach. |
| `high-priority` | Owner | Manual flag for leads the owner wants to prioritize. |
| `seasonal-{campaign}` | Agent or owner | e.g., `seasonal-back-to-school`. Groups leads by the seasonal campaign they were targeted in. Lightweight alternative to the Seasonal Campaign dropdown for quick filtering. |

---

## 11. Implementation Checklist

Step-by-step setup sequence, in order, once the owner's ClickUp workspace is available.

1. **Create Space**: "Lead Generation" with the status set defined in Section 2
2. **Create Folder**: "Outbound Pipeline" inside the Space
3. **Create List**: "Prospects" inside the Folder, inheriting the Space's statuses
3b. **Create List**: "Prospecting Requests" inside the Folder, with its own statuses (Requested, Running, Complete, Failed) and custom fields (Segment, Category, Target City, Max Results, Results Found, Leads Created, Leads Parked, Duplicates Skipped)
4. **Create all custom fields** on the Prospects list (Section 3, all 53 fields)
5. **Record custom field IDs**: After creation, note each field's UUID from the ClickUp API — these go into the pipeline code's `.env` configuration
6. **Create views** (Section 4): Approval Queue, My Follow-ups, Pipeline Board, Active Outreach, LinkedIn Queue, Parked Leads, Won Deals, Prospecting Requests
7. **Create Dashboard**: "Pipeline Health" with the widgets described in Section 4
8. **Set up automations** (Section 5): all 8 automations
9. **Create Zapier zaps** (Section 8): all 6 zaps, connecting to the Instantly account
10. **Test the import flow**: Manually create 2-3 test leads, verify fields populate, statuses transition, and automations fire correctly
11. **Test the Zapier flow**: Send a test email through Instantly, verify engagement data flows back to ClickUp
12. **Configure agent environment variables**: Populate all `CLICKUP_FIELD_*` env vars with the actual field UUIDs

---

## 12. ClickUp API Field ID Mapping

Once the workspace is set up, each custom field gets a UUID from ClickUp. These UUIDs are needed in the pipeline code's configuration. The mapping will look like:

```env
# Contact & Company Info
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

# Lead Qualification
CLICKUP_FIELD_SEGMENT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CATEGORY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LEAD_SCORE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SCORE_RATIONALE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_GEOGRAPHIC_PHASE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# CASL Compliance
CLICKUP_FIELD_CASL_SOURCE_URL=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_OPT_OUT_CHECK=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_CONSENT_BASIS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_DATE_VERIFIED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Personalization & Draft Messages
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

# Owner Review
CLICKUP_FIELD_REVIEW_DECISION=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REJECTION_NOTE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REVIEW_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_OWNER_NOTES=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Outreach Tracking
CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_INSTANTLY_LEAD_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SENDING_DOMAIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SEQUENCE_STATUS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_TOUCH_1_SENT_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_TOUCH_2_SENT_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_TOUCH_3_SENT_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_OPENS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REPLIES=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LAST_OPEN_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_LAST_REPLY_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_BOUNCED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_UNSUBSCRIBED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_DORMANT_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_DORMANT_REACTIVATION_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Metadata
CLICKUP_FIELD_IMPORT_BATCH=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SEASONAL_CAMPAIGN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

The actual UUIDs will be populated after Step 5 of the implementation checklist by querying:

```
GET /list/{list_id}/field
```

This returns all custom fields with their IDs, names, and types.
