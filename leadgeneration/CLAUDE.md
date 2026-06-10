# Lead Generation System — ShopJaydees

## Client Overview

ShopJaydees (shopjaydees.com) is an online custom clothing company. Their core customer segments:

- **Businesses** — employee apparel (uniforms, branded gear, company swag)
- **Schools** — spirit wear, uniforms, event clothing
- **Teams** — custom athletic and group apparel

They also run a **"Wear It Forward"** program — a portion of profits goes to community initiatives. This is a key differentiator and central to their brand identity.

## Project Purpose

This directory contains planning artifacts for a lead generation system designed to bring qualified prospects (businesses, schools, teams) into ShopJaydees' sales pipeline.

## Project Status

**Client has approved and paid initial deposit.** Implementation underway.

### Completed

- **Design spec**: Full pipeline architecture documented (`docs/superpowers/specs/2026-05-20-lead-generation-system-design.md`)
- **Client pitch**: 18-slide HTML presentation delivered (`presentations/lead-gen-pitch.html`) — Split Pastel style, covers pipeline overview, targeting, personalization, responsibilities, pricing, and success metrics
- **Account setup guide**: Step-by-step guide for client to register third-party accounts and invite Cody (`account-setup-guide.md` / `account-setup-guide.pdf`)
- **ClickUp data model**: Full workspace schema — 53 custom fields, 13 statuses, 8 automations, 6 Zapier zaps (`docs/superpowers/specs/2026-06-08-clickup-data-model.md`)
- **API contracts**: Input/output schemas for all pipeline components — discovery agent, personalization agent, send agent, dormancy check (`docs/superpowers/specs/2026-06-08-api-contracts.md`)
- **Adversarial review**: 22 findings identified and all resolved (`docs/superpowers/plans/spec-review-findings.md` + `docs/superpowers/specs/2026-06-08-spec-review-resolutions.md`)
- **Plan 1 — Foundation + Discovery Agent**: Scaffolding, types, config, ClickUp/Hunter.io clients, scoring, mapping, Discovery Agent, alerting, logging
- **Plan 2 — Personalization Agent**: Firecrawl/Gemini clients, website scraping, draft generation, validation, CASL compliance
- **Plan 3 — Send Agent + Dormancy Check**: Instantly client, campaign management, send logic, dormancy reactivation

### In Progress

- **ClickUp workspace**: Space, folder, lists, and 61 custom fields created via API. Statuses configured. Views, dashboard, and automations still needed (UI tasks).
- **Platform setup (Plan 4)**: Instantly config (blocked on DKIM for .ca/.net), Zapier zaps, GCP deployment, integration testing
- Outreach templates and email sequences
- Lead scoring calibration and testing

### Pricing (agreed)

- **$3,000 CAD + tax** — one-time setup (pipeline build, agent development, ClickUp integration, targeting & template config)
- **$300 CAD/mo + tax** — ongoing management (monitoring, optimization, monthly reviews, seasonal adjustments, support)
- **~$120-132 USD/mo** — third-party tool costs paid directly by client (Hunter.io $34, Instantly $37.60, Zapier $19.99, Firecrawl $19, ClickUp Unlimited $7, Gemini API $2-5, GCP $0-5)

### Current State

- **Website**: shopjaydees.com is live
- **CRM/Pipeline**: ClickUp Unlimited (CRM + pipeline management), Hunter.io, Instantly — all accounts set up
- **ClickUp workspace**: Lead Generation space created with Outbound Pipeline folder, Prospects list (53 fields), Prospecting Requests list (8 fields), statuses configured
- **Code**: All 4 Cloud Functions implemented (discover, personalize, send, dormancyCheck) — 175 tests passing
- **Domains**: shopjaydees.ca/.net linked to Google Workspace (MX, SPF, DMARC done; DKIM pending)
- **Blocking**: DKIM setup for .ca/.net sending domains, GCP project access
- **Current lead gen**: Referrals only — no structured lead capture, nurture, or outbound

## Lead Gen Strategy Direction

- Target all three segments (businesses, schools, teams) equally
- "Wear It Forward" is a strong supporting proof point — not the primary hook, but prominently featured
- Lead with product quality and service, differentiate with community impact
- **Geography**: Lower Mainland and Fraser Valley (BC, Canada) for now; open to shipping; goal to expand nationwide
- **Budget**: Lean/bootstrap — focus on organic, referral, partnerships, low-cost tactics
- **Sales model**: Mix of one-time bulk orders and ongoing repeat relationships (varies by segment)
- **Social media**: Active but inconsistent (1-3 posts/week with occasional gaps)

## What Belongs Here

- Strategy documents and research
- Audience and persona definitions
- Channel plans (email, social, ads, partnerships, referrals, etc.)
- Funnel architecture and automation workflows
- Copy, messaging frameworks, and CTAs
- Technical specs for any tooling or integrations
- Metrics, KPIs, and tracking plans
- Client-facing deliverables (presentations, guides)

## Conventions

- All planning docs go in this directory (subdirectories as needed for organization)
- Markdown for all documents
- Name files descriptively in kebab-case (e.g., `email-sequence-schools.md`)
