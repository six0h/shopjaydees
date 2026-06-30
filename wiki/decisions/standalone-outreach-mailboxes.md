---
title: Standalone Outreach Mailboxes
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-22
updated: 2026-06-29
tags: [deliverability, email, instantly, domains, google-workspace, clickup]
sources:
  - file: leadgeneration/presentations/outreach-mailbox-rehosting-and-response-flow.md
    created: 2026-06-22
---

# Decision: Standalone Outreach Mailboxes

The two cold outreach addresses, **ellie@shopjaydees.ca** and **ellie@shopjaydees.net**, move from being **aliases of the primary mailbox** to being **real, standalone mailboxes hosted in a separate, dedicated Google Workspace tenant** — fully isolated from Jaydees Apparel's primary business Workspace. Warm-lead handoff to the owner runs **entirely through ClickUp** (no CC, no email forward). Confirmed by Cody on 2026-06-22.

This **reverses** the [Outreach aliases via IMAP/SMTP](outreach-aliases-via-imap-smtp.md) decision of 2026-06-17 and completes the original intent of [Separate cold outreach domains](separate-cold-outreach-domains.md): now both **domain-level and mailbox-level isolation hold**.

## Why the alias setup was reopened

The alias-over-IMAP approach protected the `.com` **From-domain reputation** (cold sends are `From:` and DKIM-signed `d=` the `.ca`/`.net` domains) but left the more important asset exposed: every cold send **authenticated as `hello@shopjaydees.com`**, so Google attributed the sending behaviour to the **primary mailbox and tenant**. Three consequences drove the reversal:

- **Account-suspension risk.** Cold outreach violates Google Workspace's unsolicited-mail policy. If campaigns tripped Google's abuse detection, the account at risk of throttling or suspension was `hello@` / the whole primary tenant — i.e. her real business email.
- **Broken warmup.** Both Instantly accounts warmed into the one shared inbox — circular traffic, not two independent reputations.
- **Inbox contamination.** Cold replies, bounces, and spam-trap hits landed in `hello@`, mixed with real business email.

The tether was self-imposed: the IMAP login-as-`hello@`/send-as-alias mechanism existed **only because** the addresses were aliases rather than real mailboxes. Making them standalone mailboxes removes the tether entirely.

## New architecture

- A **new, separate Google Workspace tenant** (distinct from the primary) holds `shopjaydees.ca` and `shopjaydees.net` as its own domains, each with one real user: `ellie@shopjaydees.ca` and `ellie@shopjaydees.net`. Real mailboxes, not aliases.
- Each connects to **Instantly over Google OAuth** — the stable, normal route; the App Password workaround is retired.
- **Independent SPF / DKIM / DMARC** per domain in the new tenant, **independent warmup** (2–3 weeks before campaigns), volume split across the two addresses.
- **Net effect:** cold sending authenticates as itself. Suspension risk, bounces, complaints, and warmup all live on disposable infrastructure. `hello@` and the primary tenant are completely out of the blast radius.

## Warm-lead handoff: ClickUp-only

On reply, the system updates the lead's ClickUp card — status to **"Responded — Owner Follow-up,"** the reply text posted as a comment, the card assigned to Jenn with a notification. Jenn reviews it in context (fit score, draft history, company detail), replies to the first warm touch to keep the thread, and hands over `hello@shopjaydees.com` to move the established conversation to her primary inbox.

> **Update (2026-06-29):** the card update is performed by the [reply-poll agent](reply-detection-via-api-polling.md), which polls the Instantly API (Jenn's **Growth** plan has no webhooks). Growth also has **no Unibox**, so Jenn replies to the first warm touch directly from the standalone **`ellie@` Gmail inbox** (`.ca`/`.net`), not the Unibox.

**Decided against CC / email-forward of replies to `hello@`** (2026-06-22). CC-ing the primary on cold mail re-exposes it and undoes the isolation; ClickUp is the single surface where Jenn already works and gives full context a CC cannot.

## Ownership and cost

- **Jenn (admin of the shopjaydees domains and DNS)** performs the migration: free the `.ca`/`.net` domains from the primary tenant, create the new Workspace, add and verify both domains, create the two mailboxes, and set up **SPF, DKIM, and DMARC** in DNS.
- **Cody** reconnects both addresses to Instantly over OAuth, runs warmup, and confirms authentication validates before campaigns start.
- Cost is roughly **$17 CAD/month** for the two mailboxes. Cody applied a **$150 credit** to the final invoice, which more than covers the first three months; Jenn accepted the change and the cost on 2026-06-22.

## Reply automation — built 2026-06-29

The reply → ClickUp automation is now built, but as **API polling, not a webhook** — Jenn's Instantly Growth plan has no webhooks. See [Reply detection via API polling](reply-detection-via-api-polling.md). This also retired the Zapier layer. (Two go-live validation items remain — `/emails` field-name confirmation and bounce lead-identity mapping — pending live campaign traffic after warmup.)

## Client-facing guide

`leadgeneration/presentations/outreach-mailbox-rehosting-and-response-flow.{html,pdf}` — the six-step migration walkthrough plus the ClickUp reply flow. **Supersedes** the IMAP connection guide `instantly-imap-connection-guide.{md,html,pdf}`.

## Related pages

- [Reply detection via API polling](reply-detection-via-api-polling.md) (builds the reply automation this page left pending)
- [Outreach aliases via IMAP/SMTP](outreach-aliases-via-imap-smtp.md) (superseded by this decision)
- [Separate cold outreach domains](separate-cold-outreach-domains.md)
- [Dedicated cold email tool](dedicated-cold-email-tool.md)
- [Lead generation system](../systems/lead-generation-system.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
- [Jenn Milne](../people/jenn-milne.md)
