---
title: ShopJayDees Wiki Log
type: wiki-page
category: log
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [wiki, log]
---

# ShopJayDees Wiki Log

Append-only record of every ingest, query, and lint. Never edit or delete past entries. Entry format: `## [YYYY-MM-DD] operation | subject`, followed by two to five lines on what was done, which pages were touched, and any flags raised. The ingest entries are the provenance record: a raw file is processed only if no entry covers its current state.

## [2026-06-11] ingest | raw/documents/service-agreement.html

Service agreement template (unsigned, no effective date) between SixOhQuad Consulting Inc. and Jaydees Apparel, contact Jenn Milne. Created people/jenn-milne.md, systems/lead-generation-system.md, systems/daily-approval-workflow.md, decisions/separate-cold-outreach-domains.md, topics/service-agreement-terms.md, topics/third-party-stack.md, topics/target-market.md. Updated overview.md and index.md.
Flag: the copy in raw/ is an unsigned template; effective date and signatures are blank.

## [2026-06-11] ingest | raw/documents/lead-gen-pitch.html

Pitch deck for the lead generation system. Created topics/seasonal-playbook.md and topics/engagement-goals.md. Updated systems/lead-generation-system.md (volumes, three-touch sequence, referral-only baseline), systems/daily-approval-workflow.md (daily routine detail), topics/target-market.md (segment detail, four-phase geography), topics/third-party-stack.md (per-tool costs, Smartlead alternative), overview.md, and index.md.
Flag: pitch lists "Instantly or Smartlead" while the agreement says "Instantly (or equivalent)". Pitch slide counters are inconsistent (some slides show of 17, later ones of 18), a cosmetic artifact only.

## [2026-06-11] ingest | raw/documents/implementation-roadmap.html

Week-by-week build plan presented to the client. Created topics/implementation-roadmap.md and decisions/start-small-then-scale.md. Updated systems/lead-generation-system.md (ClickUp status flow, fit score threshold of three or higher, timeline note), people/jenn-milne.md (pre-build account to-dos), overview.md (engagement status), and index.md.
Flag: roadmap promises three weeks versus the agreement's four to six weeks. Flag: example outreach address jay@shopjaydees.com is on the primary domain, conflicting with the separate-domain requirement in the agreement.

## [2026-06-11] ingest | raw/documents/messaging-framework.html

Outreach messaging framework deck. Created systems/outreach-messaging-framework.md and topics/wear-it-forward.md. Updated systems/daily-approval-workflow.md (warm intro flag, AI tuning, manual LinkedIn), systems/lead-generation-system.md (link), overview.md (Wear It Forward, credibility claims), and index.md.
Note: sample emails use fictional prospects (Rosewood Elementary, Westridge Plumbing, Valley United FC) and the persona "Jay from Jaydees"; ingested as examples, not facts about real prospects.

## [2026-06-11] ingest | raw/documents/account-setup-guide.md

Client-facing account setup guide. Updated topics/third-party-stack.md (revised stack and access model), systems/lead-generation-system.md (discovery approach conflict), decisions/separate-cold-outreach-domains.md (open tension on example addresses), people/jenn-milne.md (revised to-dos and active Sales Navigator role), and index.md.
Flag: the guide replaces Hunter.io and Firecrawl with LinkedIn Sales Navigator (about 99 US dollars per month) and cleanlists.ai, shifting discovery from Google Maps scraping to client-driven Sales Navigator exports. The guide is undated; current stack unconfirmed.
Flag: suggested outreach addresses (ellie@ or hello@shopjaydees.com) sit on the primary domain despite the agreement's separate-domain requirement.

## [2026-06-11] ingest | raw/documents/2026-05-20-lead-generation-system-design.md

