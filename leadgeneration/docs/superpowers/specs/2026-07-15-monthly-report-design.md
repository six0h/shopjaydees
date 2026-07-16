# Monthly Client Report — Design Spec

**Date:** 2026-07-15
**Status:** Approved (design). Not yet implemented.
**Context:** The ShopJayDees engagement entered its ongoing maintenance & reporting phase at go-live (see `clients/shopjaydees/wiki/decisions/maintenance-and-reporting-phase.md`). This spec defines the monthly report SixOhQuad delivers to Jenn — the "reporting" half of that phase. Billing is the contracted $300 CAD/month management fee.

## Purpose & audience

- **Reader:** Jenn Milne — owner of Jaydees Apparel. Busy, visual, non-technical, casual. She wants to know the system is working and worth it.
- **Primary job of the report: prove value.** Lead with the ROI/pipeline story; keep operational detail secondary and in plain language. No jargon, no dashboards-for-their-own-sake.
- **Secondary job:** surface anything she should act on (keep approving; keep the CRM `Lead Source` field tagged).

## Cadence & delivery

- **Cadence:** delivered at the start of each month, covering the prior calendar month. First report covers July 2026, delivered early August 2026.
- **Format:** a branded PDF (themed to ShopJayDees), emailed to Jenn (`hello@shopjaydees.com`).
- **Delivery mechanism:** produced as a **Gmail draft that Cody reviews and sends** — never auto-sent (drafts-only guardrail). Mirrors the existing `draft-readiness-report` pattern.

## Report contents

One to two pages, in this order.

### 1. Headline (one plain-language line)
> "In <month>, your outreach system reached **N new prospects** and put **M warm, interested leads** in front of you."

### 2. The month at a glance (hero numbers)
Five numbers, each with a one-line plain-language label:
1. **Prospects reached** — new businesses emailed.
2. **Reply rate** — shown against a benchmark so it means something (pitched target: open 40%+, reply 5–15%; see `wiki/topics/engagement-goals.md`).
3. **Warm leads handed to you** — prospects that replied with interest.
4. **AI-sourced opportunities opened** — deals in the CRM attributed to AI Outreach.
5. **Estimated pipeline value (CAD)** — sum of those opportunities' estimated order value.

### 3. Pipeline built (top-of-funnel → warm)
The funnel in plain terms: reached → opened → replied → warm handoff. Framing: business development that happened without Jenn lifting a finger.

### 4. Revenue attribution — AI-sourced
Powered by the CRM `Lead Source = AI Outreach` tag:
- Opportunities opened this month, broken out by stage (new inquiry / quoting / quote sent / moved to production).
- Estimated value of that pipeline.
- Any AI-sourced opportunities that reached production/won this month, with realized (estimated) value.
- Early-months honesty note: sales cycles lag outreach, so realized revenue may be low or zero at first — expected, not a failure.

### 5. What's working + what we tuned
2–3 bullets of **Cody's commentary**: best-performing segment/message, and any changes made (targeting, copy, sending domains, config).

### 6. Next month
Seasonal focus (see `wiki/topics/seasonal-playbook.md`) and anything Jenn should do (keep approving; tag AI-sourced deals as `AI Outreach`).

### 7. Footer
Period covered + a one-line data-hygiene nudge (tag `Lead Source = AI Outreach`).

## Data model & sources

| Metric | Source | Definition |
| --- | --- | --- |
| Prospects reached | ClickUp Prospects list `901417162427` | Prospects whose `Outreach Started Date` falls in the month (equivalently, moved to `Outreach Active`). |
| Emails sent / opens / replies | Instantly (campaign analytics + `/emails`) | Sends, opens, replies for the ShopJaydees campaign(s) in the month. Open rate requires open-tracking enabled (see Dependencies). |
| Warm leads handed off | ClickUp Prospects list | Prospects reaching `Responded - Follow-up` in the month. |
| AI-sourced opportunities | ClickUp Leads & Opportunities list `901416652272` | Tasks created in the month with `Lead Source = AI Outreach`. Group by status. |
| Estimated pipeline value | Leads & Opportunities `Est Order Value` (currency, CAD) | Sum of `Est Order Value` across those opportunities. |
| Reached production / won | Leads & Opportunities status `move to production`, and/or linked Active Order `901416652286` at `delivered`/`complete` with `Payment Received` | AI-sourced opportunities that converted in the month; realized value = their `Est Order Value`. |
| Targeting context (optional) | ClickUp Prospecting Requests `901417162428` | Segments/cities requested in the month. |

**The CRM data model (verified 2026-07-15):** Prospect (Lead Generation space) → on `Responded - Follow-up` the handoff agent creates a **Contact** (CRM & Sales) → a **Lead/Opportunity** is opened (carries `Lead Source` and `Est Order Value`) → `move to production` → **Active Order** (Production) → `delivered`/`complete`. Attribution anchors on the opportunity's `Lead Source = AI Outreach`, **not** name-matching.

## Dependencies & caveats (must be stated honestly in the report or handled before launch)

1. **`Lead Source` hygiene.** Attribution is only as good as the manual `Lead Source` field. Jenn/Tamara must tag AI-sourced opportunities `AI Outreach`. Currently ~5 of 7 opportunities have the field set; establish it as a standing habit. Without it, an AI-sourced deal is invisible to the report (the Contact created by the handoff agent carries no back-reference to the originating Prospect).
2. **Estimated, not invoiced, revenue.** `Est Order Value` is an estimate, and Active Orders has no clean actual-order-total currency field (only `WIF Total`, the donation). Realized value is reported as the estimated value of won opportunities — label it "attributed pipeline / estimated value," not accounting-grade revenue.
3. **Open-rate tracking.** Was found disabled on the Instantly campaign at go-live; must be enabled for the open metric to populate (already a queued go-live fix).
4. **Sales lag.** Early reports will show mostly top-of-funnel value; realized revenue trails by weeks/months. Frame this up front.

## Production model

Semi-automated:
1. A **metrics-pull step** (a script, extending the existing pipeline tooling) gathers the table above into a structured JSON summary for the month — zero external writes, read-only against Instantly + ClickUp.
2. The **narrative + sections 5–6** are written around the summary (Cody's commentary), and the whole rendered to a **branded PDF**.
3. The PDF is attached to a **Gmail draft** addressed to Jenn; Cody reviews and sends.

## Open items (for the implementation plan / future)

- Exact benchmark figures to cite for reply/open rates.
- Whether the metrics pull is a new module or extends the existing `pipeline/` code; whether it runs on a schedule (dashboard/cron) or on demand.
- Whether narrative generation is Claude-assisted or Cody-authored.
- The `Lead Source` tagging habit with Tamara.

## Out of scope

- Accounting-grade revenue reconciliation (invoiced actuals).
- Any auto-send. The report is always a draft for Cody to send.
- Changes to Jenn's CRM structure beyond the `Lead Source` tagging habit.
