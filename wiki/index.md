---
title: ShopJayDees Wiki Index
type: wiki-page
category: index
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-29
tags: [wiki, index]
---

# ShopJayDees Wiki Index

Catalog of every page in this wiki: relative link, then a one-line summary. Every wiki operation starts here. Keep every line current in the same operation that touches its page.

## Overview

- [Overview](overview.md): synthesis of the client (Jaydees Apparel) and the lead generation engagement.

## People

- [Jenn Milne](people/jenn-milne.md): client contact and signatory at Jaydees Apparel; owns daily approvals and warm lead follow-up.

## Systems

- [Lead generation system](systems/lead-generation-system.md): the contracted system; discovery, enrichment, outreach, tracking, and warm lead handling on Google Cloud and ClickUp.
- [Daily approval workflow](systems/daily-approval-workflow.md): the client's daily ClickUp review of drafts and flagged warm leads, fifteen to twenty minutes per day.
- [Outreach messaging framework](systems/outreach-messaging-framework.md): research inputs, voice, message structure, personalization layers, credibility claims, and the three-touch sequence.
- [Lead scoring](systems/lead-scoring.md): the one-to-five fit rubric, its inputs, and routing (three or higher proceeds, lower parks, Jenn can override).

## Decisions

- [Separate cold outreach domains](decisions/separate-cold-outreach-domains.md): cold email runs from dedicated domains to protect the primary domain's deliverability; full domain + mailbox isolation restored 2026-06-22 via standalone mailboxes.
- [Standalone outreach mailboxes](decisions/standalone-outreach-mailboxes.md): ellie@shopjaydees.ca/.net rebuilt as real mailboxes in a separate Google Workspace tenant; ClickUp-only reply handoff; supersedes the alias setup (2026-06-22).
- [Reply detection via API polling](decisions/reply-detection-via-api-polling.md): the reply → ClickUp loop is a scheduled polling agent, not a webhook — Growth plan has no webhooks/Unibox; retires Zapier (2026-06-29).
- [Outreach aliases via IMAP/SMTP](decisions/outreach-aliases-via-imap-smtp.md): SUPERSEDED 2026-06-22 — ellie@ addresses were aliases of hello@ over IMAP/SMTP; shared-mailbox trade-off reversed for full isolation.
- [Start small then scale](decisions/start-small-then-scale.md): outreach ramps from a five-to-ten-send test batch to full volume after joint review.
- [ClickUp single source of truth](decisions/clickup-single-source-of-truth.md): every lead's status, score, and history lives in ClickUp; no separate databases.
- [Hunter.io for discovery and enrichment](decisions/hunter-io-for-discovery-and-enrichment.md): one tool for finding companies and verified contacts, per the design spec; conflicts with other documents flagged.
- [LinkedIn stays manual](decisions/linkedin-stays-manual.md): the agent writes LinkedIn copy, the owner sends it, keeping the account safe.
- [Dedicated cold email tool](decisions/dedicated-cold-email-tool.md): Instantly or Smartlead handles sending, warmup, and deliverability instead of ClickUp.
- [Async approval queue](decisions/async-approval-queue.md): one daily batch review of ten to twenty drafts instead of real-time approvals.
- [Gemini Flash for personalization](decisions/gemini-flash-for-personalization.md): Gemini 2.5 Flash runs the copywriter agent because the workload needs no frontier model.

## Topics

- [Service agreement terms](topics/service-agreement-terms.md): fees, term, IP, liability, and compliance terms; signed and complete 2026-05-28 via Google eSignature.
- [Third-party stack](topics/third-party-stack.md): client-paid tools, with two conflicting versions: agreement and pitch (Hunter.io, Firecrawl) versus the setup guide (Sales Navigator, cleanlists.ai).
- [Target market](topics/target-market.md): segment categories with discovery filters and company sizes, plus the four-phase geographic expansion plan.
- [Seasonal playbook](topics/seasonal-playbook.md): which segments to target with which theme in each part of the year.
- [Engagement goals](topics/engagement-goals.md): ninety-day targets, six-month outlook, pipeline metrics, health signals, monthly review agenda, and the responsibility split.
- [Implementation roadmap](topics/implementation-roadmap.md): the three-week build plan, client account to-dos, and flags on timeline and the example outreach address.
- [Wear It Forward](topics/wear-it-forward.md): the client's community giving program, the core differentiator in every outreach message.
