---
title: Jenn Milne
type: wiki-page
category: person
status: active
owner: cody
created: 2026-06-11
updated: 2026-07-15
tags: [client-contact, jaydees-apparel]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/implementation-roadmap.html
    ingested: 2026-06-11
  - file: ingested/documents/account-setup-guide.md
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
  - file: "ingested/documents/service-agreement - 5_28_26, 10_01 AM.pdf"
    ingested: 2026-06-11
---

# Jenn Milne

Jenn Milne (full name Jennifer Milne per the signed agreement's audit trail, email hello@shopjaydees.com) is the named client contact for Jaydees Apparel on the service agreement with SixOhQuad Consulting Inc. She signed the agreement on 2026-05-28 via Google eSignature. The 2026-05-20 design spec refers to her as the ShopJaydees owner.

Relationship context, confirmed by Cody on 2026-06-11: she is a fellow BNI member and the lead came through BNI. The engagement was deliberately priced below standard automate-pillar pricing to seed the pipeline and the referral relationship.

## Role in the engagement

- Client signatory and primary contact for the lead generation engagement.
- Per the design spec, she sets targeting direction by creating Prospecting Requests in ClickUp (Segment, Category, City), can override any [lead score](../systems/lead-scoring.md), and never touches Hunter.io directly; her first interaction with leads is the approval queue.
- Responsible for the daily ClickUp review: approving or editing outreach drafts, approximately fifteen to twenty minutes per day.
- Personally handles warm lead follow-up conversations and LinkedIn outreach using AI-drafted copy.
- Responsible for creating and paying for the third-party tool accounts (see [Third-party stack](../topics/third-party-stack.md)) and for registering separate cold outreach domains.
- As **admin of the shopjaydees domains and their DNS**, she owns the 2026-06-22 outreach-mailbox migration: freeing `.ca`/`.net` from the primary Workspace, creating the **separate Google Workspace tenant**, creating the two real `ellie@` mailboxes, and setting **SPF, DKIM, and DMARC** in DNS. Cody handles the Instantly reconnect and warmup. See [Standalone outreach mailboxes](../decisions/standalone-outreach-mailboxes.md). She accepted the ~$17 CAD/month cost (offset by a $150 final-invoice credit) on 2026-06-22.
- Pre-build to-do per the implementation roadmap: set up ClickUp, Instantly, Hunter.io, Firecrawl, and Google Cloud accounts, invite cody@sixohquad.com (share the Firecrawl API key), and create a dedicated cold outreach email address. The build clock starts when these are done. See [Implementation roadmap](../topics/implementation-roadmap.md).
- The later account setup guide revises that list: ClickUp (invite Cody as Admin), LinkedIn Sales Navigator Core, cleanlists.ai, Instantly (invite Cody), Google Cloud (accept Cody's invite and add billing), plus the dedicated outreach address. The guide also gives the client an active pipeline role: running Sales Navigator searches and exporting company lists. Cody resolved the stack on 2026-06-11 to Hunter.io Discover API only, so the Firecrawl, Sales Navigator, and cleanlists.ai items in both lists above are superseded. See [Third-party stack](../topics/third-party-stack.md).

## Working style and context (observed 2026-07-15)

- **Comfortable handing the system control.** "I'm totally fine with it taking the reins and then I'll just dial it back if we need to." First-time user of ClickUp AI agents/automations. Found the pipeline a relief over manual research ("This is so much easier than having to do this research").
- **Visual worker.** Just bought a desk whiteboard despite liking ClickUp. Works from a small ground-floor condo with an open floor plan and limited space (no room for a closed office); downsized to buy in and has since outgrown it. Has a dog that barks at passersby; casual, warm, informal working style (heavy casual profanity, easy rapport).
- **Approval role confirmed in practice:** she authorizes sends by moving leads to Approved, and can edit an approved email up to the 9:00 a.m. send. During the call she agreed to review/approve the remaining prospects.
- **Feedback that shaped the build:** disliked an em-dash that slipped into the Blue Pine draft — the trigger for the [anti-AI-writing guardrails](../decisions/anti-ai-writing-guardrails.md). Wants to flag any email surfacing content she does not want shared (e.g. fabric-sample details) so Cody can tune the agent.
- **Tooling:** during the call she upgraded Hunter.io to the Starter plan and paid a full year (see [Hunter.io Starter plan](../decisions/hunter-starter-plan.md)).
- Floated eventually automating [Tamara](tamara.md)'s quote/opportunity-intake role with a ClickUp AI agent — an aspirational aside, not a commitment.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
- [Prospect handoff to CRM agent](../systems/prospect-crm-handoff-agent.md)
- [Service agreement terms](../topics/service-agreement-terms.md)
