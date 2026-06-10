# API Contracts — ShopJaydees Lead Generation Pipeline

## Overview

This document defines the exact API contracts between every component of the lead generation pipeline. Each section specifies the trigger mechanism, input schema, API call sequences with real endpoints and request/response shapes, output schema mapped to ClickUp custom field names, error handling, and idempotency guarantees.

All components are Google Cloud Functions (Node.js or Python). All ClickUp field names and statuses reference the ClickUp Data Model spec exactly.

### External APIs

| API | Base URL | Auth Method |
|-----|----------|-------------|
| ClickUp API v2 | `https://api.clickup.com/api/v2` | `Authorization: {CLICKUP_API_TOKEN}` header |
| Hunter.io API v2 | `https://api.hunter.io/v2` | `api_key` query parameter |
| Firecrawl API v1 | `https://api.firecrawl.dev/v1` | `Authorization: Bearer {FIRECRAWL_API_KEY}` header |
| Gemini API v1beta | `https://generativelanguage.googleapis.com/v1beta` | `key` query parameter |
| Instantly API v2 | `https://api.instantly.ai/api/v2` | `Authorization: Bearer {INSTANTLY_API_KEY}` header |

---

## Component 1: Discovery Agent (Cloud Function)

### Trigger

Google Cloud Scheduler job fires at **4:00 AM Mon-Fri Pacific** (`0 4 * * 1-5` in `America/Vancouver` timezone). Runs before the Personalization Agent (5 AM) so new leads are ready for personalization the same day.

```
POST /discover

// Optional override body (for manual triggers):
{
  "dry_run": false
}
```

### Input

Reads from the ClickUp **"Prospecting Requests"** list. Each request is a ClickUp task with these fields:

| Field | Type | Description |
|-------|------|-------------|
| Segment | Dropdown | `Business`, `School`, or `Team` |
| Category | Dropdown | Category within the segment (e.g., "Trades & Contractors") |
| Target City | Dropdown | City to search (e.g., "Surrey") |
| Max Results | Number | Maximum companies to return from Hunter.io. Defaults to 25 if empty. |

### Processing Flow

#### Pre-Step: Reset Stale Requests

Before processing new requests, check for any requests stuck in "Running" status for more than 30 minutes (stale from a previous crashed run). Reset them to "Requested".

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_PROSPECTING_LIST_ID}/task
  ?statuses[]=Running
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

For each returned task, check if `date_updated` is more than 30 minutes ago. If so, reset:

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Body:
{
  "status": "Requested"
}
```

Log: `"RESET: Prospecting request {task_id} was stuck in Running for {minutes}min. Reset to Requested."`

#### Step 1: Query ClickUp for Prospecting Requests

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_PROSPECTING_LIST_ID}/task
  ?statuses[]=Requested
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

If no requests found, log `"No pending prospecting requests. Exiting."` and exit cleanly.

#### Step 2: Read Request Parameters

For each request task, extract from `custom_fields`:

| ClickUp Field Name | Variable | Used For |
|---------------------|----------|----------|
| Segment | `segment` | Hunter.io query filter, lead Segment field |
| Category | `category` | Hunter.io industry/sector mapping, lead Category field |
| Target City | `target_city` | Hunter.io location filter, lead Company City field |
| Max Results | `max_results` | Hunter.io result limit. Default 25 if empty. |

#### Step 3: Lock Request — Set Status to "Running"

```
PUT https://api.clickup.com/api/v2/task/{request_task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Running"
}
```

#### Step 4: Query Hunter.io Discover API

Search Hunter.io for companies matching the request criteria.

```
GET https://api.hunter.io/v2/domain-search
  ?company={category_search_term}
  &type=personal
  &limit={max_results}
  &api_key={HUNTER_API_KEY}
```

**Note on Hunter.io endpoint:** Hunter.io's Discover feature for company search may use a different endpoint depending on the API version. Possible endpoints:

- `GET https://api.hunter.io/v2/domain-search` with `company` parameter
- `GET https://api.hunter.io/v2/leads/list/search` (Leads Search API)
- Hunter.io Companies endpoint (if available in their API version)

The logical query parameters are:

| Parameter | Source | Mapping |
|-----------|--------|---------|
| Industry/sector | Category | Map Category to a search term (e.g., "Trades & Contractors" -> "plumbing OR electrical OR HVAC") |
| Location | Target City | `"{target_city}, BC, Canada"` |
| Company size | N/A | All sizes for now |

**The specific endpoint and parameter names need verification during implementation against Hunter.io's current API documentation.** The contract defines the logical data flow; the exact HTTP call may differ.

**Response handling:** For each company result from Hunter.io, extract:

- Company name
- Domain
- Industry
- Headcount
- Decision-maker contacts (name, title, email, confidence, LinkedIn, phone, source URLs)

**Error responses:**

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid API key | Abort entire run. Alert cody@sixohquad.com. |
| 429 | Rate limit exceeded | Stop processing remaining requests. Leave them as "Requested" for the next run. |
| 404 / empty results | No companies found for query | Set Results Found = 0, Leads Created = 0 on the request. Set status to "Complete". Log. |

#### Step 5: Contact Selection — Pick Best Decision-Maker (per company)

From each company's contact list, select the best decision-maker.

**Filter first:** Exclude `type: "generic"` emails (info@, admin@, sales@, etc.). Only consider `type: "personal"`.

**Title priority ranking** (match against `position` field, case-insensitive):

| Priority | Title Keywords |
|----------|---------------|
| 1 | Owner, President, CEO |
| 2 | Principal, Head of School, Director |
| 3 | Manager, Coordinator |
| 4 | Any other title with `confidence >= 70` |

**Tiebreaker:** Higher `confidence` score wins. If still tied, first in array wins.

**No valid contact found:** If no personal emails with `confidence >= 50` exist, skip this company. Log: `"NO_CONTACT: No suitable decision-maker found for {domain}"`.

**CASL Source URL extraction:** From the selected contact's `sources` array, take the first `uri` where `domain` matches the prospect's own domain (not a third-party directory). This becomes the `CASL Source URL` field value.

#### Step 6: Dedup Check — Query ClickUp for Existing Prospects

For each company with a selected contact, check if a prospect already exists:

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task
  ?custom_fields=[{"field_id":"{CLICKUP_FIELD_COMPANY_DOMAIN}","operator":"=","value":"https://{domain}"}]
  &include_closed=true
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

**Dedup decision logic:**

| ClickUp Result | Action |
|---------------|--------|
| No tasks found | Proceed to Step 7 (scoring + task creation) |
| Task found (any status) | **Skip**. Increment Duplicates Skipped counter. Log: `"SKIP: {domain} already exists as task {task_id}"` |
| Task found in `Unsubscribed` status | **Skip**. Log: `"SKIP: {domain} is unsubscribed (task {task_id}). CASL: do not contact."` |

**Important:** The `include_closed=true` parameter is critical. Without it, the query skips tasks in Dormant, Won, Lost, Unsubscribed, and Bounced statuses, which would allow re-importing opted-out contacts (CASL violation).

