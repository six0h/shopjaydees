---
title: Jenn Milne
type: wiki-page
category: person
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-22
tags: [client-contact, jaydees-apparel]
sources:
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
- The later account setup guide revises that list: ClickUp (invite Cody as Admin), LinkedIn Sales Navigator Core, cleanlists.ai, Instantly (invite Cody), Google Cloud (accept Cody's invite and add billing), plus the dedicated outreach address. The guide also gives the client an active pipeline role: running Sales Navigator searches and exporting company lists. See [Third-party stack](../topics/third-party-stack.md) for the conflict between the two lists.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
- [Service agreement terms](../topics/service-agreement-terms.md)
