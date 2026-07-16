---
title: ShopJayDees Overview
type: wiki-page
category: overview
status: active
owner: cody
created: 2026-06-11
updated: 2026-07-16
tags: [wiki, overview]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/lead-gen-pitch.html
    ingested: 2026-06-11
  - file: ingested/documents/implementation-roadmap.html
    ingested: 2026-06-11
  - file: ingested/documents/messaging-framework.html
    ingested: 2026-06-11
  - file: ingested/documents/account-setup-guide.md
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
  - file: "ingested/documents/service-agreement - 5_28_26, 10_01 AM.pdf"
    ingested: 2026-06-11
---

# ShopJayDees Overview

ShopJayDees is a SixOhQuad client: an online custom clothing company serving businesses, schools, and teams in BC's Lower Mainland and Fraser Valley. Legal name on the service agreement: Jaydees Apparel. **As of 2026-07-16 the client rebranded to its legal name "Jaydees Apparel"** and the outreach agent now communicates as Jaydees Apparel (formerly the brand name "ShopJaydees"); see [Rebrand to Jaydees Apparel](decisions/rebrand-to-jaydees-apparel.md). Sending domains (`shopjaydees.ca`/`.net`) and the website (`shopjaydees.com`) are unchanged. Primary contact: [Jenn Milne](people/jenn-milne.md), referred to as the owner in the design spec. Cody owns the relationship. The business sells custom apparel (work wear, uniforms, spirit wear, jerseys) and runs a community giving program called [Wear It Forward](topics/wear-it-forward.md), the core differentiator in all outreach messaging ([messaging framework](systems/outreach-messaging-framework.md)). Per that framework's credibility claims, the client works with over 100 schools in the Lower Mainland and with businesses from 12 to over 250 employees.

## Why the engagement exists

Before this engagement all new business came from referrals. No outbound motion existed: no structured prospect discovery, no outreach, no follow-up. The pitch framed the problem as "great product, no pipeline".

## The engagement

SixOhQuad is designing, building, and managing an automated [lead generation system](systems/lead-generation-system.md) for the client: prospect discovery, enrichment, AI-personalized cold email and LinkedIn outreach, and warm lead handoff, all integrated with ClickUp and deployed on Google Cloud. The client targets businesses, schools, and sports teams across six Fraser Valley and Lower Mainland municipalities ([target market](topics/target-market.md)).

Commercials: $3,000 CAD setup fee (split half on signing, half on delivery) plus $300 CAD per month management with a six-month minimum, both plus GST. The client pays for the third-party tool subscriptions ([third-party stack](topics/third-party-stack.md): ClickUp, Instantly, Hunter.io, Google Cloud with the Gemini API; no Firecrawl per the resolved discovery stack). Full terms: [service agreement terms](topics/service-agreement-terms.md).

## How it runs

The System automates the pipeline; the client stays in the loop through a [daily approval workflow](systems/daily-approval-workflow.md) in ClickUp (about fifteen to twenty minutes per day) and personally handles warm conversations. Cold outreach runs from [separate domains](decisions/separate-cold-outreach-domains.md) to protect the primary business domain.

Pitched targets ([engagement goals](topics/engagement-goals.md)): five to fifteen conversations per month and two to three closed deals within ninety days, with messaging shifting through the year per the [seasonal playbook](topics/seasonal-playbook.md).

## Resolved conflicts

The six ingested documents disagreed on two material points; Cody resolved both on 2026-06-11. Discovery: the design spec's stack is current, Hunter.io Discover API only (no Firecrawl, no Sales Navigator, no cleanlists.ai). Cold outreach address: the agreement's rule stands, separate domains only, never shopjaydees.com; the roadmap and setup guide examples are superseded. Details on the [third-party stack](topics/third-party-stack.md) and [separate cold outreach domains](decisions/separate-cold-outreach-domains.md) pages.

## Status — LIVE (2026-07-15)

The system is live. On the 2026-07-15 walkthrough call with Jenn, Cody demonstrated the full pipeline end to end and sent the first real outreach: two test leads (Monark and Blue Pine Enterprises) into the Instantly campaign `ShopJaydees - Business - 2026-07`, from the `ellie@shopjaydees.ca`/`.net` mailboxes (warmup at 100). Both leads' ClickUp tasks moved to Outreach Active. The first real prospecting batch (youth sports leagues, max 20) was queued for the next morning's 5:00 a.m. pickup (2026-07-16). Operational detail is on the [lead generation system](systems/lead-generation-system.md) page.

**Project delivered; relationship now in the ongoing maintenance & reporting phase.** Per Cody (2026-07-15): the build deliverables are complete and the final project invoice has been sent (with an agreed discount Cody committed to Jenn on the call). The relationship moves to ongoing monthly maintenance and reporting, billed via the service agreement's **$300 CAD/month management fee** (six-month minimum; confirmed by Cody). Cody monitors the system roughly once a day or every couple of days. See [Transition to maintenance & reporting phase](decisions/maintenance-and-reporting-phase.md). **Still to define** (tracked in the OS backlog): the monthly report deliverable — what previous-month analytics and information SixOhQuad delivers each month, and its cadence and format. The exact final-invoice discount amount was not captured.

Wiki seeded 2026-06-11 from engagement documents. The signed service agreement is on file: executed 2026-05-28 by Jennifer Milne and Cody Halovich via Google eSignature, signature cryptographically valid, terms identical to the template. See [service agreement terms](topics/service-agreement-terms.md).