#### Step 7: Auto-Score Each Lead

Calculate Lead Score automatically using this rubric:

```
Score calculation (automated):

Base score = 3 (default for any lead that passed Hunter.io filters)

+1 if: Email confidence >= 90%
+1 if: Contact title contains Owner/President/CEO/Principal/Director
+1 if: Company headcount >= 11 (not a solo operator)
+1 if: Company has a website domain (not just email)
-1 if: Email confidence < 50%
-1 if: No decision-maker title found (generic or empty)
-1 if: Company headcount unknown or "1-10"

Clamp to range 1-5.

Store the calculation rationale in Score Rationale field:
e.g., "Auto-scored: confidence 92%, Owner title, 11-50 headcount, has domain -> 5"
```

#### Step 8: ClickUp Task Creation with Score-Based Status

```
POST https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "name": "ABC Plumbing Ltd. — Mike Thompson",
  "status": "Enriched",
  "tags": [],
  "custom_fields": [
    {"id": "{CLICKUP_FIELD_COMPANY_NAME}", "value": "ABC Plumbing Ltd."},
    {"id": "{CLICKUP_FIELD_COMPANY_DOMAIN}", "value": "https://abcplumbing.ca"},
    {"id": "{CLICKUP_FIELD_COMPANY_INDUSTRY}", "value": "Construction"},
    {"id": "{CLICKUP_FIELD_COMPANY_HEADCOUNT}", "value": "11-50"},
    {"id": "{CLICKUP_FIELD_COMPANY_CITY}", "value": "Surrey"},
    {"id": "{CLICKUP_FIELD_CONTACT_NAME}", "value": "Mike Thompson"},
    {"id": "{CLICKUP_FIELD_CONTACT_TITLE}", "value": "Owner"},
    {"id": "{CLICKUP_FIELD_CONTACT_EMAIL}", "value": "mike@abcplumbing.ca"},
    {"id": "{CLICKUP_FIELD_EMAIL_CONFIDENCE}", "value": 91},
    {"id": "{CLICKUP_FIELD_CONTACT_LINKEDIN}", "value": "https://linkedin.com/in/mike-thompson-abc"},
    {"id": "{CLICKUP_FIELD_CONTACT_PHONE}", "value": "+16045551234"},
    {"id": "{CLICKUP_FIELD_SEGMENT}", "value": "Business"},
    {"id": "{CLICKUP_FIELD_CATEGORY}", "value": "Trades & Contractors"},
    {"id": "{CLICKUP_FIELD_LEAD_SCORE}", "value": 5},
    {"id": "{CLICKUP_FIELD_SCORE_RATIONALE}", "value": "Auto-scored: confidence 92%, Owner title, 11-50 headcount, has domain -> 5"},
    {"id": "{CLICKUP_FIELD_CASL_SOURCE_URL}", "value": "https://abcplumbing.ca/about"},
    {"id": "{CLICKUP_FIELD_IMPORT_BATCH}", "value": "2026-06-08-trades-surrey"}
  ]
}
```

**Status based on score:**

| Score | Status | Meaning |
|-------|--------|---------|
| 3-5 | `Enriched` | Enters personalization pipeline (picked up by Personalization Agent) |
| 1-2 | `Parked` | Low-quality lead, stored but not actioned |

The "New" status is transient — leads pass through it during creation but are immediately set to their score-based status.

**Dropdown fields note:** For ClickUp dropdown fields (Segment, Category, Company City), the `value` in the API must be the **option order index** (integer), not the text label. The Discovery Agent must maintain a mapping from label to index. Example:

```json
// Segment dropdown: Business=0, School=1, Team=2
{"id": "{CLICKUP_FIELD_SEGMENT}", "value": 0}

// Company City dropdown: Surrey=0, Langley=1, Abbotsford=2, ...
{"id": "{CLICKUP_FIELD_COMPANY_CITY}", "value": 0}
```

The agent must fetch the dropdown options at startup via `GET /list/{list_id}/field` and build the index mapping dynamically.

**Response (200 OK) from task creation:**

```json
{
  "id": "task_xyz789",
  "name": "ABC Plumbing Ltd. — Mike Thompson",
  "status": {
    "status": "Enriched",
    "type": "open"
  },
  "url": "https://app.clickup.com/t/task_xyz789"
}
```

#### Step 9: Update Prospecting Request Task

After processing all companies for a request:

```
PUT https://api.clickup.com/api/v2/task/{request_task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Complete",
  "custom_fields": [
    {"id": "{CLICKUP_FIELD_RESULTS_FOUND}", "value": 25},
    {"id": "{CLICKUP_FIELD_LEADS_CREATED}", "value": 18},
    {"id": "{CLICKUP_FIELD_LEADS_PARKED}", "value": 3},
    {"id": "{CLICKUP_FIELD_DUPLICATES_SKIPPED}", "value": 4}
  ]
}
```

Add a completion comment:

```
POST https://api.clickup.com/api/v2/task/{request_task_id}/comment

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "comment_text": "Completed: 25 companies found, 18 leads created (score 3+), 3 parked (score 1-2), 4 duplicates skipped"
}
```

**If any error occurs** during processing a request:

```
PUT https://api.clickup.com/api/v2/task/{request_task_id}

Body:
{
  "status": "Failed"
}
```

```
POST https://api.clickup.com/api/v2/task/{request_task_id}/comment

Body:
{
  "comment_text": "Error: {error_message}"
}
```

Alert cody@sixohquad.com via the shared error alerting helper.

### Error Handling

Per-request error isolation: one failed request does not kill the processing of other requests. Each request is processed independently.

| Error | Source | Action |
|-------|--------|--------|
| ClickUp 401 | Invalid API token | Abort entire run. Alert cody@sixohquad.com. |
| ClickUp 429 | Rate limit exceeded | Use shared ClickUp rate limiting wrapper (90 req/min throttle + retry). |
| Hunter.io 401 | Invalid API key | Abort entire run. Alert cody@sixohquad.com. |
| Hunter.io 429 | Rate limit exceeded | Stop processing remaining requests. Leave them as "Requested". Alert. |
| Hunter.io quota exhausted | Monthly limit reached | Check via `GET /v2/account`. If `available < max_results`, alert and skip. |
| Unhandled exception | Any | Set current request to "Failed", add error comment, continue to next request. Alert. |

### Output Schema (per run)

The Discovery Agent logs a structured summary:

```json
{
  "run_id": "discover-2026-06-08-040000",
  "timestamp": "2026-06-08T04:05:42Z",
  "requests_found": 3,
  "requests_processed": 3,
  "results": {
    "completed": 2,
    "failed": 1,
    "stale_reset": 0
  },
  "requests": [
    {
      "request_task_id": "req_001",
      "segment": "Business",
      "category": "Trades & Contractors",
      "target_city": "Surrey",
      "results_found": 25,
      "leads_created": 18,
      "leads_parked": 3,
      "duplicates_skipped": 4,
      "status": "completed"
    },
    {
      "request_task_id": "req_002",
      "segment": "School",
      "category": "Elementary Schools",
      "target_city": "Langley",
      "results_found": 12,
      "leads_created": 10,
      "leads_parked": 1,
      "duplicates_skipped": 1,
      "status": "completed"
    },
    {
      "request_task_id": "req_003",
      "segment": "Business",
      "category": "Restaurants & Hospitality",
      "target_city": "Abbotsford",
      "results_found": 0,
      "leads_created": 0,
      "leads_parked": 0,
      "duplicates_skipped": 0,
      "status": "failed",
      "error": "Hunter.io 429 rate limit exceeded"
    }
  ]
}
```

