---
title: ShopJayDees Overview
type: wiki-page
category: overview
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [wiki, overview]
sources:
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

ShopJayDees is a SixOhQuad client: an online custom clothing company serving businesses, schools, and teams in BC's Lower Mainland and Fraser Valley. Legal name on the service agreement: Jaydees Apparel; the pitch uses the brand name ShopJaydees. Primary contact: [Jenn Milne](people/jenn-milne.md), referred to as the owner in the design spec. Cody owns the relationship. The business sells custom apparel (work wear, uniforms, spirit wear, jerseys) and runs a community giving program called [Wear It Forward](topics/wear-it-forward.md), the core differentiator in all outreach messaging ([messaging framework](systems/outreach-messaging-framework.md)). Per that framework's credibility claims, the client works with over 100 schools in the Lower Mainland and with businesses from 12 to over 250 employees.

## Why the engagement exists

Before this engagement all new business came from referrals. No outbound motion existed: no structured prospect discovery, no outreach, no follow-up. The pitch framed the problem as "great product, no pipeline".

## The engagement

SixOhQuad is designing, building, and managing an automated [lead generation system](systems/lead-generation-system.md) for the client: prospect discovery, enrichment, AI-personalized cold email and LinkedIn outreach, and warm lead handoff, all integrated with ClickUp and deployed on Google Cloud. The client targets businesses, schools, and sports teams across six Fraser Valley and Lower Mainland municipalities ([target market](topics/target-market.md)).

Commercials: $3,000 CAD setup fee (split half on signing, half on delivery) plus $300 CAD per month management with a six-month minimum, both plus GST. The client pays for the third-party tool subscriptions ([third-party stack](topics/third-party-stack.md): ClickUp, Instantly, Hunter.io, Firecrawl, Google Cloud with the Gemini API). Full terms: [service agreement terms](topics/service-agreement-terms.md).

## How it runs

The System automates the pipeline; the client stays in the loop through a [daily approval workflow](systems/daily-approval-workflow.md) in ClickUp (about fifteen to twenty minutes per day) and personally handles warm conversations. Cold outreach runs from [separate domains](decisions/separate-cold-outreach-domains.md) to protect the primary business domain.

Pitched targets ([engagement goals](topics/engagement-goals.md)): five to fifteen conversations per month and two to three closed deals within ninety days, with messaging shifting through the year per the [seasonal playbook](topics/seasonal-playbook.md).

## Resolved conflicts

The six ingested documents disagreed on two material points; Cody resolved both on 2026-06-11. Discovery: the design spec's stack is current, Hunter.io Discover API only (no Firecrawl, no Sales Navigator, no cleanlists.ai). Cold outreach address: the agreement's rule stands, separate domains only, never shopjaydees.com; the roadmap and setup guide examples are superseded. Details on the [third-party stack](topics/third-party-stack.md) and [separate cold outreach domains](decisions/separate-cold-outreach-domains.md) pages.

## Status

As of the implementation roadmap: design complete, pricing agreed, and the engagement is waiting on the client's account setup, which starts the build clock. The build follows the [implementation roadmap](topics/implementation-roadmap.md) (Foundation, Intelligence, Outreach Engine) with a [start small then scale](decisions/start-small-then-scale.md) ramp.

Wiki seeded 2026-06-11 from engagement documents. The signed service agreement is on file: executed 2026-05-28 by Jennifer Milne and Cody Halovich via Google eSignature, signature cryptographically valid, terms identical to the template. See [service agreement terms](topics/service-agreement-terms.md).
