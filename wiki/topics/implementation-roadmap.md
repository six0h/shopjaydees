---
title: Implementation Roadmap
type: wiki-page
category: topic
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [roadmap, build, onboarding]
sources:
  - file: ingested/documents/implementation-roadmap.html
    ingested: 2026-06-11
---

# Implementation Roadmap

The week-by-week build plan presented to the client. The clock starts when the client's accounts are set up.

## Status at presentation time

- Design complete: pipeline architecture, targeting strategy, and personalization framework mapped out.
- Pricing agreed: $3,000 setup plus $300 per month, third-party tools 32 to 129 US dollars per month paid by the client.
- Next step: client account setup to unlock the build.

## Build weeks

1. **Week one, Foundation.** ClickUp workspace configured with the full lead pipeline, discovery engine connected to Google Maps, first batch of raw prospects from Surrey, Langley, and Abbotsford.
2. **Weeks one to two, Intelligence.** Enrichment engine researches each prospect's website and social presence, Hunter.io finds decision-maker names and emails, every lead scored one to five on fit with only scores of three or higher moving forward.
3. **Weeks two to three, Outreach Engine.** AI drafts a three-email sequence per prospect, LinkedIn connection notes generated, cold email tool connected for delivery and domain warmup. The approval queue goes live.

## Client to-do list before the build

- ClickUp: sign up and invite cody@sixohquad.com.
- Instantly: create account and invite cody@sixohquad.com.
- Hunter.io: create account and invite cody@sixohquad.com.
- Firecrawl: create account and share the API key.
- Google Cloud: create a project and invite cody@sixohquad.com.
- Set up a dedicated cold outreach email address. The roadmap's example is jay@shopjaydees.com, which sits on the primary domain; see the flag below.

## Client time during the build

Week one: nothing. Week two: review a few test messages, about ten minutes, async is fine, plus a quick check-in on messaging tone and targeting. Week three: start the daily approval queue at fifteen to twenty minutes per day.

## Flags

- The roadmap promises a running pipeline within three weeks; the service agreement commits to four to six weeks from credential handover. The agreement is the binding number.
- The example outreach address jay@shopjaydees.com is on the primary business domain, which conflicts with the [separate cold outreach domains](../decisions/separate-cold-outreach-domains.md) decision in the agreement. The agreement requires distinct domains.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Start small then scale](../decisions/start-small-then-scale.md)
- [Third-party stack](third-party-stack.md)
- [Jenn Milne](../people/jenn-milne.md)