### Idempotency

The status-based request processing prevents double-execution: once a request moves from "Requested" to "Running", it will not be picked up by a concurrent run. The dedup check in Step 6 prevents duplicate lead creation. If the agent crashes mid-request, the pre-step on the next run resets any requests stuck in "Running" for > 30 minutes back to "Requested" for retry.

### DRY_RUN Mode

When `DRY_RUN=true`, the agent executes Steps 1-7 (request reading + Hunter.io query + contact selection + dedup + scoring) but skips Steps 8-9 (ClickUp task creation and request update). Logs the full output schema with what would have been created. Useful for testing Hunter.io query mappings and scoring calibration.

### Cloud Function Configuration

| Setting | Value |
|---------|-------|
| Runtime | Node.js 20 |
| Memory | 512 MB |
| Timeout | 540s (9 min) |
| Max instances | 1 |
| Concurrency | 1 |

The 9-minute timeout accommodates Hunter.io queries + dedup checks + task creation for up to 25 leads per request across multiple requests.

---

## Component 2: Personalization Agent (Cloud Function)

### Trigger

Google Cloud Scheduler job fires at **5:00 AM Mon-Fri Pacific** (`0 5 * * 1-5` in `America/Vancouver` timezone). The scheduler sends an HTTP POST to the Cloud Function endpoint with an empty body or optional override parameters.

```
POST /personalize

// Optional override body (for manual triggers):
{
  "batch_size": 10,
  "dry_run": false
}
```

Default batch size: **15 leads** per run.

### Processing Flow

#### Pre-Step: Reset Stuck Leads

Before picking up new leads, check for any leads stuck in the transient "Personalizing" status for more than 30 minutes. These represent a previous run that crashed mid-processing.

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task
  ?statuses[]=Personalizing
  &subtasks=false
  &page=0
  &order_by=updated
  &reverse=true

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

For each returned task, check if `date_updated` is more than 30 minutes ago. If so, reset:

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Body:
{
  "status": "Enriched"
}
```

Log: `"RESET: Task {task_id} was stuck in Personalizing for {minutes}min. Reset to Enriched."`

#### Step 1: Query ClickUp for Eligible Leads

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task
  ?statuses[]=Enriched
  &custom_fields=[{"field_id":"{CLICKUP_FIELD_LEAD_SCORE}","operator":">=","value":3}]
  &order_by=custom_field
  &custom_field_order={CLICKUP_FIELD_LEAD_SCORE}
  &reverse=true
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

**Note on ordering:** The ClickUp API's custom field ordering support is limited. If ordering by Lead Score is not available via API params, the function must fetch all Enriched tasks and sort client-side by Lead Score descending, then by `date_created` ascending (oldest first as tiebreaker). Limit to `batch_size` (default 15).

**Response shape (200 OK):**

```json
{
  "tasks": [
    {
      "id": "task_xyz789",
      "name": "ABC Plumbing Ltd. — Mike Thompson",
      "status": {"status": "Enriched"},
      "date_created": "1717848000000",
      "tags": [],
      "custom_fields": [
        {"id": "{CLICKUP_FIELD_COMPANY_NAME}", "name": "Company Name", "value": "ABC Plumbing Ltd."},
        {"id": "{CLICKUP_FIELD_COMPANY_DOMAIN}", "name": "Company Domain", "value": "https://abcplumbing.ca"},
        {"id": "{CLICKUP_FIELD_CONTACT_NAME}", "name": "Contact Name", "value": "Mike Thompson"},
        {"id": "{CLICKUP_FIELD_CONTACT_TITLE}", "name": "Contact Title", "value": "Owner"},
        {"id": "{CLICKUP_FIELD_SEGMENT}", "name": "Segment", "value": 0},
        {"id": "{CLICKUP_FIELD_CATEGORY}", "name": "Category", "value": 0},
        {"id": "{CLICKUP_FIELD_LEAD_SCORE}", "name": "Lead Score", "value": 4},
        {"id": "{CLICKUP_FIELD_COMPANY_INDUSTRY}", "name": "Company Industry", "value": "Construction"},
        {"id": "{CLICKUP_FIELD_COMPANY_HEADCOUNT}", "name": "Company Headcount", "value": "11-50"},
        {"id": "{CLICKUP_FIELD_COMPANY_CITY}", "name": "Company City", "value": 0}
      ]
    }
  ]
}
```

#### Step 2: Lock Lead — Set Status to "Personalizing"

For each lead in the batch, immediately set the status to "Personalizing" before doing any work. This prevents a concurrent or overlapping run from double-picking the same lead.

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Personalizing"
}
```

**Response (200 OK):** Returns the updated task. Verify `status.status === "Personalizing"` before proceeding. If the status is something other than "Personalizing" (e.g., another process moved it), skip this lead.

#### Step 3: Read Lead Data from ClickUp

Extract the following fields from the task's `custom_fields` array (already fetched in Step 1):

| ClickUp Field Name | Variable | Used For |
|---------------------|----------|----------|
| Company Name | `company_name` | Gemini prompt context, email drafts |
| Company Domain | `company_domain` | Firecrawl target URL |
| Contact Name | `contact_name` | Gemini prompt context, email drafts |
| Contact Title | `contact_title` | Gemini prompt context, CASL relevance |
| Segment | `segment` | Template selection in Gemini prompt |
| Category | `category` | Template selection in Gemini prompt |
| Lead Score | `lead_score` | Included in prompt for prioritization context |
| Company Industry | `company_industry` | Gemini prompt context |
| Company Headcount | `company_headcount` | Gemini prompt context |
| Company City | `company_city` | Gemini prompt context |

Also check: Does the task have the tag `re-engagement`? If yes, this is a re-engagement lead requiring a modified prompt (see Re-Engagement section below).

#### Step 4: Scrape Prospect Website via Firecrawl

Scrape up to 3 pages from the prospect's website: homepage, about page, and any community/giving-back page.

**Page discovery — first scrape the homepage:**

```
POST https://api.firecrawl.dev/v1/scrape

Headers:
  Authorization: Bearer {FIRECRAWL_API_KEY}
  Content-Type: application/json

Body:
{
  "url": "https://abcplumbing.ca",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "waitFor": 3000,
  "timeout": 15000
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "markdown": "# ABC Plumbing Ltd.\n\nServing Surrey and the Fraser Valley since 2005...\n\n## Our Services\n- Residential plumbing\n- Commercial plumbing\n- Emergency repairs\n\n## About Us\nFamily-owned and operated...",
    "metadata": {
      "title": "ABC Plumbing Ltd. | Surrey Plumber",
      "description": "Trusted plumbing services in Surrey and Fraser Valley",
      "language": "en",
      "sourceURL": "https://abcplumbing.ca",
      "statusCode": 200
    },
    "links": [
      "https://abcplumbing.ca/about",
      "https://abcplumbing.ca/services",
      "https://abcplumbing.ca/community",
      "https://abcplumbing.ca/contact"
    ]
  }
}
```

