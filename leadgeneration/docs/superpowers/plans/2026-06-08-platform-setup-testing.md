# Platform Setup + Integration Testing — Implementation Plan

> **For agentic workers:** This plan is primarily manual configuration steps with verification, not code. Steps use checkbox (`- [ ]`) syntax for tracking. Some tasks require the ClickUp web UI, some use the ClickUp/GCP APIs, and some use Zapier/Instantly web UIs. The plan is designed to be executed in order — later tasks depend on IDs and configuration from earlier tasks.

**Goal:** Configure all third-party platforms (ClickUp, Instantly, Zapier, GCP), wire them together, and verify the complete pipeline end-to-end before going live.

**Prerequisites:**
- Plans 1-3 code complete and passing all unit tests locally
- Client accounts set up: ClickUp workspace, Hunter.io Starter, Firecrawl Starter, Instantly Growth, Zapier Starter, GCP project, Gemini API key
- shopjaydees.ca and shopjaydees.net sending domains linked to Google Workspace
- Cody has admin or member access to all client accounts

**Estimated Duration:** 2-3 days of focused setup, then 1-2 days of testing across all three phases.

---

## Multi-Plan Overview

This is **Plan 4 of 4**. Each plan produces working, independently testable software.

| Plan | Scope | Depends On | Status |
|------|-------|-----------|--------|
| 1. Foundation + Discovery Agent | Scaffolding, types, config, ClickUp client, Hunter.io client, scoring, mapping, Discovery Agent, error alerting, structured logging | Nothing | Complete |
| 2. Personalization Agent | Firecrawl client, Gemini client, website scraping, draft generation, validation, re-engagement detection | Plan 1 | Complete |
| 3. Send Agent + Dormancy Check | Instantly client, campaign management, send logic, dormancy reactivation, reconciliation | Plan 1 | Complete |
| **4. Platform Setup + Integration Testing** | ClickUp workspace config, Instantly campaign setup, Zapier zaps, Cloud Scheduler, GCP deployment, E2E testing | Plans 1-3 + client accounts | **This plan** |

---

## Part A: ClickUp Workspace Setup

### Task 1: Create Space and Folder Structure

**Files:** None (ClickUp UI + API)

- [ ] **Step 1: Create Space "Lead Generation"**

  In the ShopJaydees ClickUp workspace:

  1. Click `+` next to "Spaces" in the left sidebar
  2. Name: `Lead Generation`
  3. Click "Create Space"
  4. When prompted for statuses, select "Custom Statuses" and configure the 13 prospect statuses defined in Step 2 below

- [ ] **Step 2: Configure Space-level statuses**

  In Space Settings > Statuses, create two groups:

  **Active Statuses** (in this exact order):

  | Order | Status Name | Color | Hex |
  |-------|-------------|-------|-----|
  | 1 | New | Light gray | `#c4c4c4` |
  | 2 | Enriched | Blue | `#4ea8de` |
  | 3 | Personalizing | Purple | `#ab6ee1` |
  | 4 | Ready for Review | Orange | `#ff9800` |
  | 5 | Approved | Teal | `#36b37e` |
  | 6 | Outreach Active | Dark blue | `#2196f3` |
  | 7 | Responded - Owner Follow-up | Gold | `#ffc107` |
  | 8 | Parked | Light brown | `#bcaaa4` |

  **Closed Statuses** (in this exact order):

  | Order | Status Name | Color | Hex |
  |-------|-------------|-------|-----|
  | 1 | Won | Green | `#4caf50` |
  | 2 | Lost | Red | `#f44336` |
  | 3 | Dormant | Gray | `#9e9e9e` |
  | 4 | Unsubscribed | Dark red | `#b71c1c` |
  | 5 | Bounced | Dark gray | `#616161` |

  **Verification:** After saving, the status bar should show 8 active + 5 closed = 13 total statuses with the correct colors.

- [ ] **Step 3: Create Folder "Outbound Pipeline"**

  1. Inside "Lead Generation" space, click `+` next to the space name
  2. Select "Folder"
  3. Name: `Outbound Pipeline`

- [ ] **Step 4: Create List "Prospects"**

  1. Inside "Outbound Pipeline" folder, click `+` to add a list
  2. Name: `Prospects`
  3. Set it to inherit the Space's statuses (this is the default)

  **Verification:** The Prospects list should show all 13 statuses from the Space.

- [ ] **Step 5: Create List "Prospecting Requests" with its own statuses**

  1. Inside "Outbound Pipeline" folder, click `+` to add a list
  2. Name: `Prospecting Requests`
  3. Override the Space statuses — set list-level statuses:

  | Order | Status Name | Type | Color | Hex |
  |-------|-------------|------|-------|-----|
  | 1 | Requested | Active (default) | Light gray | `#c4c4c4` |
  | 2 | Running | Active | Blue | `#4ea8de` |
  | 3 | Complete | Closed | Green | `#4caf50` |
  | 4 | Failed | Closed | Red | `#f44336` |

  **Verification:** The Prospecting Requests list should show 4 statuses, independent of the Space's 13 statuses.

- [ ] **Step 6: Record workspace IDs**

  Query the ClickUp API to get the Space, Folder, and List IDs:

  ```bash
  # Get all spaces in the workspace
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/team/${CLICKUP_TEAM_ID}/space" | jq '.spaces[] | {name, id}'
  ```

  Record the Space ID for "Lead Generation".

  ```bash
  # Get folders in the space
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/space/${SPACE_ID}/folder" | jq '.folders[] | {name, id}'
  ```

  Record the Folder ID for "Outbound Pipeline".

  ```bash
  # Get lists in the folder
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/folder/${FOLDER_ID}/list" | jq '.lists[] | {name, id}'
  ```

  Record both list IDs. Add to `.env`:

  ```env
  CLICKUP_SPACE_ID=<space_id>
  CLICKUP_FOLDER_ID=<folder_id>
  CLICKUP_LIST_ID=<prospects_list_id>
  CLICKUP_PROSPECTING_LIST_ID=<prospecting_requests_list_id>
  ```

---

### Task 2: Create Custom Fields on Prospects List (53 fields)

**Files:** None (ClickUp API)

Custom fields are created via the ClickUp API for precision (exact names, types, options). The ClickUp UI can also be used but is slower for 53 fields.

**API pattern for creating each field:**

```bash
curl -s -X POST \
  -H "Authorization: ${CLICKUP_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
  -d '{
    "name": "<field_name>",
    "type": "<field_type>",
    "type_config": { ... }
  }'
```

