---
title: Transition to Maintenance & Reporting Phase
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-15
updated: 2026-08-04
tags: [engagement, billing, phase, maintenance, reporting]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
---

# Transition to Maintenance & Reporting Phase

**Decision (2026-07-15, per Cody):** with the system live, the ShopJayDees engagement moves from the build/delivery phase into an ongoing **maintenance and reporting** relationship, billed monthly.

## What changed

- **Build deliverables are complete.** The [lead generation system](../systems/lead-generation-system.md) is live: the first outreach was sent on 2026-07-15 and the first real prospecting batch was queued for 2026-07-16.
- **The final project invoice has been sent**, with an agreed discount Cody committed to Jenn on the go-live call. (Exact discount amount not captured in the source.)
- **The relationship is now ongoing, billed monthly.**

## Billing mechanism (confirmed)

The monthly billing is the service agreement's existing **$300 CAD/month management fee** (six-month minimum, plus GST). Confirmed by Cody on 2026-07-15. This is not a new or separate arrangement — the contracted management fee now begins post-delivery. See [service agreement terms](../topics/service-agreement-terms.md) and [engagement goals](../topics/engagement-goals.md).

## What the phase covers (so far)

- Cody monitors the running system roughly once a day or every couple of days, watches domain health, and adjusts targeting, templates, and configuration as needed.
- Ongoing fixes and tuning (the go-live session's queued items: campaign naming, open-rate tracking, CASL unsubscribe verification, anti-AI-writing guardrails, verify-email endpoint if bounces rise).

## Monthly report deliverable — defined (2026-07-15)

The monthly report is now designed and approved: a value-first, one-to-two-page branded PDF emailed to Jenn as a Gmail draft (Cody sends), delivered at the start of each month for the prior month. It reports prospects reached, reply rate, warm leads handed off, and **AI-sourced revenue attribution** via the CRM `Lead Source = AI Outreach` tag and `Est Order Value`, plus Cody's commentary on what worked and what's next. Full definition, data sources, and caveats: `leadgeneration/docs/superpowers/specs/2026-07-15-monthly-report-design.md`.

**Built and delivered (2026-08-04).** The full report is live: metrics-pull (`src/report.ts`), branded PDF (`leadgeneration/reports/2026-07-jaydees-outreach-report.{html,pdf}`), and Gmail draft. The first report (July 2026) was drafted and sent to Jenn. The report now counts warm handoffs as genuinely-interested-only — see [Reply interest classification](reply-interest-classification.md). July result: 77 businesses reached, 2 replies (both declined), 0 warm / $0 pipeline.

## Related pages

- [Overview](../overview.md)
- [Engagement goals](../topics/engagement-goals.md)
- [Service agreement terms](../topics/service-agreement-terms.md)
- [Lead generation system](../systems/lead-generation-system.md)