**Secondary pages:** From the `links` array, identify up to 2 additional pages to scrape. Match by path keywords:

| Priority | Path Keywords | Purpose |
|----------|--------------|---------|
| 1 | `/about`, `/about-us`, `/our-story`, `/team` | Company background, team info |
| 2 | `/community`, `/giving`, `/charity`, `/sponsorship`, `/csr`, `/give-back` | Community involvement (Wear It Forward bridges) |

Scrape each matched page with the same Firecrawl request shape. Concatenate all markdown results into a single `scraped_content` string, separated by `\n\n---\n\n` with page URL headers.

**Firecrawl error handling:**

| Error | Action |
|-------|--------|
| HTTP 402 (quota exceeded) | Log error. Tag task `no-scrape`. Proceed with Hunter.io data only. |
| HTTP 408 or timeout | Retry once. If still fails, tag `no-scrape`, proceed without scrape. |
| HTTP 429 (rate limited) | Wait `Retry-After` seconds, retry once. If still 429, tag `no-scrape`, proceed. |
| HTTP 500+ | Tag `no-scrape`, proceed without scrape. |
| `success: false` in response | Tag `no-scrape`, proceed without scrape. |

**Graceful degradation:** When scraping fails, the Gemini prompt still receives Hunter.io data (company name, contact title, industry, headcount). The drafts will be less personalized but still functional. The `no-scrape` tag lets the owner know the drafts are based on limited data.

#### Step 5: Generate Drafts via Gemini 2.5 Flash

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
  ?key={GEMINI_API_KEY}

Headers:
  Content-Type: application/json

Body:
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "<system prompt and lead data — see prompt template below>"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "website_scrape_summary": {
          "type": "string",
          "description": "2-3 sentence summary of the prospect's business based on their website. What they do, who they serve, their brand feel."
        },
        "community_signals": {
          "type": "string",
          "description": "Any community involvement, sponsorships, charity work, or causes found on the website. These bridge to Wear It Forward. Empty string if none found."
        },
        "personalization_hooks": {
          "type": "string",
          "description": "Key personalization elements: recent news, seasonal timing, specific services to reference, angles for outreach. Working notes explaining why the drafts say what they say."
        },
        "email_touch_1_subject": {
          "type": "string",
          "description": "Subject line for Touch 1 (intro + value prop). 4-8 words, no clickbait."
        },
        "email_touch_1_body": {
          "type": "string",
          "description": "Full email body for Touch 1. Personalized opening, segment-tailored value prop, Wear It Forward mention, soft CTA."
        },
        "email_touch_2_subject": {
          "type": "string",
          "description": "Subject line for Touch 2 (value-add follow-up). 4-8 words."
        },
        "email_touch_2_body": {
          "type": "string",
          "description": "Full email body for Touch 2. Lead with a useful insight or specific idea for their situation. Light mention of Jaydees."
        },
        "email_touch_3_subject": {
          "type": "string",
          "description": "Subject line for Touch 3 (friendly check-in). 4-8 words."
        },
        "email_touch_3_body": {
          "type": "string",
          "description": "Full email body for Touch 3. Brief, friendly, leaves door open. No pressure."
        },
        "linkedin_message": {
          "type": "string",
          "description": "LinkedIn connection request note. Short, personal, no sell. Under 300 characters."
        },
        "casl_opt_out_check": {
          "type": "boolean",
          "description": "true if no 'do not contact' or 'do not solicit' language was found on the prospect's website. false if such language was found."
        },
        "casl_relevance_rationale": {
          "type": "string",
          "description": "One sentence explaining why custom apparel outreach is relevant to this person's role. Reference their title and company."
        }
      },
      "required": [
        "website_scrape_summary",
        "community_signals",
        "personalization_hooks",
        "email_touch_1_subject",
        "email_touch_1_body",
        "email_touch_2_subject",
        "email_touch_2_body",
        "email_touch_3_subject",
        "email_touch_3_body",
        "linkedin_message",
        "casl_opt_out_check",
        "casl_relevance_rationale"
      ]
    },
    "temperature": 0.7,
    "maxOutputTokens": 4096
  }
}
```

**Prompt template** (inserted into `contents[0].parts[0].text`):

```
You are writing cold outreach for ShopJaydees (shopjaydees.com), a custom clothing
company in BC's Lower Mainland. They serve businesses, schools, and teams with
branded apparel — uniforms, spirit wear, team gear, corporate swag.

ShopJaydees runs "Wear It Forward" — a portion of every order goes to community
initiatives. This is a genuine differentiator, not a gimmick. Mention it naturally
once in Touch 1, but don't lead with it.

TONE: Friendly > Professional > Casual. Like a local business owner reaching out
to another. First-name basis. No corporate jargon, no buzzwords, no pressure.

PROSPECT DATA:
- Company: {company_name}
- Domain: {company_domain}
- Contact: {contact_name}, {contact_title}
- Segment: {segment}
- Category: {category}
- Industry: {company_industry}
- Headcount: {company_headcount}
- City: {company_city}

WEBSITE CONTENT:
{scraped_content or "No website content available — use the company data above."}

SOCIAL PROOF (use the one matching the segment):
- Schools: "We work with over 100 schools in the Lower Mainland"
- Teams: "We've helped teams raise thousands through apparel-based fundraising —
  no inventory, no hassle"
- Corporate: "We frequently work with businesses with anywhere from 12 to 250+
  employees"

INSTRUCTIONS:
1. Write 3 email touches following the sequence structure (Touch 1: intro + value,
   Touch 2: value-add follow-up, Touch 3: friendly check-in).