- [ ] **Step 1: Create Contact & Company Info fields (11 fields)**

  ```bash
  # 1. Company Name (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Company Name", "type": "short_text"}'

  # 2. Company Domain (URL)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Company Domain", "type": "url"}'

  # 3. Company Industry (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Company Industry", "type": "short_text"}'

  # 4. Company Headcount (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Company Headcount", "type": "short_text"}'

  # 5. Company City (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Company City",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Surrey", "orderindex": 0},
          {"name": "Langley", "orderindex": 1},
          {"name": "Abbotsford", "orderindex": 2},
          {"name": "Chilliwack", "orderindex": 3},
          {"name": "Mission", "orderindex": 4},
          {"name": "Maple Ridge", "orderindex": 5},
          {"name": "Burnaby", "orderindex": 6},
          {"name": "New Westminster", "orderindex": 7},
          {"name": "Coquitlam", "orderindex": 8},
          {"name": "Port Coquitlam", "orderindex": 9},
          {"name": "Pitt Meadows", "orderindex": 10},
          {"name": "Richmond", "orderindex": 11},
          {"name": "Delta", "orderindex": 12},
          {"name": "North Vancouver", "orderindex": 13},
          {"name": "Vancouver", "orderindex": 14},
          {"name": "Other", "orderindex": 15}
        ]
      }
    }'

  # 6. Contact Name (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Contact Name", "type": "short_text"}'

  # 7. Contact Title (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Contact Title", "type": "short_text"}'

  # 8. Contact Email (Email)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Contact Email", "type": "email"}'

  # 9. Email Confidence (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Confidence", "type": "number"}'

  # 10. Contact LinkedIn (URL)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Contact LinkedIn", "type": "url"}'

  # 11. Contact Phone (Phone)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Contact Phone", "type": "phone"}'
  ```

  **Verification:** 11 fields created. Check via:

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" | jq '.fields | length'
  # Expected: 11
  ```

- [ ] **Step 2: Create Lead Qualification fields (5 fields)**

  ```bash
  # 12. Segment (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Segment",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Business", "orderindex": 0},
          {"name": "School", "orderindex": 1},
          {"name": "Team", "orderindex": 2}
        ]
      }
    }'

  # 13. Category (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Category",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Trades & Contractors", "orderindex": 0},
          {"name": "Restaurants & Hospitality", "orderindex": 1},
          {"name": "Fitness & Wellness", "orderindex": 2},
          {"name": "Real Estate & Property Mgmt", "orderindex": 3},
          {"name": "Auto & Trades Shops", "orderindex": 4},
          {"name": "Elementary & Secondary", "orderindex": 5},
          {"name": "Independent & Private Schools", "orderindex": 6},
          {"name": "Daycares & Preschools", "orderindex": 7},
          {"name": "Post-Secondary Clubs", "orderindex": 8},
          {"name": "Youth Sports Leagues", "orderindex": 9},
          {"name": "Adult Rec Leagues", "orderindex": 10},
          {"name": "Dance & Performance", "orderindex": 11},
          {"name": "Community Sport Orgs", "orderindex": 12},
          {"name": "Other", "orderindex": 13}
        ]
      }
    }'

  # 14. Lead Score (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Lead Score", "type": "number"}'

  # 15. Score Rationale (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Score Rationale", "type": "text_area"}'

  # 16. Geographic Phase (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Geographic Phase",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Phase 1 - Fraser Valley Core", "orderindex": 0},
          {"name": "Phase 2 - Tri-Cities & Burnaby", "orderindex": 1},
          {"name": "Phase 3 - Metro Vancouver", "orderindex": 2},
          {"name": "Future - Rest of BC+", "orderindex": 3}
        ]
      }
    }'
  ```

  **Verification:** Running count now 16 fields.

- [ ] **Step 3: Create CASL Compliance fields (5 fields)**

  ```bash
  # 17. CASL Source URL (URL)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "CASL Source URL", "type": "url"}'

  # 18. CASL Opt-Out Check (Checkbox)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "CASL Opt-Out Check", "type": "checkbox"}'

  # 19. CASL Relevance Rationale (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "CASL Relevance Rationale", "type": "text_area"}'

  # 20. CASL Consent Basis (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "CASL Consent Basis",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Conspicuous Publication", "orderindex": 0},
          {"name": "Existing Business Relationship", "orderindex": 1},
          {"name": "Referral", "orderindex": 2},
          {"name": "Express Consent", "orderindex": 3}
        ]
      }
    }'

  # 21. CASL Date Verified (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "CASL Date Verified", "type": "date"}'
  ```

  **Verification:** Running count now 21 fields.

- [ ] **Step 4: Create Personalization & Draft Messages fields (10 fields)**

  ```bash
  # 22. Website Scrape Summary (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Website Scrape Summary", "type": "text_area"}'

  # 23. Community Signals (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Community Signals", "type": "text_area"}'

  # 24. Personalization Hooks (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Personalization Hooks", "type": "text_area"}'

  # 25. Email Touch 1 (Long Text / rich text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 1", "type": "text_area"}'

  # 26. Email Touch 1 Subject (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 1 Subject", "type": "short_text"}'

  # 27. Email Touch 2 (Long Text / rich text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 2", "type": "text_area"}'

  # 28. Email Touch 2 Subject (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 2 Subject", "type": "short_text"}'

  # 29. Email Touch 3 (Long Text / rich text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 3", "type": "text_area"}'

  # 30. Email Touch 3 Subject (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Email Touch 3 Subject", "type": "short_text"}'

  # 31. LinkedIn Message (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "LinkedIn Message", "type": "text_area"}'
  ```

  **Verification:** Running count now 31 fields.

- [ ] **Step 5: Create Owner Review fields (4 fields)**

  ```bash
  # 32. Review Decision (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Review Decision",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Pending Review", "orderindex": 0},
          {"name": "Approved", "orderindex": 1},
          {"name": "Approved with Edits", "orderindex": 2},
          {"name": "Rejected", "orderindex": 3},
          {"name": "I Know This Person", "orderindex": 4}
        ]
      }
    }'

  # 33. Rejection Note (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Rejection Note", "type": "text_area"}'

  # 34. Review Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Review Date", "type": "date"}'

  # 35. Owner Notes (Long Text / plain)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Owner Notes", "type": "text_area"}'
  ```

  **Verification:** Running count now 35 fields.

- [ ] **Step 6: Create Outreach Tracking fields (16 fields)**

  ```bash
  # 36. Instantly Campaign ID (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Instantly Campaign ID", "type": "short_text"}'

  # 37. Instantly Lead ID (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Instantly Lead ID", "type": "short_text"}'

  # 38. Sending Domain (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Sending Domain",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "shopjaydees.ca", "orderindex": 0},
          {"name": "shopjaydees.net", "orderindex": 1}
        ]
      }
    }'

  # 39. Sequence Status (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Sequence Status",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Not Started", "orderindex": 0},
          {"name": "Touch 1 Sent", "orderindex": 1},
          {"name": "Touch 2 Sent", "orderindex": 2},
          {"name": "Touch 3 Sent", "orderindex": 3},
          {"name": "Sequence Complete", "orderindex": 4},
          {"name": "Paused", "orderindex": 5},
          {"name": "Cancelled", "orderindex": 6}
        ]
      }
    }'

  # 40. Touch 1 Sent Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Touch 1 Sent Date", "type": "date"}'

  # 41. Touch 2 Sent Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Touch 2 Sent Date", "type": "date"}'

  # 42. Touch 3 Sent Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Touch 3 Sent Date", "type": "date"}'

  # 43. Opens (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Opens", "type": "number"}'

  # 44. Replies (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Replies", "type": "number"}'

  # 45. Last Open Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Last Open Date", "type": "date"}'

  # 46. Last Reply Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Last Reply Date", "type": "date"}'

  # 47. Bounced (Checkbox)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Bounced", "type": "checkbox"}'

  # 48. Unsubscribed (Checkbox)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Unsubscribed", "type": "checkbox"}'

  # 49. Dormant Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Dormant Date", "type": "date"}'

  # 50. Dormant Reactivation Date (Date)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Dormant Reactivation Date", "type": "date"}'

  # 51. Previous Outreach Count (Number — from review resolution #14)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Previous Outreach Count", "type": "number"}'
  ```

  **Verification:** Running count now 51 fields.

- [ ] **Step 7: Create Metadata fields (2 fields)**

  ```bash
  # 52. Import Batch (Short Text)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{"name": "Import Batch", "type": "short_text"}'

  # 53. Seasonal Campaign (Dropdown)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    -d '{
      "name": "Seasonal Campaign",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Spring Sports + Trades", "orderindex": 0},
          {"name": "Summer Early Lock-in", "orderindex": 1},
          {"name": "Back to School + Fall Sports", "orderindex": 2},
          {"name": "Year-End + Holiday", "orderindex": 3},
          {"name": "New Year Fresh Look", "orderindex": 4}
        ]
      }
    }'
  ```

  **Verification:** Total 53 fields on the Prospects list.

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" | jq '.fields | length'
  # Expected: 53
  ```

---

### Task 3: Create Custom Fields on Prospecting Requests List (8 fields)

- [ ] **Step 1: Create all 8 Prospecting Requests fields**

  ```bash
  # 1. Segment (Dropdown — same options as Prospects)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{
      "name": "Segment",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Business", "orderindex": 0},
          {"name": "School", "orderindex": 1},
          {"name": "Team", "orderindex": 2}
        ]
      }
    }'

  # 2. Category (Dropdown — same options as Prospects)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{
      "name": "Category",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Trades & Contractors", "orderindex": 0},
          {"name": "Restaurants & Hospitality", "orderindex": 1},
          {"name": "Fitness & Wellness", "orderindex": 2},
          {"name": "Real Estate & Property Mgmt", "orderindex": 3},
          {"name": "Auto & Trades Shops", "orderindex": 4},
          {"name": "Elementary & Secondary", "orderindex": 5},
          {"name": "Independent & Private Schools", "orderindex": 6},
          {"name": "Daycares & Preschools", "orderindex": 7},
          {"name": "Post-Secondary Clubs", "orderindex": 8},
          {"name": "Youth Sports Leagues", "orderindex": 9},
          {"name": "Adult Rec Leagues", "orderindex": 10},
          {"name": "Dance & Performance", "orderindex": 11},
          {"name": "Community Sport Orgs", "orderindex": 12},
          {"name": "Other", "orderindex": 13}
        ]
      }
    }'

  # 3. Target City (Dropdown — same options as Company City on Prospects)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{
      "name": "Target City",
      "type": "drop_down",
      "type_config": {
        "options": [
          {"name": "Surrey", "orderindex": 0},
          {"name": "Langley", "orderindex": 1},
          {"name": "Abbotsford", "orderindex": 2},
          {"name": "Chilliwack", "orderindex": 3},
          {"name": "Mission", "orderindex": 4},
          {"name": "Maple Ridge", "orderindex": 5},
          {"name": "Burnaby", "orderindex": 6},
          {"name": "New Westminster", "orderindex": 7},
          {"name": "Coquitlam", "orderindex": 8},
          {"name": "Port Coquitlam", "orderindex": 9},
          {"name": "Pitt Meadows", "orderindex": 10},
          {"name": "Richmond", "orderindex": 11},
          {"name": "Delta", "orderindex": 12},
          {"name": "North Vancouver", "orderindex": 13},
          {"name": "Vancouver", "orderindex": 14},
          {"name": "Other", "orderindex": 15}
        ]
      }
    }'

  # 4. Max Results (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{"name": "Max Results", "type": "number"}'

  # 5. Results Found (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{"name": "Results Found", "type": "number"}'

  # 6. Leads Created (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{"name": "Leads Created", "type": "number"}'

  # 7. Leads Parked (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{"name": "Leads Parked", "type": "number"}'

  # 8. Duplicates Skipped (Number)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    -d '{"name": "Duplicates Skipped", "type": "number"}'
  ```

  **Verification:**

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" | jq '.fields | length'
  # Expected: 8
  ```

---

### Task 4: Record All Custom Field IDs and Populate .env

- [ ] **Step 1: Fetch and record Prospects list field IDs**

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    | jq '.fields[] | {name: .name, id: .id, type: .type}'
  ```

  Map each field name to its UUID. Output will look like:

  ```json
  {"name": "Company Name", "id": "abc12345-...", "type": "short_text"}
  {"name": "Company Domain", "id": "def67890-...", "type": "url"}
  ...
  ```

