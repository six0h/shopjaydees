---
title: Lead Generation System
type: wiki-page
category: system
status: active
owner: cody
created: 2026-06-11
updated: 2026-07-15
tags: [lead-generation, automation, engagement-scope]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/lead-gen-pitch.html
    ingested: 2026-06-11
  - file: ingested/documents/implementation-roadmap.html
    ingested: 2026-06-11
  - file: ingested/documents/account-setup-guide.md
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Lead Generation System

The System SixOhQuad is contracted to design, build, deploy, and manage for Jaydees Apparel. It is an automated outbound lead generation pipeline deployed on Google Cloud and integrated with ClickUp.

## Pipeline functions (per the service agreement)

1. **Prospect discovery.** Automated scraping of Google Maps and other sources to find businesses, schools, and sports teams across configured geographies in BC's Lower Mainland and Fraser Valley.
2. **Lead enrichment.** Website scraping, decision-maker identification, email discovery, and lead quality scoring.
3. **Personalized outreach.** AI-generated multi-touch email sequences and LinkedIn connection request copy, using segment-specific templates.
4. **Delivery and tracking.** Sending approved emails through a cold email platform, tracking opens, replies, and engagement, and flagging warm leads.
5. **Warm lead reply handling.** A scheduled polling agent checks the Instantly API for replies — the client's Instantly Growth plan has no webhooks and no unified inbox (Unibox), both Hypergrowth-only. On reply detection the System sets the lead's ClickUp status to Responded - Owner Follow-up, assigns it to Jenn, and comments. The client reads and replies directly from the standalone ellie@ Gmail inbox (`.ca`/`.net`) and moves established conversations to the primary business email. See [Reply detection via API polling](../decisions/reply-detection-via-api-polling.md).

## Expected volumes and cadence (per the pitch)

- Discovery scrapes Google Maps weekly: 50 to 150 raw prospects per week, deduplicated against existing contacts and auto-categorized by segment.
- Enrichment runs daily per prospect: decision-maker name and email, company size, branding quality, recent news and social activity, and a fit score from one to five.
- Outreach: 20 to 80 sends per week, targeting five to fifteen conversations per month.
- The sequence is three touches over nine days: day zero personalized email plus LinkedIn request with a soft call to action, day four follow-up with a relevant example from a similar client, day nine lighter final touch. No response triggers a ninety-day cool-off.
- Only leads scoring three or higher on the one-to-five fit scale move forward to outreach; lower scores are parked. Full rubric: [Lead scoring](lead-scoring.md).
- ClickUp statuses per the design spec: Enriched or Parked after discovery, then Ready for Review, Approved, Outreach Active, and Responded - Owner Follow-up. The roadmap deck shows a simplified version (New, Enriched and Scored, Ready for Review, Outreach Active, Responded).

## Live operation (observed on the 2026-07-15 walkthrough)

How the running system actually behaves, confirmed live with Jenn:

- **Daily clock.** Prospecting-request tickets are picked up at **5:00 a.m.**; by roughly **6:00 a.m.** leads are enriched, researched, scored, and drafted. Approved prospects **send at 9:00 a.m.** Jenn can still edit an approved email up until the 9:00 a.m. send.
- **Prospecting requests.** In ClickUp, Jenn adds a task, picks a category (categories come from Hunter.io — e.g. trades, youth sports leagues, post-secondary clubs), sets max results, and sets a target city. Currently **one city per request** (Cody is considering allowing several). She can also set an optional **Company Size** band (Micro 1-10, Small 11-50, or 1-50) to deliberately target smaller companies on a given request; left blank it uses the default size band. See [Per-ticket company size targeting](../decisions/per-ticket-company-size-targeting.md).
- **Status flow (live):** Enriched → Personalized → Ready for Review → Approved → Outreach Active → Responded - Follow-up, plus **Parked** (full series sent, no response) and **Lost** (responded, not interested). Nothing sends unless Jenn moves a lead to **Approved**.
- **Sequence timing (confirmed live, does NOT blast same-day):** touch 1, then +4 days, then +5 days (Day 0 / 4 / 9).
- **Sending domains rotate** to protect domain health: the two `ellie@shopjaydees.ca` / `.net` mailboxes are both assigned to the campaign, and Instantly keeps each lead's whole sequence on its first-touch mailbox. If one domain's health drops, the account list is narrowed via config to send from the healthy one only. See [Standalone outreach mailboxes](../decisions/standalone-outreach-mailboxes.md).
- **Campaigns in Instantly:** one campaign per segment per month, now named with the client business name (`ShopJaydees - <segment> - <month>`, e.g. `ShopJaydees - Business - 2026-07`) so a human can identify it when troubleshooting. Daily cap ~**30 emails/day** per campaign, healthy for deliverability. See [Anti-AI-writing guardrails](../decisions/anti-ai-writing-guardrails.md) for the draft-quality controls on the copy these campaigns send.
- **Timezone quirk:** Instantly's schedule enum has no `America/Vancouver`, so the campaign uses `America/Dawson` (Pacific, DST-equivalent in summer). Send time can drift by an hour across the year; Jenn confirmed she does not mind a send slipping to the next day.
- **Reply handling:** replies surface in Instantly's inbox ("Unibox"), tagged as a lead (and "interested" when intent is detected). A ClickUp status change signals Jenn a reply came in; Instantly should be the only place she goes, and only when follow-up is needed. On "Responded - Follow-up" the new [Prospect handoff to CRM agent](prospect-crm-handoff-agent.md) copies the prospect into the CRM and DMs Jenn.
- **Deduplication** is configured so Hunter.io credits are not spent re-finding existing contacts. For it to work, prospects must stay in the prospects list — so the CRM handoff is a **copy, not a move**.
- **Open-rate tracking** was found disabled on the campaign during the call; Cody is to enable it (both want opens visible).
- **CASL compliance:** every email must carry an unsubscribe link. Cody committed to confirming it actually fires on every send (currently assumed, not verified). Hunter.io's verify-email endpoint (~0.5 credit) can pre-verify addresses to cut bounces; deferred until domain-health data shows whether bounces warrant it.
- **LinkedIn message** on a prospect is a manual draft only; nothing is connected to or auto-sent on LinkedIn.