2. Reference something specific from their website or business. Do not be generic.
3. Subject lines: 4-8 words, no clickbait, no ALL CAPS, no emojis.
4. Sign all emails as "Ellie" (the ShopJaydees outreach persona — not the owner's name).
5. Write a LinkedIn connection request note (under 300 chars, no pitch).
6. Check the website content for any "do not contact" or "do not solicit" statements.
7. Write one sentence explaining why custom apparel is relevant to {contact_name}'s
   role at {company_name}.
8. If no website content was available, still write the emails using the company data,
   but note that in the website_scrape_summary field.

Return your response as structured JSON matching the schema provided.
```

**Re-engagement prompt modification:** When the task has the `re-engagement` tag, append this to the prompt:

```
RE-ENGAGEMENT NOTICE: This prospect was contacted previously with no response.
Their 90-day cool-off period has passed. You MUST:
- Use a completely different angle than a typical first outreach
- Do NOT reference or acknowledge previous outreach attempts
- Find a fresh hook — new seasonal angle, different value prop, updated community signal
- The tone should feel like a first contact, not a follow-up
```

**Response (200 OK):**

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "{\"website_scrape_summary\":\"ABC Plumbing is a family-owned plumbing company serving Surrey and the Fraser Valley since 2005. They specialize in residential and commercial plumbing with 24/7 emergency service.\",\"community_signals\":\"Sponsors Surrey Minor Hockey Association. Participated in Habitat for Humanity builds in 2025.\",\"personalization_hooks\":\"Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward, trades segment seasonal ramp in spring.\",\"email_touch_1_subject\":\"Quick question about your crew's gear\",\"email_touch_1_body\":\"Hi Mike,\\n\\nI came across ABC Plumbing...\",\"email_touch_2_subject\":\"An idea for your team\",\"email_touch_2_body\":\"Hi Mike,\\n\\nOne thing we hear from trades companies...\",\"email_touch_3_subject\":\"Checking in\",\"email_touch_3_body\":\"Hi Mike,\\n\\nJust a quick follow-up...\",\"linkedin_message\":\"Hi Mike — came across ABC Plumbing and love that you sponsor Surrey minor hockey. Would love to connect!\",\"casl_opt_out_check\":true,\"casl_relevance_rationale\":\"As Owner of a 20-person plumbing company, Mike likely oversees purchasing of branded work wear and crew uniforms.\"}"
          }
        ]
      },
      "finishReason": "STOP"
    }
  ]
}
```

Parse `candidates[0].content.parts[0].text` as JSON.

**Gemini error handling:**

| Error | Action |
|-------|--------|
| HTTP 429 (rate limited) | Defer entire remaining batch to next run. Do not retry in same run. Log count of deferred leads. |
| HTTP 500, 503 (server error) | Retry this lead once after 5s delay. If still fails, tag `generation-failed`, reset to Enriched, continue batch. |
| `finishReason: "SAFETY"` | Gemini refused to generate content (safety filter). Tag `generation-failed`, reset to Enriched, log the lead for manual review. |
| `finishReason: "MAX_TOKENS"` | Output truncated. Tag `generation-failed`, reset to Enriched. Consider increasing `maxOutputTokens`. |
| JSON parse failure | Response was not valid JSON. Tag `generation-failed`, reset to Enriched, log the raw response for debugging. |

#### Step 6: Validate Gemini Output

Before writing to ClickUp, validate the parsed JSON:

| Validation | Rule | On Failure |
|------------|------|------------|
| `email_touch_1_body` length | >= 100 characters | Tag `generation-failed`, reset to Enriched |
| `email_touch_2_body` length | >= 80 characters | Tag `generation-failed`, reset to Enriched |
| `email_touch_3_body` length | >= 60 characters | Tag `generation-failed`, reset to Enriched |
| Company name in Touch 1 | `company_name` appears in `email_touch_1_body` | Tag `generation-failed`, reset to Enriched |
| Contact first name in Touch 1 | First name from `contact_name` appears in `email_touch_1_body` | Tag `generation-failed`, reset to Enriched |
| Subject line length | Each subject line is 3-80 characters | Tag `generation-failed`, reset to Enriched |
| `linkedin_message` length | <= 300 characters | Truncate to 300 characters (LinkedIn enforces this limit) |
| `casl_opt_out_check` is false | Prospect website says "do not contact" | Tag `casl-block`, reset to Enriched. Do not proceed. |

#### Step 7: Write Results Back to ClickUp

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Ready for Review",
  "custom_fields": [
    {"id": "{CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY}", "value": "ABC Plumbing is a family-owned plumbing company serving Surrey and the Fraser Valley since 2005. They specialize in residential and commercial plumbing with 24/7 emergency service."},
    {"id": "{CLICKUP_FIELD_COMMUNITY_SIGNALS}", "value": "Sponsors Surrey Minor Hockey Association. Participated in Habitat for Humanity builds in 2025."},
    {"id": "{CLICKUP_FIELD_PERSONALIZATION_HOOKS}", "value": "Family business angle (20+ years), community involvement via minor hockey sponsorship bridges to Wear It Forward, trades segment seasonal ramp in spring."},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_1}", "value": "Hi Mike,\n\nI came across ABC Plumbing..."},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT}", "value": "Quick question about your crew's gear"},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_2}", "value": "Hi Mike,\n\nOne thing we hear from trades companies..."},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT}", "value": "An idea for your team"},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_3}", "value": "Hi Mike,\n\nJust a quick follow-up..."},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT}", "value": "Checking in"},
    {"id": "{CLICKUP_FIELD_LINKEDIN_MESSAGE}", "value": "Hi Mike — came across ABC Plumbing and love that you sponsor Surrey minor hockey. Would love to connect!"},
    {"id": "{CLICKUP_FIELD_CASL_OPT_OUT_CHECK}", "value": true},
    {"id": "{CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE}", "value": "As Owner of a 20-person plumbing company, Mike likely oversees purchasing of branded work wear and crew uniforms."},
    {"id": "{CLICKUP_FIELD_CASL_CONSENT_BASIS}", "value": 0},
    {"id": "{CLICKUP_FIELD_CASL_DATE_VERIFIED}", "value": 1717804800000},
    {"id": "{CLICKUP_FIELD_REVIEW_DECISION}", "value": 0}
  ]
}
```

**Field value notes:**

- **CASL Opt-Out Check** (checkbox): `true` = checked (no "do not contact" found).
- **CASL Consent Basis** (dropdown): `0` = "Conspicuous Publication" (the default for cold outreach where the email was found on their website).
- **CASL Date Verified** (date): ClickUp expects Unix timestamp in milliseconds. Set to today's date at midnight UTC.
- **Review Decision** (dropdown): `0` = "Pending Review".
- **Email Touch fields** (rich text): ClickUp Long Text (rich text) fields accept plain text via the API. If rich formatting is needed later, use ClickUp's markdown-like syntax.

### Output Schema (per run)

The function logs a structured summary:

```json
{
  "run_id": "personalize-2026-06-08-050000",
  "timestamp": "2026-06-08T05:03:42Z",
  "batch_size_requested": 15,
  "leads_available": 23,
  "leads_processed": 15,
  "results": {
    "success": 13,
    "generation_failed": 1,
    "casl_blocked": 0,
    "scrape_failed_but_proceeded": 1,
    "stuck_leads_reset": 0
  },
  "leads": [
    {
      "task_id": "task_xyz789",
      "company": "ABC Plumbing Ltd.",
      "status": "success",
      "scrape_pages": 3,
      "gemini_tokens_used": 2847,
      "tags_added": []
    },
    {
      "task_id": "task_abc456",
      "company": "Fraser Valley Electric",
      "status": "success",
      "scrape_pages": 0,
      "gemini_tokens_used": 1923,
      "tags_added": ["no-scrape"]
    },
    {
      "task_id": "task_fail789",
      "company": "Bad Data Corp",
      "status": "generation_failed",
      "error": "Gemini SAFETY filter triggered",
      "tags_added": ["generation-failed"]
    }
  ],
  "deferred_remaining": 8,
  "next_run": "2026-06-09T05:00:00-07:00"
}
```

### Idempotency

The "Personalizing" lock status prevents double-processing. If the function crashes mid-batch, the pre-step on the next run resets any leads stuck in "Personalizing" for > 30 minutes back to "Enriched", making them eligible for pickup again. A lead that was successfully written to "Ready for Review" will not be picked up again because the Step 1 query filters for `status = "Enriched"` only.

---

## Component 3: Send Agent (Cloud Function)

### Trigger

Google Cloud Scheduler job fires at **9:00 AM Mon-Fri Pacific** (`0 9 * * 1-5` in `America/Vancouver` timezone). Sends HTTP POST to the Cloud Function endpoint.

```
POST /send