Design spec dated 2026-05-20, the deepest technical source. Created systems/lead-scoring.md and six decision pages: clickup-single-source-of-truth, hunter-io-for-discovery-and-enrichment, linkedin-stays-manual, dedicated-cold-email-tool, async-approval-queue, gemini-flash-for-personalization. Updated systems/lead-generation-system.md (architecture, Prospecting Requests, statuses, scope, budget), people/jenn-milne.md (owner role, score override), topics/target-market.md (category filters), topics/seasonal-playbook.md, topics/engagement-goals.md (metrics, health signals), topics/third-party-stack.md (third stack version), systems/outreach-messaging-framework.md (tone priority, LinkedIn template), overview.md, and index.md.
Flag: the spec's discovery approach (Hunter.io Discover API, no Firecrawl) is the third conflicting version across the documents. Flag: spec budget is under 100 US dollars per month versus the agreement's 32 to 129 estimate.

## [2026-06-11] update | conflict resolutions from Cody

Cody resolved the two flagged conflicts: the discovery stack is the design spec's version (Hunter.io Discover API only; Firecrawl, Sales Navigator, and cleanlists.ai versions superseded), and cold outreach runs from separate domains per the agreement (the primary-domain example addresses in the roadmap and setup guide are superseded; jay@shopjaydees.com does not exist, the real primary-domain addresses are hello@, ellie@, and jenn@, reserved for warm conversations). Pages updated: overview, topics/third-party-stack, decisions/separate-cold-outreach-domains, people/jenn-milne (BNI relationship context added). A signed copy of the service agreement is expected into raw/documents/ from Cody.

## [2026-06-11] ingest | raw/documents/service-agreement - 5_28_26, 10_01 AM.pdf

Signed service agreement, executed 2026-05-28. Converted with markitdown (PDF never opened directly) and signature-checked with pdfsig: Google LLC certificate, signature valid, certificate trusted, total document signed. Audit trail: request sent by cody@sixohquad.com 17:02 UTC, signed by Jennifer Milne (hello@shopjaydees.com) 17:09 UTC, counter-signed by Cody Halovich 17:28 UTC, complete. Terms identical to the previously ingested template; nothing renegotiated. Pages updated: topics/service-agreement-terms (execution section), people/jenn-milne (full name, email, signing), overview (signed status), index. The down payment became due on signing; the six month minimum still runs from Delivery.

## [2026-06-11] ingest | raw/documents/service-agreement - 5_28_26, 10_01 AM.pdf

Reprocessed the signed PDF at its exact raw filename after the earlier log entry normalized the narrow no-break space before AM. Converted with markitdown and checked with pdfsig: Google LLC certificate, signing time May 28 2026 at 10:28:44, signature valid, certificate trusted, total document signed. Terms and audit trail match the prior signed-agreement ingest. Pages touched: topics/service-agreement-terms, people/jenn-milne, overview. Flag: prior log entry and some prior source paths normalized the filename; this entry records the exact raw path.

## [2026-06-12] migrate | moved ingested sources from raw/ to ingested/
Adopted the new source lifecycle: raw/ is the pending inbox, ingested/ is the immutable archive. Moved all seven previously ingested files to ingested/documents/ via the ingest-queue tool and updated every page's sources frontmatter to the ingested/ paths. No content changed.

## [2026-06-17] lint | full
Requested incremental lint, forced to full because no prior lint entry existed. Counts: contradictions 1, superseded claims 3, orphans 0, missing pages 0, unprocessed raw files 0.
Findings: discovery-stack resolution is inconsistently reflected across lead-generation-system, hunter-io-for-discovery-and-enrichment, people/jenn-milne, third-party-stack, and index. No fixes applied.

## [2026-06-17] update | outreach aliases via IMAP/SMTP (Cody decision)
Cody confirmed the cold outreach addresses ellie@shopjaydees.ca and .net are implemented as aliases of the primary mailbox hello@shopjaydees.com, connected to Instantly over IMAP/SMTP (login as hello@ with a Google App Password, send-as the alias). Created decisions/outreach-aliases-via-imap-smtp.md documenting the mechanism and the accepted trade-off. Qualified decisions/separate-cold-outreach-domains.md (domain separation holds, mailbox isolation does not) and updated index.md.
Flag: aliases share the primary business inbox and its sending reputation — not warmed independently; cold replies/bounces land in hello@. Trade-off accepted by Cody. Client-facing guide produced at leadgeneration/presentations/instantly-imap-connection-guide.{md,html,pdf}.