- [ ] **Step 2: Fetch and record Prospecting Requests list field IDs**

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/field" \
    | jq '.fields[] | {name: .name, id: .id, type: .type}'
  ```

- [ ] **Step 3: Populate pipeline/.env with all field IDs**

  Copy `pipeline/.env.example` to `pipeline/.env` and fill in all 53 Prospects field IDs, 8 Prospecting Requests field IDs, and 4 workspace IDs. The complete list of env vars from the API contracts spec (66 total) must all be populated.

  For dropdown fields, also record the option order indices to verify they match the code's mapping tables. Run:

  ```bash
  # Verify dropdown option ordering for Segment field
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/field" \
    | jq '.fields[] | select(.name == "Segment") | .type_config.options[] | {name, orderindex}'
  ```

  Expected output:
  ```json
  {"name": "Business", "orderindex": 0}
  {"name": "School", "orderindex": 1}
  {"name": "Team", "orderindex": 2}
  ```

  Repeat for all dropdown fields (Company City, Category, Geographic Phase, CASL Consent Basis, Review Decision, Sending Domain, Sequence Status, Seasonal Campaign) and verify order indices match the mapping tables in `pipeline/src/mapping.ts`.

  **Verification:** Run the pipeline's config validation:

  ```bash
  cd pipeline && npx tsx -e "import { loadConfig } from './src/config.js'; loadConfig();"
  ```

  This should load without throwing a missing-env-var error.

---

### Task 5: Create Views

All views are created in the ClickUp UI. They are saved filters/layouts on the Prospects list.

- [ ] **Step 1: Create "Approval Queue" view**

  1. Open the Prospects list
  2. Click `+` to add a view > List view
  3. Name: `Approval Queue`
  4. Filter: Status = "Ready for Review"
  5. Sort: Lead Score descending, then Date Created ascending
  6. Group by: Segment
  7. Visible columns: Company Name (task name), Contact Name, Segment, Category, Lead Score, Email Touch 1 Subject, Review Decision

- [ ] **Step 2: Create "My Follow-ups" view**

  1. Add List view named `My Follow-ups`
  2. Filter: Status = "Responded - Owner Follow-up"
  3. Sort: Last Reply Date descending
  4. Visible columns: Company Name (task name), Contact Name, Segment, Contact Email, Contact LinkedIn, Last Reply Date, Owner Notes

- [ ] **Step 3: Create "Pipeline Board" view**

  1. Add Board (Kanban) view named `Pipeline Board`
  2. Group by: Status
  3. Filter: Exclude closed statuses (show only Active statuses)
  4. Color tasks by Segment (if ClickUp supports — otherwise leave default)

- [ ] **Step 4: Create "Active Outreach" view**

  1. Add List view named `Active Outreach`
  2. Filter: Status = "Outreach Active"
  3. Sort: Touch 1 Sent Date ascending
  4. Visible columns: Company Name (task name), Contact Name, Segment, Sequence Status, Opens, Replies, Sending Domain

- [ ] **Step 5: Create "LinkedIn Queue" view**

  1. Add List view named `LinkedIn Queue`
  2. Filter: Status IN ("Ready for Review", "Approved", "Outreach Active") AND LinkedIn Message IS NOT EMPTY
  3. Sort: Status order, then Lead Score descending
  4. Visible columns: Company Name (task name), Contact Name, Contact LinkedIn, LinkedIn Message, Segment

- [ ] **Step 6: Create "Parked Leads" view**

  1. Add List view named `Parked Leads`
  2. Filter: Status = "Parked"
  3. Sort: Lead Score descending, then Date Created ascending
  4. Visible columns: Company Name (task name), Segment, Category, Lead Score, Score Rationale, Company City

- [ ] **Step 7: Create "Won Deals" view**

  1. Add List view named `Won Deals`
  2. Filter: Status = "Won"
  3. Sort: Date closed descending
  4. Visible columns: Company Name (task name), Contact Name, Segment, Category, Company City, Owner Notes

- [ ] **Step 8: Create "Prospecting Requests" view**

  1. Navigate to the Prospecting Requests list
  2. Add List view named `Prospecting Requests`
  3. Sort: Date Created descending
  4. Visible columns: Task name, Segment, Category, Target City, Status, Results Found, Leads Created

  **Verification:** Navigate between all 8 views. Each should load with the correct filters and columns.

---

### Task 6: Create Pipeline Health Dashboard

- [ ] **Step 1: Create dashboard**

  1. In ClickUp, navigate to Dashboards (left sidebar)
  2. Click `+` to create a new dashboard
  3. Name: `Pipeline Health`

- [ ] **Step 2: Add widgets**

  Add the following widgets:

  | Widget | Type | Configuration |
  |--------|------|---------------|
  | Status Distribution | Pie chart | Source: Prospects list, group by Status |
  | New Leads This Week | Count | Source: Prospects list, filter: Date Created within last 7 days |
  | Leads by Segment | Bar chart | Source: Prospects list, group by Segment |
  | Active Outreach | Count | Source: Prospects list, filter: Status = "Outreach Active" |
  | Responded This Month | Count | Source: Prospects list, filter: Status = "Responded - Owner Follow-up", Date Updated within last 30 days |
  | Won This Month | Count | Source: Prospects list, filter: Status = "Won", Date Updated within last 30 days |
  | Leads by Category | Bar chart | Source: Prospects list, group by Category |
  | Leads by City | Bar chart | Source: Prospects list, group by Company City |

  **Note:** Some widget types depend on the ClickUp plan. If certain chart types are unavailable, substitute with equivalent count/list widgets.

  **Verification:** Dashboard loads with all widgets. Widgets will show empty/zero until test data is created.

---

### Task 7: Set Up ClickUp Automations (9 automations)

All automations are configured in ClickUp's Automation feature (Prospects list > Automations).

- [ ] **Step 1: Automation 1 — Set Review Date on Decision**

  1. Go to Prospects list > Automations > Create Automation
  2. Trigger: Custom field "Review Decision" changes
  3. Condition: Previous value was "Pending Review"
  4. Action: Set custom field "Review Date" to today's date
  5. Name the automation: `Set Review Date on Decision`

  **Expected behavior:** When Jenn changes Review Decision from "Pending Review" to any other value (Approved, Rejected, etc.), Review Date auto-fills with today.

- [ ] **Step 2: Automation 2 — Flag Bounce**

  1. Trigger: Custom field "Bounced" is checked (value changes to `true`)
  2. Action: Change status to "Bounced"
  3. Name: `Flag Bounce — Move to Bounced`

  **Expected behavior:** When Zapier checks the Bounced checkbox, the task automatically moves to the Bounced closed status.

- [ ] **Step 3: Automation 3 — Flag Unsubscribe**

  1. Trigger: Custom field "Unsubscribed" is checked (value changes to `true`)
  2. Action: Change status to "Unsubscribed"
  3. Name: `Flag Unsubscribe — Move to Unsubscribed`

  **Expected behavior:** CASL compliance — immediately removes opted-out leads from active pipeline.

- [ ] **Step 4: Automation 4 — Reply Detected**

  1. Trigger: Custom field "Replies" changes AND new value >= 1
  2. Action 1: Change status to "Responded - Owner Follow-up"
  3. Action 2: Send notification to workspace owner (Jenn) — ClickUp notification + email
  4. Name: `Reply Detected — Flag for Follow-up`

  **Expected behavior:** When Zapier increments Replies to 1+, the task moves to follow-up status and Jenn gets notified.

- [ ] **Step 5: Automation 5 — Sequence Complete / Dormancy**

  1. Trigger: Custom field "Sequence Status" changes to "Sequence Complete"
  2. Condition: Custom field "Replies" equals 0
  3. Action 1: Change status to "Dormant"
  4. Action 2: Set custom field "Dormant Date" to today
  5. Action 3: Set custom field "Dormant Reactivation Date" to today + 90 days

  **Note on "today + 90 days":** ClickUp automations may not support date arithmetic directly. If not:
  - Option A: Use a Zapier Zap instead (Trigger: ClickUp field change, Action: Formatter date math + ClickUp update)
  - Option B: Have the dormancy-check Cloud Function calculate and set this when it detects a newly Dormant task with an empty Reactivation Date

  Name: `Sequence Complete — Check for Dormancy`

  **Expected behavior:** 3-touch sequence finishes with no reply => task enters 90-day cool-off automatically.

- [ ] **Step 6: Automation 6 — Rejection**

  1. Trigger: Custom field "Review Decision" changes to "Rejected"
  2. Action: Change status to "Enriched"
  3. Name: `Rejection — Move Back to Enriched`

  **Expected behavior:** Rejected leads re-enter the personalization queue for the next agent run.

- [ ] **Step 7: Automation 7 — "I Know This Person"**

  1. Trigger: Custom field "Review Decision" changes to "I Know This Person"
  2. Action 1: Change status to "Responded - Owner Follow-up"
  3. Action 2: Add tag `warm-intro` to the task
  4. Name: `I Know This Person — Move to Follow-up`

  **Expected behavior:** Owner bypasses automated outreach, lead goes straight to personal follow-up.

- [ ] **Step 8: Automation 8 — Daily Review Reminder**

  1. Trigger: Recurring schedule — daily at 8:00 AM Pacific
  2. Condition: Tasks exist with status "Ready for Review"
  3. Action: Send notification to workspace owner: "You have leads waiting for review"
  4. Name: `Daily Review Reminder`

  **Note:** This requires ClickUp's scheduled automation feature (available on paid plans). If not available on the current plan, substitute with a simple Cloud Scheduler job that queries ClickUp and sends an email to Jenn if Ready for Review tasks exist.

- [ ] **Step 9: Automation 9 — Warm Intro Context Prompt (from review resolution #15)**

  1. Trigger: Custom field "Review Decision" changes to "I Know This Person"
  2. Action: Post a comment on the task with this text:

  ```
  --- WARM INTRO GUIDE ---

  1. HOW DO YOU KNOW THEM?
     Add a note in "Owner Notes" — e.g., "Met at BNI", "Kid plays on same soccer team"

  2. SUGGESTED APPROACH (pick one):
     - Text/call them directly
     - Personal email from your regular inbox (not the cold system)
     - Message on social media / LinkedIn
     - Mention it next time you see them

  3. TALKING POINTS:
     - "Hey [name], I was putting together some outreach and your name came up — figured I'd just reach out directly instead"
     - Reference your connection naturally
     - Mention what Jaydees does for their type of org
     - If relevant, bring up Wear It Forward

  4. DO NOT:
     - Send the AI-generated drafts to this person
     - Put them through the automated sequence

  5. UPDATE THIS TASK:
     - Interested: keep as "Responded - Owner Follow-up"
     - Not interested: move to "Lost"
     - Converts: move to "Won"
  ```

  Name: `Warm Intro Context Prompt`

  **Note:** Automation 7 and 9 share the same trigger ("Review Decision" changes to "I Know This Person"). Both should fire. If ClickUp only allows one automation per trigger condition, combine them into a single automation with multiple actions: (1) change status, (2) add tag, (3) post comment.

  **Verification for all automations:** After all 9 are created, review the Automations list. Expected: 9 active automations. Functional testing happens in Part E.

---

## Part B: Instantly Configuration

### Task 8: Verify Sending Domain Setup

**Prerequisite:** shopjaydees.ca and shopjaydees.net must be linked to Google Workspace with proper DNS records (SPF, DKIM, DMARC).

- [ ] **Step 1: Verify DNS records for shopjaydees.ca**

  ```bash
  # Check SPF record
  dig TXT shopjaydees.ca +short | grep spf

  # Check DKIM (Instantly-specific selector)
  dig TXT default._domainkey.shopjaydees.ca +short

  # Check DMARC
  dig TXT _dmarc.shopjaydees.ca +short
  ```

  **Expected:**
  - SPF: `v=spf1 include:_spf.google.com ~all` (or similar with Google included)
  - DKIM: A valid DKIM public key record
  - DMARC: `v=DMARC1; p=none;` (or quarantine/reject)

- [ ] **Step 2: Verify DNS records for shopjaydees.net**

  Same checks as Step 1 but for the `.net` domain.

- [ ] **Step 3: Add sending accounts in Instantly**

  1. Log into Instantly (app.instantly.ai)
  2. Go to Email Accounts > Add Account
  3. Add `ellie@shopjaydees.ca` (connect via Google Workspace OAuth or SMTP)
  4. Add `ellie@shopjaydees.net` (same process)
  5. Verify both accounts show "Connected" status

  **Verification:** Both email accounts appear in the Email Accounts list with green "Connected" status.

- [ ] **Step 4: Start domain warmup**

  1. In Instantly, go to Email Accounts
  2. Select both sending accounts
  3. Enable warmup for both
  4. Set warmup configuration:
     - Increase per day: 2-3 emails/day
     - Daily warmup limit: Start at 10, increase gradually
     - Reply rate: 30-40%
  5. Let warmup run for 3-4 weeks before sending real outreach

  **Warmup schedule:**

  | Week | Daily Send Limit | Warmup Emails/Day | Real Emails/Day |
  |------|-----------------|-------------------|-----------------|
  | 1 | 10 | 10 | 0 |
  | 2 | 20 | 15 | 5 |
  | 3 | 30 | 15 | 15 |
  | 4+ | 40-50 | 10-15 | 25-40 |

  **Note:** Do NOT send real outreach until warmup has been active for at least 2 full weeks. Testing (Phase 3) can use the warmup period since test volumes are tiny (3-5 emails).

---

### Task 9: Create Campaign Template in Instantly

- [ ] **Step 1: Create the first campaign**

  1. In Instantly, go to Campaigns > New Campaign
  2. Name: `Business - 2026-06` (or current month)
  3. Select sending accounts: both `ellie@shopjaydees.ca` and `ellie@shopjaydees.net`
  4. Enable account rotation (round-robin between the two domains)

- [ ] **Step 2: Configure the 3-step sequence**

  1. **Step 1 (Touch 1):**
     - Subject: `{{touch_1_subject}}`
     - Body: `{{touch_1_body}}`
     - Delay: Send immediately (0 days)

  2. **Step 2 (Touch 2):**
     - Subject: `{{touch_2_subject}}`
     - Body: `{{touch_2_body}}`
     - Delay: 4 days after Step 1

  3. **Step 3 (Touch 3):**
     - Subject: `{{touch_3_subject}}`
     - Body: `{{touch_3_body}}`
     - Delay: 5 days after Step 2 (Day 9 total)

- [ ] **Step 3: Configure campaign schedule**

  1. Schedule: Weekdays only (Monday-Friday)
  2. Timezone: America/Vancouver (Pacific)
  3. Sending window: 8:00 AM to 5:00 PM
  4. Daily send limit per account: Match warmup stage (start conservative)

- [ ] **Step 4: Configure campaign settings**

  1. Stop on reply: Enabled (Instantly pauses remaining touches when prospect replies)
  2. Stop on bounce: Enabled
  3. Stop on unsubscribe: Enabled
  4. Open tracking: Enabled
  5. Link tracking: Disabled (reduces deliverability issues for cold email)
  6. Unsubscribe link: Enabled and required (CASL compliance)

  **Verification:** Campaign shows as "Draft" or "Paused" with all 3 sequence steps configured. Do NOT activate yet — activation happens during testing.

- [ ] **Step 5: Verify sending domain rotation**

  In the campaign settings, confirm that both `ellie@shopjaydees.ca` and `ellie@shopjaydees.net` are assigned and rotation is enabled. Instantly should alternate between domains for consecutive sends.

---

## Part C: Zapier Zap Setup

### Task 10: Connect Instantly and ClickUp in Zapier

- [ ] **Step 1: Authenticate Instantly in Zapier**

  1. Log into Zapier (zapier.com)
  2. Go to My Apps > Add Connection
  3. Search for "Instantly" and connect with the API key
  4. Test the connection

- [ ] **Step 2: Authenticate ClickUp in Zapier**

  1. In My Apps > Add Connection
  2. Search for "ClickUp" and connect via OAuth
  3. Grant access to the ShopJaydees workspace
  4. Test the connection

---

### Task 11: Create Zap 1 — Email Sent → Update Sequence Status

This is the most complex zap because it uses Paths to determine which touch was sent.

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Email Sent → ClickUp Sequence Status`
  2. **Trigger:** Instantly > "Email Sent" (or "Email Activity" filtered to sends)
  3. **Step 2: Search ClickUp Task**
     - App: ClickUp
     - Action: Find Task
     - Search in: Prospects list (use the list ID)
     - Search by: Custom Field "Contact Email" = email from Instantly trigger
  4. **Step 3: Paths** (determine which touch was sent)

     **Path A — Touch 1:** Condition: Instantly `step` or `sequence_step` = 1
     - Action: ClickUp > Update Task
     - Task ID: from Step 2 search result
     - Custom fields to update:
       - Sequence Status = "Touch 1 Sent" (dropdown index 1)
       - Touch 1 Sent Date = today

     **Path B — Touch 2:** Condition: `step` = 2
     - Action: ClickUp > Update Task
     - Custom fields:
       - Sequence Status = "Touch 2 Sent" (dropdown index 2)
       - Touch 2 Sent Date = today

     **Path C — Touch 3:** Condition: `step` = 3
     - Action: ClickUp > Update Task
     - Custom fields:
       - Sequence Status = "Touch 3 Sent" (dropdown index 3)
       - Touch 3 Sent Date = today

     **Path D — No Match (fallback):**
     - Action: Send email alert to cody@sixohquad.com with the unmatched event data

  **Verification:** Zap is created and turned ON. Test with Zapier's built-in test (uses sample data from Instantly).