// Optional override body:
{
  "dry_run": false
}
```

### Processing Flow

#### Step 1: Query ClickUp for Approved Leads

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task
  ?statuses[]=Approved
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

Sort client-side by Lead Score descending (same approach as Personalization Agent). No batch size limit — process all approved leads. In practice, the approval queue is throttled by the owner's daily review capacity (10-20 leads/day).

#### Step 2: Read Lead Data from ClickUp

Extract from each task's `custom_fields`:

| ClickUp Field Name | Variable | Used For |
|---------------------|----------|----------|
| Contact Email | `contact_email` | Instantly lead email |
| Contact Name | `contact_name` | Instantly lead name |
| Company Name | `company_name` | Instantly lead company |
| Email Touch 1 | `email_touch_1_body` | Instantly sequence step 1 body |
| Email Touch 1 Subject | `email_touch_1_subject` | Instantly sequence step 1 subject |
| Email Touch 2 | `email_touch_2_body` | Instantly sequence step 2 body |
| Email Touch 2 Subject | `email_touch_2_subject` | Instantly sequence step 2 subject |
| Email Touch 3 | `email_touch_3_body` | Instantly sequence step 3 body |
| Email Touch 3 Subject | `email_touch_3_subject` | Instantly sequence step 3 subject |

#### Step 3: Sending Domain Selection

Round-robin between the two sending domains: `shopjaydees.ca` and `shopjaydees.net`. Track the last-used domain in a lightweight state mechanism (Cloud Function environment variable, or simple toggle per run based on even/odd lead index).

```
sending_domains = ["shopjaydees.ca", "shopjaydees.net"]
selected_domain = sending_domains[lead_index % 2]
```

#### Step 4: Create Campaign and Add Lead in Instantly

Instantly's API requires a campaign to exist before adding leads. Use one campaign per segment-month for organization and reporting.

**Campaign strategy:** One rolling campaign per segment-month, e.g., `"Business - 2026-06"`. Check if it exists, create if not.

**Step 4a: List existing campaigns to find or create:**

```
GET https://api.instantly.ai/api/v2/campaigns
  ?limit=100
  &status=active

Headers:
  Authorization: Bearer {INSTANTLY_API_KEY}
```

**Response (200 OK):**

```json
[
  {
    "id": "campaign_abc123",
    "name": "Business - 2026-06",
    "status": "active",
    "created_at": "2026-06-01T00:00:00Z"
  }
]
```

If no matching campaign exists, create one:

```
POST https://api.instantly.ai/api/v2/campaigns

Headers:
  Authorization: Bearer {INSTANTLY_API_KEY}
  Content-Type: application/json

Body:
{
  "name": "Business - 2026-06",
  "campaign_schedule": {
    "schedules": [
      {
        "name": "Weekdays",
        "days": {
          "1": true,
          "2": true,
          "3": true,
          "4": true,
          "5": true,
          "0": false,
          "6": false
        },
        "timezone": "America/Vancouver",
        "timing": {
          "from": "08:00",
          "to": "17:00"
        }
      }
    ]
  }
}
```

**Step 4b: Add lead to campaign with all 3 sequence steps:**

```
POST https://api.instantly.ai/api/v2/leads

Headers:
  Authorization: Bearer {INSTANTLY_API_KEY}
  Content-Type: application/json

Body:
{
  "campaign_id": "campaign_abc123",
  "skip_if_in_workspace": true,
  "leads": [
    {
      "email": "mike@abcplumbing.ca",
      "first_name": "Mike",
      "last_name": "Thompson",
      "company_name": "ABC Plumbing Ltd.",
      "custom_variables": {
        "touch_1_subject": "Quick question about your crew's gear",
        "touch_1_body": "Hi Mike,\n\nI came across ABC Plumbing...",
        "touch_2_subject": "An idea for your team",
        "touch_2_body": "Hi Mike,\n\nOne thing we hear from trades companies...",
        "touch_3_subject": "Checking in",
        "touch_3_body": "Hi Mike,\n\nJust a quick follow-up...",
        "sending_domain": "shopjaydees.ca"
      }
    }
  ]
}
```

**Key parameter:** `skip_if_in_workspace: true` is the idempotency mechanism. If this email already exists in any campaign in the Instantly workspace, Instantly skips it rather than creating a duplicate. This makes the entire send operation safe to retry.

**Response (200 OK):**

```json
{
  "upload_id": "upload_xyz",
  "leads_uploaded": 1,
  "leads_skipped": 0
}
```

**Note on sequence configuration:** The 3-touch sequence with Day 4 and Day 9 delays is configured at the **campaign level** in Instantly (either via the Instantly UI during initial setup or via the campaign creation API). The campaign's sequence steps reference the custom variables `{{touch_1_subject}}`, `{{touch_1_body}}`, etc. The lead's `custom_variables` provide the per-lead content.

Campaign sequence structure (configured once per campaign):

| Step | Delay | Subject Variable | Body Variable |
|------|-------|-----------------|---------------|
| 1 | 0 days (immediate) | `{{touch_1_subject}}` | `{{touch_1_body}}` |
| 2 | 4 days after step 1 | `{{touch_2_subject}}` | `{{touch_2_body}}` |
| 3 | 5 days after step 2 (Day 9 total) | `{{touch_3_subject}}` | `{{touch_3_body}}` |

#### Step 5: Write Tracking Data Back to ClickUp

Only after the Instantly API call succeeds:

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Outreach Active",
  "custom_fields": [
    {"id": "{CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID}", "value": "campaign_abc123"},
    {"id": "{CLICKUP_FIELD_INSTANTLY_LEAD_ID}", "value": "lead_xyz789"},
    {"id": "{CLICKUP_FIELD_SENDING_DOMAIN}", "value": 0},
    {"id": "{CLICKUP_FIELD_SEQUENCE_STATUS}", "value": 0}
  ]
}
```

**Field value notes:**

- **Sending Domain** (dropdown): `0` = `shopjaydees.ca`, `1` = `shopjaydees.net`.
- **Sequence Status** (dropdown): `0` = `Not Started`. Zapier updates this as Instantly sends each touch.
- **Status change to "Outreach Active"** happens in the same PUT call. This is atomic — both the tracking fields and the status update succeed or fail together.

### Error Handling

