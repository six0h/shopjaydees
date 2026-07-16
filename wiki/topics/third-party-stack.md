---
title: Third-Party Stack
type: wiki-page
category: topic
status: active
owner: cody
created: 2026-06-11
updated: 2026-07-15
tags: [tools, subscriptions, stack]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/lead-gen-pitch.html
    ingested: 2026-06-11
  - file: ingested/documents/account-setup-guide.md
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Third-Party Stack

The paid third-party services the [lead generation system](../systems/lead-generation-system.md) depends on. Per the service agreement the client creates, maintains, and pays for all of these accounts, and provides SixOhQuad with credentials before the build begins.

**Confirmed at go-live (2026-07-15).** Jenn upgraded Hunter.io from the free tier (50 credits) to the **Starter plan, paid annually**, on the walkthrough call. Rationale: free was insufficient; Starter (~24,000 credits/yr, ~12,000 email+phone lookups at ~2 credits each) is ample for realistic volume, while Growth's 120,000 credits would be overkill. Starter retains the API access the Discovery Agent needs. See [Hunter.io Starter plan](../decisions/hunter-starter-plan.md). The live sending stack is confirmed as **ClickUp + Hunter.io + Instantly + Google Cloud (Gemini)** — no Firecrawl.

**Resolution (Cody, 2026-06-11).** The current discovery stack is the design spec's version: Hunter.io Discover API only, no Firecrawl, no Sales Navigator, no cleanlists.ai. The tables below preserve the superseded versions for provenance; rely on the [2026-05-20 design spec section](#stack-per-the-2026-05-20-design-spec).

| Service | Role in the System | Estimated monthly cost (USD, per pitch) |
| --- | --- | --- |
| ClickUp | Lead management, approval workflows, reporting | not broken out in the pitch table |
| Instantly or Smartlead | Cold email delivery and domain warmup | 30 to 50 dollars |
| Hunter.io | Email discovery and verification | 0 to 49 dollars |
| Firecrawl | Web and Google Maps scraping for discovery and enrichment | 0 to 20 dollars |
| Gemini Flash API | AI for personalization and parsing | 2 to 5 dollars |
| Google Cloud Platform | Agent hosting and scheduling | 0 to 5 dollars |

Estimated combined cost: 32 to 129 US dollars per month depending on usage volume and plan selections. Most tools have free tiers to start, and costs scale with volume. SixOhQuad is not responsible for third-party price changes, outages, or terms-of-service changes.

The service agreement names Instantly (or equivalent) as the cold email platform; the pitch lists Instantly or Smartlead. The agreement bundles AI processing (Gemini API) under Google Cloud Platform; the pitch costs Gemini Flash API and Google Cloud hosting separately.

## Revised stack per the account setup guide

The account setup guide sent to the client lists a different stack than the agreement and pitch:

| Service | Role per the guide | Cost per the guide (USD) |
| --- | --- | --- |
| ClickUp | Central hub for leads, drafts, daily approvals | Free plan to start |
| LinkedIn Sales Navigator (Core) | Client searches for target companies and exports company lists that feed the pipeline | About 99 dollars per month |
| cleanlists.ai | Turns exported company lists into decision-maker names, titles, verified emails, LinkedIn profiles | Varies by volume |
| Instantly (Growth plan) | Cold email sending, warmup, open and reply tracking | About 30 dollars per month |
| Google Cloud | Hosts the agents and the Gemini AI that writes messages; Cody creates the project, client adds billing | Typically 2 to 10 dollars per month |

**Superseded.** The guide drops Hunter.io and Firecrawl (named in the agreement and pitch) in favor of LinkedIn Sales Navigator plus cleanlists.ai, and shifts discovery from automated Google Maps scraping to client-driven Sales Navigator exports with Cody-provided search filters. Cody resolved on 2026-06-11 that this version is not current; the design spec's Hunter.io Discover stack is.

## Stack per the 2026-05-20 design spec

A third version, between the other two:

| Component | Tool | Estimated monthly cost (USD) |
| --- | --- | --- |
| Discovery plus enrichment | Hunter.io Discover API (Starter plan), via the Discovery Agent only | 34 dollars |
| Agent LLM | Gemini 2.5 Flash | 2 to 5 dollars |
| Agent hosting and scheduling | Google Cloud Functions plus Cloud Scheduler | 0 to 5 dollars |
| CRM and approval queue | ClickUp | existing, already planned |
| Email sending | Instantly or Smartlead | 30 to 50 dollars |
| LinkedIn | Manual by owner, no tool | none |

Spec total: roughly 66 to 95 dollars per month against a stated budget constraint of under 100 dollars per month. The spec drops Firecrawl entirely (Hunter.io covers discovery, "eliminating the need for separate discovery and enrichment tools") and does not mention Sales Navigator or cleanlists.ai.

**Summary of the three versions.** Agreement and pitch: Firecrawl plus Hunter.io. Design spec (2026-05-20): Hunter.io only. Setup guide (undated): Sales Navigator plus cleanlists.ai, no Hunter.io. Cody confirmed on 2026-06-11 that the design spec version is current: Hunter.io Discover API only.

## Account access model (per the setup guide)

- ClickUp: client workspace ("ShopJaydees"), Cody invited as Admin.
- Instantly: Cody invited as a team member.
- Google Cloud: Cody creates the project and handles configuration; the client accepts an invite and links a billing method.
- Sales Navigator: no invite; the client uses it from their own LinkedIn account with search strategies and filter templates from Cody.
- The client tells Cody the dedicated outreach email address once created; Cody connects and warms it in Instantly.

## Related pages

- [Service agreement terms](service-agreement-terms.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