---

### Task 12: Create Zap 2 — Email Opened → Update Opens Count

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Email Opened → ClickUp Open Count`
  2. **Trigger:** Instantly > "Email Opened"
  3. **Step 2: Search ClickUp Task**
     - Find Task by Contact Email = email from trigger
  4. **Step 3: Formatter**
     - Math operation: Current "Opens" value + 1
     - (Get current Opens from Step 2 search result, add 1)
  5. **Step 4: Update ClickUp Task**
     - Opens = calculated value from Step 3
     - Last Open Date = today
  6. **Step 5 (fallback): Path for no search result**
     - If Step 2 returns no task: send email alert to cody@sixohquad.com

  **Verification:** Zap ON. Test with sample data.

---

### Task 13: Create Zap 3 — Reply Received → Update Replies

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Reply → ClickUp Replies`
  2. **Trigger:** Instantly > "Reply Received"
  3. **Step 2: Search ClickUp Task** by Contact Email
  4. **Step 3: Formatter** — current Replies + 1
  5. **Step 4: Update ClickUp Task**
     - Replies = calculated value
     - Last Reply Date = today
  6. **Step 5 (fallback):** Alert on no match

  **Note:** The ClickUp Automation 4 ("Reply Detected") will fire when Replies changes to >= 1, automatically moving the task to "Responded - Owner Follow-up" and notifying Jenn. This zap only updates the data fields.

  **Verification:** Zap ON. Test with sample data.