| Error | Source | Action |
|-------|--------|--------|
| Instantly returns `leads_skipped: 1` | `skip_if_in_workspace` triggered | Tag `instantly-duplicate` on the ClickUp task. Set status to "Outreach Active" (the lead is already in Instantly). Log for review. |
| Instantly 400 (invalid email format) | Bad email in Contact Email field | Tag `invalid-email` on the ClickUp task. Change status to "Bounced". Log. |
| Instantly 429 (rate limited) | Too many API calls | Stop processing remaining leads. Leave them as "Approved" for the next run. Log count of deferred leads. |
| Instantly 500/503 (server error) | Instantly outage | Leave the lead as "Approved". Do not change any ClickUp fields. Retry on next run. |
| ClickUp PUT fails after Instantly succeeds | ClickUp API error | **Critical:** the lead is in Instantly but ClickUp does not reflect it. Retry the ClickUp PUT 3 times with exponential backoff. If all retries fail, send error alert email and log the task_id + Instantly IDs for manual reconciliation. |

### Output Schema (per run)

```json
{
  "run_id": "send-2026-06-08-090000",
  "timestamp": "2026-06-08T09:02:15Z",
  "leads_queued": 12,
  "results": {
    "sent": 11,
    "instantly_duplicate": 1,
    "invalid_email": 0,
    "deferred_rate_limit": 0,
    "errors": 0
  },
  "leads": [
    {
      "task_id": "task_xyz789",
      "company": "ABC Plumbing Ltd.",
      "email": "mike@abcplumbing.ca",
      "status": "sent",
      "campaign_id": "campaign_abc123",
      "sending_domain": "shopjaydees.ca"
    },
    {
      "task_id": "task_dup456",
      "company": "Already Contacted Co",
      "email": "bob@alreadycontacted.ca",
      "status": "instantly_duplicate",
      "campaign_id": null,
      "sending_domain": null
    }
  ]
}
```

### Idempotency

`skip_if_in_workspace: true` on the Instantly API call is the primary idempotency guard. If the send agent runs twice (e.g., manual re-trigger), Instantly skips leads that already exist. The ClickUp status change to "Outreach Active" in Step 5 also prevents re-pickup on subsequent runs (Step 1 only queries `status = "Approved"`).

---

## Component 4: Dormancy Check Function

### Trigger

Google Cloud Scheduler job fires at **6:00 AM Sunday Pacific** (`0 6 * * 0` in `America/Vancouver` timezone). Weekly cadence.

```
POST /dormancy-check
```

### Processing Flow

#### Step 1: Query ClickUp for Eligible Dormant Leads

```
GET https://api.clickup.com/api/v2/list/{CLICKUP_LIST_ID}/task
  ?statuses[]=Dormant
  &include_closed=true
  &subtasks=false
  &page=0

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

**Important:** Dormant is a closed status, so `include_closed=true` is required.

From the results, filter client-side for leads where:

1. **Dormant Reactivation Date** (`CLICKUP_FIELD_DORMANT_REACTIVATION_DATE`) <= today
2. **Lead Score** (`CLICKUP_FIELD_LEAD_SCORE`) >= 3
3. Task does NOT have tag `do-not-reactivate`
4. **Previous outreach count** < 2 — tracked by reactivation tags. If the task has tag `reactivation-2`, it has already been re-engaged twice and should not be reactivated again.

**Reactivation count tracking:** Since there is no dedicated "Previous Outreach Count" custom field in the data model, use tags: `reactivation-1` for the first re-engagement, `reactivation-2` for the second. If `reactivation-2` exists, the lead has exhausted its re-engagement attempts.

#### Step 2: Clear Old Drafts and Prepare for Re-Personalization

For each eligible lead:

```
PUT https://api.clickup.com/api/v2/task/{task_id}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "status": "Enriched",
  "custom_fields": [
    {"id": "{CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY}", "value": ""},
    {"id": "{CLICKUP_FIELD_COMMUNITY_SIGNALS}", "value": ""},
    {"id": "{CLICKUP_FIELD_PERSONALIZATION_HOOKS}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_1}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_2}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_3}", "value": ""},
    {"id": "{CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT}", "value": ""},
    {"id": "{CLICKUP_FIELD_LINKEDIN_MESSAGE}", "value": ""},
    {"id": "{CLICKUP_FIELD_REVIEW_DECISION}", "value": 0},
    {"id": "{CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID}", "value": ""},
    {"id": "{CLICKUP_FIELD_INSTANTLY_LEAD_ID}", "value": ""},
    {"id": "{CLICKUP_FIELD_SEQUENCE_STATUS}", "value": 0}
  ]
}
```

**Note:** Setting Sequence Status to `0` ("Not Started") and clearing Instantly IDs resets the outreach tracking. The old outreach data (Opens, Replies, Sent Dates) is intentionally preserved for historical reference.

#### Step 3: Add Re-Engagement Tag and Increment Count

```
POST https://api.clickup.com/api/v2/task/{task_id}/tag/re-engagement

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

And increment the reactivation count tag:

```
POST https://api.clickup.com/api/v2/task/{task_id}/tag/reactivation-{count}

Headers:
  Authorization: {CLICKUP_API_TOKEN}
```

Where `{count}` is `1` if no reactivation tag exists yet, or `2` if `reactivation-1` already exists.

#### Step 4: Add Comment for Audit Trail

```
POST https://api.clickup.com/api/v2/task/{task_id}/comment

Headers:
  Authorization: {CLICKUP_API_TOKEN}
  Content-Type: application/json

Body:
{
  "comment_text": "Dormancy reactivation: 90-day cool-off complete. Cleared old drafts, moved to Enriched for re-personalization with fresh angle. Reactivation #1."
}
```

### Output Schema

```json
{
  "run_id": "dormancy-check-2026-06-08-060000",
  "timestamp": "2026-06-08T06:01:12Z",
  "dormant_tasks_checked": 45,
  "results": {
    "reactivated": 3,
    "not_eligible_score_low": 8,
    "not_eligible_do_not_reactivate": 2,
    "not_eligible_max_attempts": 5,
    "not_yet_due": 27
  },
  "reactivated_leads": [
    {
      "task_id": "task_dormant1",
      "company": "Old Lead Corp",
      "dormant_since": "2026-03-01",
      "reactivation_number": 1
    }
  ]
}
```

### Idempotency

The status change from "Dormant" to "Enriched" prevents double-processing on repeated runs. Once a lead is moved to Enriched, it will not appear in the Step 1 Dormant query again. The reactivation count tags provide an additional guard against over-reactivation.

---

## Shared Infrastructure

### ClickUp API Client Wrapper

All components use a shared ClickUp API client that handles authentication, rate limiting, and retries.

#### Proactive Rate Limiting

ClickUp's free plan allows **100 requests per minute**. The client enforces a **90 requests per minute** throttle (10% safety margin) using a token bucket algorithm.

```
Implementation:
- Maintain a counter of requests made in the current 60-second window
- Before each request, check if counter >= 90
- If at limit, wait until the current window expires (sleep until window_start + 60s)
- After each request, increment counter
- Reset counter every 60 seconds
```