Several small fixes were queued or made during this session (see the go-live handoff in `leadgeneration/docs/`): the `send` agent's Instantly integration (sequence creation, campaign activation, mailbox assignment, `/leads/add` endpoint), business-name campaign naming, and [anti-AI-writing guardrails](../decisions/anti-ai-writing-guardrails.md) on the copywriter.

## Architecture (per the 2026-05-20 design spec)

A three-stage pipeline with ClickUp as the central record system ([ClickUp single source of truth](../decisions/clickup-single-source-of-truth.md)):

1. **Discover plus enrich.** Jenn sets targeting direction by creating a Prospecting Request in ClickUp (Segment, Category, and City dropdowns, for example "Schools in Langley"). A Discovery Agent (a Google Cloud Function) queries Hunter.io's Discover API with those filters, finds companies and verified decision-maker contacts, deduplicates against existing ClickUp leads, and scores each lead. Jenn never touches Hunter.io directly.
2. **Personalize.** An AI Copywriter Agent on Gemini 2.5 Flash takes enriched data and drafts the three-touch email sequence plus a LinkedIn note from segment templates. Runs daily.
3. **Outreach.** Jenn approves or edits drafts; a send agent delivers approved emails through Instantly or Smartlead, tracks opens and replies, and flags warm responses for owner follow-up. Runs daily. LinkedIn messages stay manual ([LinkedIn stays manual](../decisions/linkedin-stays-manual.md)).

Agents run serverless on Google Cloud Functions, triggered by Google Cloud Scheduler.

## Scope and constraints (per the design spec)

- Scope is the lead generation pipeline only. Organic marketing, social media, referral programs, and website optimization are out of scope.
- Budget is lean: total pipeline tool cost target under 100 US dollars per month.
- Owner bandwidth is capped at roughly fifteen to twenty minutes per day.
- Email is the primary automated channel; LinkedIn is secondary and manual.

## Discovery approach (resolved 2026-06-11)

The source documents described three different discovery approaches:

1. Agreement, pitch, and roadmap: automated Google Maps scraping (Firecrawl), with Hunter.io for email discovery.
2. Design spec (2026-05-20): Hunter.io's Discover API does both discovery and enrichment, driven by Prospecting Requests in ClickUp; no Firecrawl in the stack.
3. Account setup guide: the client searches LinkedIn Sales Navigator with Cody-provided filter templates, exports company lists, and enriches them through cleanlists.ai; no Hunter.io.

Cody resolved this on 2026-06-11: the design spec's version is current — **Hunter.io Discover API only, no Firecrawl, no Sales Navigator, no cleanlists.ai**. The other two versions are superseded. See [Third-party stack](../topics/third-party-stack.md) and [Hunter.io for discovery and enrichment](../decisions/hunter-io-for-discovery-and-enrichment.md).

## Why it exists

Before the engagement, all new business came from referrals. There was no outbound motion: zero structured prospect discovery and zero outreach sends per week. The System replaces that gap with a scheduled pipeline.

## Operating model

- All pipeline stages run on scheduled automation.
- The client (Jenn Milne) reviews and approves outreach drafts daily in ClickUp; see [Daily approval workflow](daily-approval-workflow.md).
- Cold outreach is sent from separate domains, never the client's primary business domain; see [Separate cold outreach domains](../decisions/separate-cold-outreach-domains.md).

## Deliverables

- Deployed agent on Google Cloud covering discovery, enrichment, personalization, and outreach for all configured segments and geographies.
- ClickUp workspace configuration: statuses, custom fields, approval workflows.
- Cold email platform setup with domain warmup and campaign configuration.
- Targeting configuration for Phase 1 geographies; see [Target market](../topics/target-market.md).
- Segment-specific outreach templates with seasonal variation.
- A walkthrough session covering daily operations, the approval workflow, and the system.

## Timeline

The service agreement commits to four to six weeks from receipt of all required account credentials and access, stated as an estimate, not a guarantee. The [implementation roadmap](../topics/implementation-roadmap.md) presents a faster three-week build plan. The agreement is the binding number.

## Related pages

- [Outreach messaging framework](outreach-messaging-framework.md)
- [Lead scoring](lead-scoring.md)
- [Third-party stack](../topics/third-party-stack.md)
- [Service agreement terms](../topics/service-agreement-terms.md)
- [Seasonal playbook](../topics/seasonal-playbook.md)
- [Engagement goals](../topics/engagement-goals.md)
- [Jenn Milne](../people/jenn-milne.md)