---

### Task 14: Create Zap 4 — Email Bounced → Flag in ClickUp

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Bounce → ClickUp Bounced`
  2. **Trigger:** Instantly > "Email Bounced"
  3. **Step 2: Search ClickUp Task** by Contact Email
  4. **Step 3: Update ClickUp Task**
     - Bounced = checked (true)
  5. **Step 4 (fallback):** Alert on no match

  **Note:** ClickUp Automation 2 ("Flag Bounce") handles the status change to "Bounced" when the checkbox is checked.

  **Verification:** Zap ON. Test with sample data.

---

### Task 15: Create Zap 5 — Unsubscribe → Flag in ClickUp

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Unsubscribe → ClickUp Unsubscribed`
  2. **Trigger:** Instantly > "Unsubscribe"
  3. **Step 2: Search ClickUp Task** by Contact Email
  4. **Step 3: Update ClickUp Task**
     - Unsubscribed = checked (true)
  5. **Step 4 (fallback):** Alert on no match

  **Note:** ClickUp Automation 3 ("Flag Unsubscribe") handles the status change. CASL compliance — immediate removal.

  **Verification:** Zap ON. Test with sample data.

---

### Task 16: Create Zap 6 — Sequence Complete → Update ClickUp

- [ ] **Step 1: Create the zap**

  1. New Zap > Name: `Instantly Sequence Complete → ClickUp`
  2. **Trigger:** Instantly > "Sequence Completed" (all steps sent for this lead)
  3. **Step 2: Search ClickUp Task** by Contact Email
  4. **Step 3: Update ClickUp Task**
     - Sequence Status = "Sequence Complete" (dropdown index 4)
  5. **Step 4 (fallback):** Alert on no match

  **Note:** ClickUp Automation 5 ("Sequence Complete — Check for Dormancy") fires when Sequence Status = "Sequence Complete" and Replies = 0, moving the task to Dormant with reactivation date.

  **Verification:** Zap ON. Test with sample data.

- [ ] **Step 2: Verify all 6 zaps are active**

  In Zapier dashboard, confirm all 6 zaps show "ON" status:

  | # | Zap Name | Status |
  |---|----------|--------|
  | 1 | Instantly Email Sent → ClickUp Sequence Status | ON |
  | 2 | Instantly Email Opened → ClickUp Open Count | ON |
  | 3 | Instantly Reply → ClickUp Replies | ON |
  | 4 | Instantly Bounce → ClickUp Bounced | ON |
  | 5 | Instantly Unsubscribe → ClickUp Unsubscribed | ON |
  | 6 | Instantly Sequence Complete → ClickUp | ON |

---

## Part D: Google Cloud Platform Setup

### Task 17: Create GCP Project and Enable APIs

- [ ] **Step 1: Create the GCP project**

  ```bash
  gcloud projects create shopjaydees-leadgen \
    --name="ShopJaydees Lead Generation" \
    --set-as-default
  ```

  **If project already exists (client created it):**

  ```bash
  gcloud config set project shopjaydees-leadgen
  ```

- [ ] **Step 2: Enable required APIs**

  ```bash
  gcloud services enable \
    cloudfunctions.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com \
    --project=shopjaydees-leadgen
  ```

  **Verification:**

  ```bash
  gcloud services list --enabled --project=shopjaydees-leadgen | grep -E "cloudfunctions|cloudscheduler|cloudbuild|run|logging|monitoring"
  ```

  All 6 services should appear.

- [ ] **Step 3: Set the default region**

  ```bash
  gcloud config set functions/region us-west1
  gcloud config set run/region us-west1
  ```

  **Note:** `us-west1` (Oregon) is the closest GCP region to BC, Canada.

---

### Task 18: Create Service Account for Cloud Scheduler

- [ ] **Step 1: Create the service account**

  ```bash
  gcloud iam service-accounts create scheduler-sa \
    --display-name="Cloud Scheduler Service Account" \
    --project=shopjaydees-leadgen
  ```

- [ ] **Step 2: Grant Cloud Functions invoker role**

  ```bash
  gcloud projects add-iam-policy-binding shopjaydees-leadgen \
    --member="serviceAccount:scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.invoker"
  ```

- [ ] **Step 3: Grant Cloud Run invoker role (for Gen2 functions)**

  ```bash
  gcloud projects add-iam-policy-binding shopjaydees-leadgen \
    --member="serviceAccount:scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --role="roles/run.invoker"
  ```

  **Verification:**

  ```bash
  gcloud iam service-accounts list --project=shopjaydees-leadgen
  # Should show scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com
  ```

---

### Task 19: Deploy Cloud Functions

All 4 functions share the same source directory (`pipeline/`) but have different entry points, memory, and timeout configurations.

- [ ] **Step 1: Build the TypeScript project**

  ```bash
  cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline
  npm ci
  npm run build
  ```

  **Verification:** `dist/` directory created with compiled JavaScript files.

- [ ] **Step 2: Deploy Discovery Agent**

  ```bash
  gcloud functions deploy discover \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-west1 \
    --source=./pipeline \
    --entry-point=discover \
    --trigger-http \
    --memory=512MB \
    --timeout=540s \
    --max-instances=1 \
    --concurrency=1 \
    --no-allow-unauthenticated \
    --set-env-vars="$(cat pipeline/.env | grep -v '^#' | grep -v '^$' | tr '\n' ',')" \
    --project=shopjaydees-leadgen
  ```

  **Note:** The `--set-env-vars` approach works for small env sets. For 66 vars, use `--env-vars-file`:

  ```bash
  # Convert .env to YAML format for gcloud
  grep -v '^#' pipeline/.env | grep -v '^$' | sed 's/=\(.*\)/: "\1"/' > pipeline/.env.yaml

  gcloud functions deploy discover \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-west1 \
    --source=./pipeline \
    --entry-point=discover \
    --trigger-http \
    --memory=512MB \
    --timeout=540s \
    --max-instances=1 \
    --concurrency=1 \
    --no-allow-unauthenticated \
    --env-vars-file=pipeline/.env.yaml \
    --project=shopjaydees-leadgen
  ```

  **Verification:**

  ```bash
  gcloud functions describe discover --region=us-west1 --project=shopjaydees-leadgen \
    --format="table(name,state,runtime,availableMemoryMb,timeout)"
  # Expected: ACTIVE, nodejs20, 512MB, 540s
  ```

- [ ] **Step 3: Deploy Personalization Agent**

  ```bash
  gcloud functions deploy personalize \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-west1 \
    --source=./pipeline \
    --entry-point=personalize \
    --trigger-http \
    --memory=512MB \
    --timeout=540s \
    --max-instances=1 \
    --concurrency=1 \
    --no-allow-unauthenticated \
    --env-vars-file=pipeline/.env.yaml \
    --project=shopjaydees-leadgen
  ```

  **Verification:** Same as Step 2 — check `ACTIVE` state, 512MB, 540s.

- [ ] **Step 4: Deploy Send Agent**

  ```bash
  gcloud functions deploy send \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-west1 \
    --source=./pipeline \
    --entry-point=send \
    --trigger-http \
    --memory=256MB \
    --timeout=300s \
    --max-instances=1 \
    --concurrency=1 \
    --no-allow-unauthenticated \
    --env-vars-file=pipeline/.env.yaml \
    --project=shopjaydees-leadgen
  ```

  **Verification:** `ACTIVE`, 256MB, 300s.

- [ ] **Step 5: Deploy Dormancy Check**

  ```bash
  gcloud functions deploy dormancy-check \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-west1 \
    --source=./pipeline \
    --entry-point=dormancyCheck \
    --trigger-http \
    --memory=256MB \
    --timeout=120s \
    --max-instances=1 \
    --concurrency=1 \
    --no-allow-unauthenticated \
    --env-vars-file=pipeline/.env.yaml \
    --project=shopjaydees-leadgen
  ```

  **Verification:** `ACTIVE`, 256MB, 120s.

- [ ] **Step 6: Verify all 4 functions are deployed**

  ```bash
  gcloud functions list --region=us-west1 --project=shopjaydees-leadgen \
    --format="table(name,state,runtime,availableMemoryMb,timeout)"
  ```

  Expected output:

  | Name | State | Runtime | Memory | Timeout |
  |------|-------|---------|--------|---------|
  | discover | ACTIVE | nodejs20 | 512MB | 540s |
  | personalize | ACTIVE | nodejs20 | 512MB | 540s |
  | send | ACTIVE | nodejs20 | 256MB | 300s |
  | dormancy-check | ACTIVE | nodejs20 | 256MB | 120s |