#### 429 Retry Handler

If ClickUp returns HTTP 429 despite the proactive throttle (possible during concurrent operations):

```
On HTTP 429 response:
  1. Read the Retry-After header (seconds to wait)
  2. If no Retry-After header, default to 60 seconds
  3. Sleep for the specified duration
  4. Retry the request (max 3 retries)
  5. If all retries fail, raise exception with context
```

#### Request/Response Logging

Every ClickUp API call is logged at DEBUG level:

```json
{
  "level": "DEBUG",
  "service": "clickup-client",
  "method": "PUT",
  "endpoint": "/task/task_xyz789",
  "status": 200,
  "duration_ms": 342,
  "rate_limit_remaining": 67
}
```

### Error Alerting Helper

A shared function that sends error alert emails when critical failures occur.

```
Function: sendErrorAlert(subject, details)

Implementation:
  POST https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages
  (or use Google Cloud's built-in email via SendGrid integration,
   or a simple SMTP call to a transactional email service)

  To: cody@sixohquad.com
  From: alerts@sixohquad.com
  Subject: "[ShopJaydees Pipeline] {subject}"
  Body: {details} (plain text with run_id, timestamp, affected tasks, error messages)
```

**Alert triggers:**

| Condition | Subject Line |
|-----------|-------------|
| ClickUp API key invalid (401) | "ClickUp auth failure — pipeline halted" |
| Hunter.io quota exhausted | "Hunter.io monthly quota reached" |
| Firecrawl quota exhausted | "Firecrawl monthly quota reached" |
| Gemini 429 deferred entire batch | "Gemini rate limit — personalization batch deferred" |
| Instantly API down (500/503 for all leads) | "Instantly API down — sends deferred" |
| ClickUp write fails after Instantly success | "CRITICAL: ClickUp/Instantly sync mismatch — manual fix needed" |
| Any function crashes (unhandled exception) | "Unhandled error in {function_name}" |

### Structured Logging

All Cloud Functions log to Google Cloud Logging in structured JSON format.

```json
{
  "severity": "INFO",
  "message": "Lead processed successfully",
  "component": "personalization-agent",
  "run_id": "personalize-2026-06-08-050000",
  "task_id": "task_xyz789",
  "company": "ABC Plumbing Ltd.",
  "step": "gemini_generation",
  "duration_ms": 2341,
  "tokens_used": 2847,
  "timestamp": "2026-06-08T05:01:42.123Z"
}
```

**Severity levels:**

| Level | Used For |
|-------|----------|
| DEBUG | API call details, field-level data |
| INFO | Lead processed, batch started/completed, status changes |
| WARNING | Graceful degradation (no-scrape), lead skipped, retry triggered |
| ERROR | API failure, validation failure, generation failure |
| CRITICAL | Unhandled exception, sync mismatch, CASL violation risk |

---

## Rate Limits and Quotas

### External API Rate Limits

| API | Plan | Rate Limit | Monthly Quota | Expected Usage | Headroom |
|-----|------|------------|---------------|----------------|----------|
| **ClickUp** | Free | 100 req/min | Unlimited | ~200-400 req/day (queries + updates across all agents) | Comfortable. Proactive throttle at 90/min. |
| **Hunter.io** | Starter ($34/mo) | 15 req/sec | 500 domain searches/mo | ~200-600 searches/mo (50-150 domains/week) | Tight at high volume. Monitor weekly. |
| **Firecrawl** | Starter ($19/mo) | 10 req/min, 3 concurrent | 3,000 scrapes/mo | ~225-675 scrapes/mo (15 leads/day x 3 pages x ~5 days/week) | Comfortable. |
| **Gemini 2.5 Flash** | Pay-as-you-go | 2,000 RPM, 4M TPM | No hard monthly cap | ~300 req/mo (15 leads/day x ~20 days/mo) | Very comfortable. |
| **Instantly** | Growth ($30/mo) | Varies by endpoint | 5,000 leads/mo, 5,000 emails/day | ~400-1,600 leads/mo | Comfortable. |

### Quota Monitoring

Each function checks remaining quota at the start of a run (where APIs expose this):

| API | Quota Check Mechanism |
|-----|----------------------|
| Hunter.io | `GET https://api.hunter.io/v2/account?api_key={HUNTER_API_KEY}` returns `calls.used` and `calls.available`. Check before each import batch. If `available < domains_in_batch`, alert and skip. |
| Firecrawl | Response headers include rate limit info. Monitor `X-RateLimit-Remaining`. |
| Gemini | No pre-check available. Handle 429 reactively. |
| ClickUp | Response headers include `X-RateLimit-Remaining`. Monitor and log. |
| Instantly | Monitor response headers per endpoint. |

### Cost Projection per API Call

| API Call | Cost |
|----------|------|
| Hunter.io Domain Search | 1 credit (500/mo on Starter) |
| Firecrawl scrape (1 page) | 1 credit (3,000/mo on Starter) |
| Gemini 2.5 Flash (avg 1K input + 2K output tokens) | ~$0.0004 per lead |
| Instantly (per lead added) | Included in plan |
| ClickUp API | Free |

---

## Environment Variables

Complete list of environment variables required by all Cloud Functions.

```env
# ========================================
# API Keys
# ========================================
CLICKUP_API_TOKEN=pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HUNTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
INSTANTLY_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ========================================
# ClickUp Workspace IDs
# ========================================
CLICKUP_LIST_ID=123456789
CLICKUP_SPACE_ID=123456789
CLICKUP_FOLDER_ID=123456789

# Prospecting Requests List
CLICKUP_PROSPECTING_LIST_ID=123456789

# ========================================
# ClickUp Custom Field IDs
# (populated after workspace setup via GET /list/{list_id}/field)
# ========================================

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

# CASL Compliance (5 fields)
CLICKUP_FIELD_CASL_SOURCE_URL=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_OPT_OUT_CHECK=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_CONSENT_BASIS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_CASL_DATE_VERIFIED=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Personalization & Draft Messages (10 fields)
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

# Owner Review (4 fields)
CLICKUP_FIELD_REVIEW_DECISION=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REJECTION_NOTE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_REVIEW_DATE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_OWNER_NOTES=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Outreach Tracking (16 fields)
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

# Metadata (2 fields)
CLICKUP_FIELD_IMPORT_BATCH=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLICKUP_FIELD_SEASONAL_CAMPAIGN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ========================================
# Configuration
# ========================================
PERSONALIZATION_BATCH_SIZE=15
CLICKUP_RATE_LIMIT=90
DRY_RUN=false

# ========================================
# Alerting
# ========================================
ALERT_EMAIL=cody@sixohquad.com

# ========================================
# Instantly Campaign Config
# ========================================
INSTANTLY_SENDING_DOMAINS=shopjaydees.ca,shopjaydees.net

# ========================================
# Google Cloud
# ========================================
GCP_PROJECT_ID=shopjaydees-leadgen
GCP_REGION=us-west1
```

**Total environment variables: 66** (5 API keys + 4 workspace IDs + 53 field IDs + 4 configuration values).
