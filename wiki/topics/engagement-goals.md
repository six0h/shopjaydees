---
title: Engagement Goals
type: wiki-page
category: topic
status: active
owner: cody
created: 2026-06-11
updated: 2026-07-15
tags: [goals, metrics, reviews]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
  - file: ingested/documents/lead-gen-pitch.html
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Engagement Goals

Success criteria pitched to the client. These are targets, not guarantees; the service agreement explicitly disclaims guaranteed results.

## Ninety-day goals

- Five to fifteen conversations per month.
- Two to three closed deals.
- Approval rate of 80 percent or higher on drafted outreach.
- Client daily time commitment held to about fifteen minutes.
- Qualified conversations flowing within ninety days of starting.

The design spec adds to the ninety-day definition: the pipeline runs reliably with minimal manual intervention beyond Prospecting Requests and approvals, and there is clear data on which segments and messaging angles work best.

## Six-month outlook

Optimized targeting narrowed to the best-converting segments, volume scaled to the owner's capacity for warm leads, repeatable seasonal playbooks established, predictable monthly revenue contribution, and a system stable enough to need minimal SixOhQuad intervention week to week.

## Pipeline metrics and targets (per the design spec)

Tracked weekly: 50 to 150 companies found with verified contacts per request, 20 to 90 drafts generated per week, approval rate of 80 percent or higher, 20 to 80 emails sent per week, open rate of 40 percent or higher, reply rate of 5 to 15 percent, and 30 to 50 percent of replies becoming quotes or conversations. LinkedIn, tracked monthly: 20 to 40 connection requests per week, 25 to 40 percent acceptance, five to fifteen direct message conversations per month.

## Health signals (when to adjust)

- Open rate below 30 percent: subject lines or deliverability problem; test new subject lines, check warmup.
- Reply rate below 3 percent: messaging not landing; revisit personalization and value props.
- Approval rate below 60 percent: drafts do not match the owner's voice; refine templates, review rejection patterns.
- Enrichment rate below 40 percent: discovery filters need adjusting.
- Owner spending thirty minutes or more per day on reviews: too much volume or too many edits needed.
- Bounce rate above 5 percent: verify all addresses before sending, raise the confidence threshold.
- LinkedIn connection rate below 15 percent: revise the connection request copy.

## Maintenance & reporting phase (from 2026-07-15)

Per Cody (2026-07-15, at go-live): the build is delivered and the engagement moves into an **ongoing maintenance and reporting phase, billed monthly** via the service agreement's **$300 CAD/month management fee** (six-month minimum; confirmed by Cody). See [Transition to maintenance & reporting phase](../decisions/maintenance-and-reporting-phase.md). In practice so far this means Cody monitors the system roughly once a day or every couple of days, watches domain health, and adjusts as needed.

**Still to define (future session, tracked in the OS backlog):** the monthly report deliverable — what previous-month analytics and information SixOhQuad delivers Jenn at the start of each month, and its cadence and format. The "monthly reviews" below are the pitched intent and the starting point for that definition.

## Monthly reviews

SixOhQuad and the client meet monthly to review pipeline numbers end to end, which segments convert best, which messaging angles get replies, targeting and volume adjustments, and upcoming seasonal shifts.

## Responsibility split (per the pitch)

- **SixOhQuad:** builds the agents and pipeline end to end, monitors performance, fixes issues, adjusts targeting, templates, and scoring, runs monthly reviews, plans seasonal shifts.
- **ShopJaydees:** reviews and approves drafts in ClickUp daily, sends LinkedIn messages from pre-written copy, follows up with warm leads, closes deals. Fifteen to twenty minutes per day.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
- [Seasonal playbook](seasonal-playbook.md)
- [Service agreement terms](service-agreement-terms.md)