---

### Task 20: Create Cloud Scheduler Jobs

- [ ] **Step 1: Get function URLs**

  ```bash
  DISCOVER_URL=$(gcloud functions describe discover --region=us-west1 --project=shopjaydees-leadgen --format="value(serviceConfig.uri)")
  PERSONALIZE_URL=$(gcloud functions describe personalize --region=us-west1 --project=shopjaydees-leadgen --format="value(serviceConfig.uri)")
  SEND_URL=$(gcloud functions describe send --region=us-west1 --project=shopjaydees-leadgen --format="value(serviceConfig.uri)")
  DORMANCY_URL=$(gcloud functions describe dormancy-check --region=us-west1 --project=shopjaydees-leadgen --format="value(serviceConfig.uri)")

  echo "Discover: $DISCOVER_URL"
  echo "Personalize: $PERSONALIZE_URL"
  echo "Send: $SEND_URL"
  echo "Dormancy: $DORMANCY_URL"
  ```

- [ ] **Step 2: Create Discovery Agent scheduler job**

  ```bash
  gcloud scheduler jobs create http discover-daily \
    --schedule="0 4 * * 1-5" \
    --time-zone="America/Vancouver" \
    --uri="${DISCOVER_URL}" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{}' \
    --oidc-service-account-email="scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --oidc-token-audience="${DISCOVER_URL}" \
    --attempt-deadline=600s \
    --location=us-west1 \
    --project=shopjaydees-leadgen \
    --description="Discovery Agent — Mon-Fri 4:00 AM Pacific"
  ```

- [ ] **Step 3: Create Personalization Agent scheduler job**

  ```bash
  gcloud scheduler jobs create http personalize-daily \
    --schedule="0 5 * * 1-5" \
    --time-zone="America/Vancouver" \
    --uri="${PERSONALIZE_URL}" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{}' \
    --oidc-service-account-email="scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --oidc-token-audience="${PERSONALIZE_URL}" \
    --attempt-deadline=600s \
    --location=us-west1 \
    --project=shopjaydees-leadgen \
    --description="Personalization Agent — Mon-Fri 5:00 AM Pacific"
  ```

- [ ] **Step 4: Create Send Agent scheduler job**

  ```bash
  gcloud scheduler jobs create http send-daily \
    --schedule="0 9 * * 1-5" \
    --time-zone="America/Vancouver" \
    --uri="${SEND_URL}" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{}' \
    --oidc-service-account-email="scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --oidc-token-audience="${SEND_URL}" \
    --attempt-deadline=360s \
    --location=us-west1 \
    --project=shopjaydees-leadgen \
    --description="Send Agent — Mon-Fri 9:00 AM Pacific"
  ```

- [ ] **Step 5: Create Dormancy Check scheduler job**

  ```bash
  gcloud scheduler jobs create http dormancy-weekly \
    --schedule="0 6 * * 0" \
    --time-zone="America/Vancouver" \
    --uri="${DORMANCY_URL}" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{}' \
    --oidc-service-account-email="scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com" \
    --oidc-token-audience="${DORMANCY_URL}" \
    --attempt-deadline=180s \
    --location=us-west1 \
    --project=shopjaydees-leadgen \
    --description="Dormancy Check — Sunday 6:00 AM Pacific"
  ```

- [ ] **Step 6: Verify all 4 scheduler jobs**

  ```bash
  gcloud scheduler jobs list --location=us-west1 --project=shopjaydees-leadgen \
    --format="table(name,schedule,timeZone,state)"
  ```

  Expected:

  | Name | Schedule | Timezone | State |
  |------|----------|----------|-------|
  | discover-daily | `0 4 * * 1-5` | America/Vancouver | ENABLED |
  | personalize-daily | `0 5 * * 1-5` | America/Vancouver | ENABLED |
  | send-daily | `0 9 * * 1-5` | America/Vancouver | ENABLED |
  | dormancy-weekly | `0 6 * * 0` | America/Vancouver | ENABLED |

---

### Task 21: Set Up GCP Monitoring Alert

- [ ] **Step 1: Create alert policy for Cloud Function errors**

  ```bash
  gcloud alpha monitoring policies create \
    --display-name="Pipeline Function Errors" \
    --condition-display-name="Cloud Function execution failure" \
    --condition-filter='resource.type="cloud_function" AND metric.type="cloudfunctions.googleapis.com/function/execution_count" AND metric.labels.status!="ok"' \
    --condition-threshold-value=1 \
    --condition-threshold-duration=0s \
    --condition-threshold-comparison=COMPARISON_GT \
    --notification-channels="<notification_channel_id>" \
    --project=shopjaydees-leadgen
  ```

  **Alternative (if gcloud alpha is unavailable):** Create the alert policy in the GCP Console:

  1. Go to Monitoring > Alerting > Create Policy
  2. Add condition: Cloud Function execution errors > 0
  3. Add notification channel: email to cody@sixohquad.com
  4. Alert name: "Pipeline Function Errors"

  **Verification:** Alert policy appears in Monitoring > Alerting with "Enabled" status.

---

## Part E: Integration Testing

### Task 22: Phase 1 — Component Testing

**Duration:** 1-2 hours

#### ClickUp Workspace Validation

- [ ] **Step 1: Create 5 test leads manually**

  Create 5 test tasks in the Prospects list via the ClickUp API. One per segment category to validate all field types and dropdown options work:

  ```bash
  # Test Lead 1: Business — Trades
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Fraser Valley Plumbing — Mike Thompson",
      "status": "New",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Fraser Valley Plumbing"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://fvplumbing-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Mike Thompson"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "mike@fvplumbing-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 4},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0}
      ]
    }'

  # Test Lead 2: School — Elementary
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Langley Secondary School — Sarah Chen",
      "status": "New",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Langley Secondary School"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://langley-secondary-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Sarah Chen"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "schen@langley-secondary-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 1},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 5},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 5},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 1}
      ]
    }'

  # Test Lead 3: Team — Youth Sports
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Surrey Minor Hockey — David Park",
      "status": "New",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Surrey Minor Hockey"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://surrey-hockey-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "David Park"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "dpark@surrey-hockey-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 2},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 9},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 3},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0}
      ]
    }'

  # Test Lead 4: Low-score lead (Parked)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Tiny Cafe — Unknown Owner",
      "status": "Parked",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Tiny Cafe"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://tinycafe-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Unknown Owner"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "info@tinycafe-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 1},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 2},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 2}
      ]
    }'

  # Test Lead 5: Automation test lead (Ready for Review)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Automation Test Co — Jane Doe",
      "status": "Ready for Review",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Automation Test Co"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://automation-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Jane Doe"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "jane@automation-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 4},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_EMAIL_TOUCH_1}'", "value": "Hi Jane, this is a test email touch 1 body for automation testing. It references Automation Test Co specifically."},
        {"id": "'${CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT}'", "value": "Test subject line for your crew"},
        {"id": "'${CLICKUP_FIELD_REVIEW_DECISION}'", "value": 0}
      ]
    }'
  ```

- [ ] **Step 2: Walk through status transitions manually**

  Test each transition using the ClickUp API (or UI):

  | Test | Action | Expected Result |
  |------|--------|----------------|
  | New → Enriched | Change Test Lead 1 status to "Enriched" | Status changes, task visible in Enriched filter |
  | Enriched → Personalizing → Ready for Review | Change status through the chain | Status changes cleanly |
  | Ready for Review → Approved | On Test Lead 5, set Review Decision to "Approved" | Automation 1 fires: Review Date set to today |
  | Ready for Review → Rejected | Create a 6th test lead at Ready for Review, set Review Decision to "Rejected" | Automation 6 fires: status moves back to Enriched |
  | Ready for Review → "I Know This Person" | Create a 7th test lead at Ready for Review, set Review Decision to "I Know This Person" | Automation 7 fires: status → Responded - Owner Follow-up, tag `warm-intro` added. Automation 9 fires: warm intro guide comment posted |
  | Outreach Active → Bounced | Set Bounced checkbox to true on a test lead | Automation 2 fires: status → Bounced |
  | Outreach Active → Unsubscribed | Set Unsubscribed checkbox to true on a test lead | Automation 3 fires: status → Unsubscribed |
  | Reply detected | Set Replies = 1 on an Outreach Active test lead | Automation 4 fires: status → Responded - Owner Follow-up, notification sent to Jenn |
  | Sequence Complete (no replies) | Set Sequence Status = "Sequence Complete" on an Outreach Active lead with Replies = 0 | Automation 5 fires: status → Dormant, Dormant Date and Reactivation Date set |

  **Record:** For each test, note whether the automation fired correctly and the expected fields were updated. Fix any automations that do not trigger.

- [ ] **Step 3: Verify views**

  1. Open each of the 8 views
  2. Confirm test leads appear in the correct views based on their status
  3. Confirm column visibility and sort order match the spec

  | View | Expected Test Leads |
  |------|-------------------|
  | Approval Queue | Test Lead 5 (Ready for Review) |
  | My Follow-ups | Any leads moved to Responded - Owner Follow-up |
  | Pipeline Board | All active leads shown as cards in status columns |
  | Active Outreach | Any leads in Outreach Active |
  | LinkedIn Queue | Leads with LinkedIn Message populated |
  | Parked Leads | Test Lead 4 (Parked) |
  | Won Deals | Empty (no Won leads yet) |
  | Prospecting Requests | Empty (separate list) |

- [ ] **Step 4: Have Jenn walk through the Approval Queue**

  Schedule a 15-minute screen share with Jenn:
  1. Show her the Approval Queue view
  2. Walk her through opening a task, reading draft emails, and setting Review Decision
  3. Let her approve one and reject one
  4. Verify automations fire for her actions
  5. Show her the Pipeline Board view for visual overview
  6. Show her the My Follow-ups view

  **Expected outcome:** Jenn is comfortable navigating the three daily views.

#### Cloud Function Component Tests

- [ ] **Step 5: Test Discovery Agent locally with dry run**

  ```bash
  cd /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline

  # Create a test Prospecting Request in ClickUp first
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/task" \
    -d '{
      "name": "Schools — Elementary & Secondary in Langley",
      "status": "Requested",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_PR_SEGMENT}'", "value": 1},
        {"id": "'${CLICKUP_FIELD_PR_CATEGORY}'", "value": 5},
        {"id": "'${CLICKUP_FIELD_PR_TARGET_CITY}'", "value": 1},
        {"id": "'${CLICKUP_FIELD_PR_MAX_RESULTS}'", "value": 5}
      ]
    }'

  # Run Discovery Agent in dry-run mode
  DRY_RUN=true npx functions-framework --target=discover --source=dist/index.js &
  sleep 2
  curl -s -X POST http://localhost:8080 -H "Content-Type: application/json" -d '{"dry_run": true}'
  kill %1
  ```

  **Expected:** Agent queries Hunter.io, scores leads, logs what it would create, but does not create ClickUp tasks. Prospecting Request stays in "Requested" status.

- [ ] **Step 6: Test Personalization Agent locally**

  ```bash
  # Run against test leads already in Enriched status
  DRY_RUN=true npx functions-framework --target=personalize --source=dist/index.js &
  sleep 2
  curl -s -X POST http://localhost:8080 -H "Content-Type: application/json" -d '{"batch_size": 2, "dry_run": true}'
  kill %1
  ```

  **Expected:** Agent picks up Enriched test leads, scrapes websites (Firecrawl), generates drafts (Gemini), logs output. In dry-run, does not update ClickUp.

- [ ] **Step 7: Test Send Agent locally (dry run)**

  ```bash
  DRY_RUN=true npx functions-framework --target=send --source=dist/index.js &
  sleep 2
  curl -s -X POST http://localhost:8080 -H "Content-Type: application/json" -d '{"dry_run": true}'
  kill %1
  ```

  **Expected:** Agent reads Approved leads, logs what it would push to Instantly, does not create campaigns or leads in Instantly.

---

### Task 23: Phase 2 — Integration Testing

**Duration:** 3-4 hours

This is the full pipeline running end-to-end with real API calls (but still using test data).

- [ ] **Step 1: Create real Prospecting Requests and run Discovery Agent**

  Create 3 Prospecting Requests in ClickUp (via UI — let Jenn create them as practice):

  | Request | Segment | Category | City | Max Results |
  |---------|---------|----------|------|-------------|
  | 1 | School | Elementary & Secondary | Langley | 5 |
  | 2 | Business | Trades & Contractors | Surrey | 5 |
  | 3 | Team | Youth Sports Leagues | Abbotsford | 5 |

  Then trigger the Discovery Agent manually (not via scheduler):

  ```bash
  curl -s -X POST "${DISCOVER_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${DISCOVER_URL})" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

  **Expected outcomes:**
  - All 3 requests move from "Requested" to "Complete"
  - New lead tasks appear in the Prospects list
  - Each lead has: Company Name, Contact Email, Lead Score, Segment, Category, Company City populated
  - Score 3+ leads are in "Enriched" status
  - Score 1-2 leads are in "Parked" status
  - Each Prospecting Request has Results Found, Leads Created, Leads Parked, Duplicates Skipped filled in
  - Each Prospecting Request has a completion comment

  **Verification:**

  ```bash
  # Check Prospecting Requests are Complete
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/task?statuses[]=Complete" \
    | jq '.tasks | length'
  # Expected: 3

  # Check new leads were created
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?statuses[]=Enriched" \
    | jq '.tasks | length'
  # Expected: > 0
  ```

- [ ] **Step 2: Run Personalization Agent on discovered leads**

  ```bash
  curl -s -X POST "${PERSONALIZE_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${PERSONALIZE_URL})" \
    -H "Content-Type: application/json" \
    -d '{"batch_size": 5}'
  ```

  **Expected outcomes:**
  - Enriched leads (score 3+) move through Personalizing → Ready for Review
  - Each processed lead has populated: Website Scrape Summary, Email Touch 1-3 (body + subject), LinkedIn Message, CASL fields
  - Review Decision is set to "Pending Review"
  - Leads that had scrape failures are tagged `no-scrape` but still have drafts

  **Verification:**

  ```bash
  # Check leads in Ready for Review
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?statuses[]=Ready%20for%20Review" \
    | jq '.tasks[] | {name, id}' | head -20

  # Spot-check one lead's draft fields
  TASK_ID="<pick a task_id from above>"
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/task/${TASK_ID}" \
    | jq '.custom_fields[] | select(.name | startswith("Email Touch")) | {name, value}'
  ```

  Review 2-3 drafts for quality: tone, personalization, correct company reference, subject line length.

- [ ] **Step 3: Jenn does a real approval session**

  Have Jenn open the Approval Queue and review the test leads:
  - Approve 2-3 leads (some as-is, some with edits)
  - Reject 1 lead (to test rejection flow)
  - Mark 1 lead as "I Know This Person" (if plausible)

  **Verify after her session:**
  - Approved leads are in "Approved" status
  - Rejected lead is back in "Enriched" (Automation 6)
  - "I Know This Person" lead is in "Responded - Owner Follow-up" with `warm-intro` tag and warm intro guide comment (Automations 7+9)
  - Review Date is set on all reviewed leads (Automation 1)

- [ ] **Step 4: Run Send Agent in dry-run mode**

  ```bash
  curl -s -X POST "${SEND_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${SEND_URL})" \
    -H "Content-Type: application/json" \
    -d '{"dry_run": true}'
  ```

  **Expected:** Agent picks up Approved leads, logs the Instantly API calls it would make (campaign creation, lead addition), but does not actually push to Instantly. Check Cloud Logging for the structured output:

  ```bash
  gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"send-"' \
    --limit=20 --project=shopjaydees-leadgen --format=json
  ```

- [ ] **Step 5: Test Zapier zaps with built-in test payloads**

  In Zapier, test each zap individually using Zapier's "Test" feature:

  | Zap | Test Action | Expected ClickUp Update |
  |-----|------------|------------------------|
  | Zap 1 (Email Sent) | Use sample Instantly email-sent event | Sequence Status updates, Sent Date set |
  | Zap 2 (Email Opened) | Use sample open event | Opens increments, Last Open Date set |
  | Zap 3 (Reply) | Use sample reply event | Replies increments, Last Reply Date set |
  | Zap 4 (Bounce) | Use sample bounce event | Bounced checkbox checked |
  | Zap 5 (Unsubscribe) | Use sample unsubscribe event | Unsubscribed checkbox checked |
  | Zap 6 (Sequence Complete) | Use sample completion event | Sequence Status = "Sequence Complete" |

  **Note:** For the search step, the test payloads need to reference an email address that exists in the Prospects list. Use one of the test lead email addresses (e.g., `mike@fvplumbing-test.ca`). Temporarily set that lead to "Outreach Active" status with Replies = 0 for a clean test.

  **Verify:** After each zap test, check the ClickUp task to confirm the field was updated. Also verify that the downstream ClickUp automations fire (e.g., Zap 4 checks Bounced → Automation 2 moves to Bounced status).

- [ ] **Step 6: Test Dormancy Check with a backdated lead**

  Create a Dormant test lead with a past Reactivation Date:

  ```bash
  # Create a Dormant lead with reactivation date in the past
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "TEST — Dormant Lead — Old Contact",
      "status": "Dormant",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "Dormant Test Co"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://dormant-test.ca"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Old Contact"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "old@dormant-test.ca"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 4},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_DORMANT_DATE}'", "value": 1709251200000},
        {"id": "'${CLICKUP_FIELD_DORMANT_REACTIVATION_DATE}'", "value": 1717027200000}
      ]
    }'
  ```

  (The timestamps above represent a dormant date ~90+ days in the past.)

  Then trigger the dormancy check:

  ```bash
  curl -s -X POST "${DORMANCY_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${DORMANCY_URL})" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

  **Expected:** The dormant lead moves to "Enriched" status, gets `re-engagement` tag, old drafts cleared, comment added about reactivation.

---

### Task 24: Phase 3 — Live Dry-Run

**Duration:** 2-3 hours (including wait times for email delivery)

This phase sends real emails to controlled test addresses. Only proceed after Phase 2 passes.

- [ ] **Step 1: Create test leads with real controlled email addresses**

  ```bash
  # Test Lead A: Cody's email (SixOhQuad)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "LIVE-TEST — SixOhQuad — Cody",
      "status": "Enriched",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "SixOhQuad"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://sixohquad.com"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Cody"},
        {"id": "'${CLICKUP_FIELD_CONTACT_TITLE}'", "value": "Owner"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "cody@sixohquad.com"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 4},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CASL_SOURCE_URL}'", "value": "https://sixohquad.com/about"}
      ]
    }'

  # Test Lead B: Jenn's email (ShopJaydees)
  curl -s -X POST \
    -H "Authorization: ${CLICKUP_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task" \
    -d '{
      "name": "LIVE-TEST — ShopJaydees — Jenn",
      "status": "Enriched",
      "custom_fields": [
        {"id": "'${CLICKUP_FIELD_COMPANY_NAME}'", "value": "ShopJaydees"},
        {"id": "'${CLICKUP_FIELD_COMPANY_DOMAIN}'", "value": "https://shopjaydees.com"},
        {"id": "'${CLICKUP_FIELD_CONTACT_NAME}'", "value": "Jenn"},
        {"id": "'${CLICKUP_FIELD_CONTACT_TITLE}'", "value": "Owner"},
        {"id": "'${CLICKUP_FIELD_CONTACT_EMAIL}'", "value": "jenn@shopjaydees.com"},
        {"id": "'${CLICKUP_FIELD_SEGMENT}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CATEGORY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_LEAD_SCORE}'", "value": 4},
        {"id": "'${CLICKUP_FIELD_COMPANY_CITY}'", "value": 0},
        {"id": "'${CLICKUP_FIELD_CASL_SOURCE_URL}'", "value": "https://shopjaydees.com/about"}
      ]
    }'
  ```

- [ ] **Step 2: Run Personalization Agent on live test leads**

  ```bash
  curl -s -X POST "${PERSONALIZE_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${PERSONALIZE_URL})" \
    -H "Content-Type: application/json" \
    -d '{"batch_size": 5}'
  ```

  **Expected:** Both test leads get personalized drafts based on real website scrapes (sixohquad.com and shopjaydees.com). Review the drafts for quality:

  - [ ] Drafts reference specific content from each website
  - [ ] Tone matches spec (friendly, first-name, no corporate jargon)
  - [ ] Subject lines are 4-8 words, no clickbait
  - [ ] Emails signed as "Ellie"
  - [ ] Wear It Forward mentioned naturally in Touch 1
  - [ ] CASL fields populated correctly

- [ ] **Step 3: Jenn approves live test leads**

  Jenn opens the Approval Queue and approves both test leads (editing if desired).

- [ ] **Step 4: Run Send Agent with DRY_RUN=false**

  This is the first real email send.

  ```bash
  curl -s -X POST "${SEND_URL}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${SEND_URL})" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

  **Expected:**
  - Both leads are added to Instantly
  - ClickUp tasks updated: Instantly Campaign ID, Instantly Lead ID, Sending Domain, Sequence Status = "Not Started", Status = "Outreach Active"
  - One lead uses shopjaydees.ca, the other uses shopjaydees.net (domain rotation)

- [ ] **Step 5: Verify email delivery**

  Wait 15-60 minutes for Instantly to send Touch 1 (depends on campaign schedule and warmup stage).

  **Check for both test recipients:**

  | Check | Expected |
  |-------|----------|
  | Email received in inbox (not spam) | Yes — check inbox AND spam/junk |
  | From address | ellie@shopjaydees.ca or ellie@shopjaydees.net |
  | Subject line | Matches the approved Email Touch 1 Subject |
  | Body content | Matches approved Email Touch 1 body |
  | Formatting | Clean, no broken HTML, proper line breaks |
  | Unsubscribe link | Present and functional at bottom of email |
  | Sending domain | Matches what ClickUp shows for that lead |

  **If email lands in spam:** Check SPF/DKIM/DMARC alignment. Warmup may need more time.

- [ ] **Step 6: Test reply tracking**

  Have Cody reply to the test email from cody@sixohquad.com.

  **Expected chain of events:**
  1. Instantly detects the reply
  2. Instantly pauses remaining touches for this lead
  3. Zapier Zap 3 fires: Replies incremented to 1, Last Reply Date set
  4. ClickUp Automation 4 fires: Status → "Responded - Owner Follow-up", Jenn notified
  5. Lead appears in Jenn's "My Follow-ups" view

  **Verification:** Check the ClickUp task within 5-15 minutes:

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/task/${TASK_ID}" \
    | jq '{status: .status.status, replies: (.custom_fields[] | select(.name == "Replies") | .value)}'
  # Expected: status = "Responded - Owner Follow-up", replies = 1
  ```

- [ ] **Step 7: Test unsubscribe flow**

  Click the unsubscribe link in the email sent to jenn@shopjaydees.com.

  **Expected chain of events:**
  1. Instantly processes the unsubscribe
  2. Zapier Zap 5 fires: Unsubscribed checkbox checked
  3. ClickUp Automation 3 fires: Status → "Unsubscribed"

  **Verification:** Check the ClickUp task:

  ```bash
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/task/${TASK_ID}" \
    | jq '{status: .status.status, unsubscribed: (.custom_fields[] | select(.name == "Unsubscribed") | .value)}'
  # Expected: status = "Unsubscribed", unsubscribed = true
  ```

- [ ] **Step 8: Verify Zapier task usage**

  Check Zapier's task history to see how many tasks were consumed:

  1. Go to Zapier > Settings > Usage
  2. Note tasks used for these tests
  3. Estimate monthly usage: test tasks + projected real volume

  **Expected:** Each test lead generates ~4-6 Zapier tasks (send events + open + possible reply). Total for testing: ~15-25 tasks. Well within the 750/month Starter limit.

---

### Task 25: Post-Testing Cleanup and Go-Live Preparation

- [ ] **Step 1: Clean up all test data**

  Delete all tasks with "TEST" or "LIVE-TEST" in the name:

  ```bash
  # List test tasks
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?include_closed=true" \
    | jq '.tasks[] | select(.name | startswith("TEST") or startswith("LIVE-TEST")) | {name, id}'

  # Delete each test task
  for TASK_ID in <list_of_test_task_ids>; do
    curl -s -X DELETE \
      -H "Authorization: ${CLICKUP_API_TOKEN}" \
      "https://api.clickup.com/api/v2/task/${TASK_ID}"
  done

  # Also clean up test Prospecting Requests
  curl -s -H "Authorization: ${CLICKUP_API_TOKEN}" \
    "https://api.clickup.com/api/v2/list/${CLICKUP_PROSPECTING_LIST_ID}/task?include_closed=true" \
    | jq '.tasks[] | {name, id}'
  # Delete test requests
  ```

- [ ] **Step 2: Remove test leads from Instantly**

  1. In Instantly, go to the campaign used for testing
  2. Remove the test email addresses (cody@sixohquad.com, jenn@shopjaydees.com)
  3. Or delete the test campaign entirely if it was only used for testing

- [ ] **Step 3: Verify Cloud Scheduler jobs are paused until go-live**

  During the remaining warmup period, pause all scheduler jobs to prevent accidental runs:

  ```bash
  gcloud scheduler jobs pause discover-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs pause personalize-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs pause send-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs pause dormancy-weekly --location=us-west1 --project=shopjaydees-leadgen
  ```

  **Resume when ready to go live:**

  ```bash
  gcloud scheduler jobs resume discover-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs resume personalize-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs resume send-daily --location=us-west1 --project=shopjaydees-leadgen
  gcloud scheduler jobs resume dormancy-weekly --location=us-west1 --project=shopjaydees-leadgen
  ```

- [ ] **Step 4: Confirm all environment variables are production values**

  Verify `pipeline/.env` and the deployed Cloud Function env vars contain:
  - Real API keys (not test/sandbox keys)
  - Real ClickUp list and field IDs (from the production workspace setup)
  - `DRY_RUN=false`
  - `ALERT_EMAIL=cody@sixohquad.com`

- [ ] **Step 5: Document go-live readiness checklist**

  Before enabling the scheduler jobs for real operations, confirm:

  | Check | Status |
  |-------|--------|
  | Domain warmup has been active for 2+ weeks | |
  | All 9 ClickUp automations tested and working | |
  | All 6 Zapier zaps tested and ON | |
  | All 4 Cloud Functions deployed and ACTIVE | |
  | All 4 Cloud Scheduler jobs created (currently paused) | |
  | Jenn is comfortable with the Approval Queue workflow | |
  | Social proof statements verified by Jenn (review resolution #13) | |
  | .env has all 66 production environment variables | |
  | GCP monitoring alert is active | |
  | Test data cleaned from ClickUp and Instantly | |

  When all checks pass, resume the scheduler jobs and have Jenn create her first real Prospecting Requests.

---

## Summary

| Part | Tasks | What Gets Done |
|------|-------|---------------|
| A | Tasks 1-7 | ClickUp workspace: Space, Folder, 2 Lists, 53+8 custom fields, 8 views, 1 dashboard, 9 automations |
| B | Tasks 8-9 | Instantly: 2 sending accounts connected, warmup started, campaign template with 3-step sequence |
| C | Tasks 10-16 | Zapier: 6 zaps connecting Instantly events to ClickUp field updates |
| D | Tasks 17-21 | GCP: project, service account, 4 Cloud Functions deployed, 4 Cloud Scheduler jobs, monitoring alert |
| E | Tasks 22-25 | Testing: component validation, full pipeline integration test, live email dry-run, cleanup, go-live readiness |
