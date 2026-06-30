---
title: Outreach Aliases via IMAP/SMTP
type: wiki-page
category: decision
status: superseded
owner: cody
created: 2026-06-17
updated: 2026-06-22
tags: [deliverability, email, instantly, imap, aliases]
sources:
  - file: leadgeneration/presentations/instantly-imap-connection-guide.md
    created: 2026-06-17
---

# Decision: Outreach Aliases via IMAP/SMTP

> **Superseded 2026-06-22** by [Standalone outreach mailboxes](standalone-outreach-mailboxes.md). The alias-over-IMAP approach isolated the `.com` From-domain reputation but left cold sending authenticating as `hello@` — exposing the primary mailbox and tenant to suspension risk, breaking independent warmup, and routing cold replies and bounces into the business inbox. The addresses are being rebuilt as real standalone mailboxes in a separate Google Workspace tenant, and the IMAP connection guide is retired. This page is retained for provenance; the detail below describes the now-replaced setup.

The two cold outreach addresses, **ellie@shopjaydees.ca** and **ellie@shopjaydees.net**, were implemented as **aliases of the primary Google Workspace mailbox hello@shopjaydees.com**, and connected to Instantly over **IMAP/SMTP** rather than OAuth. Confirmed by Cody on 2026-06-17; superseded 2026-06-22.

## How it works

- IMAP and SMTP authenticate as the **primary mailbox** `hello@shopjaydees.com` using a **Google App Password** (the mailbox's 2-Step Verification blocks plain-password login).
- In Instantly each account is added through the **"Any provider (IMAP/SMTP)"** route, with the **send-from/Email** field set to the alias and the **IMAP/SMTP username** set to `hello@shopjaydees.com`. That pairing — login as `hello@`, send as the alias — is the whole mechanism.
- Inbound mail to either alias already lands in the `hello@` inbox, so Instantly reads it over IMAP; nothing separate is pulled.
- Settings: `imap.gmail.com:993` (SSL), `smtp.gmail.com:465` (SSL; `587` TLS as fallback). Each domain keeps its own SPF/DKIM/DMARC.

The client-facing walkthrough Jenn follows is `leadgeneration/presentations/instantly-imap-connection-guide.md` (also rendered to a branded PDF in the same folder).

## Why IMAP/SMTP instead of OAuth

OAuth authenticates the underlying mailbox (`hello@`) and presents *that* address as the identity, so it cannot send as an alias. The IMAP/SMTP route is the only one that lets the login differ from the send-from address, which is required because these addresses are aliases, not standalone mailboxes.

## Trade-off accepted

Aliases are **not independent mailboxes**. Both Instantly accounts share the one `hello@shopjaydees.com` inbox and its sending reputation, which means:

- They are **not warmed independently** — warmup traffic for both lands in the same inbox.
- Cold-outreach **replies, bounces, and any spam complaints flow into the primary business inbox**, mixed with normal business email.

This **qualifies** the [separate cold outreach domains](separate-cold-outreach-domains.md) decision rather than reversing it: domain-level separation still holds (distinct `.ca`/`.net` domains, each with its own authentication, never sending from `shopjaydees.com`), but **mailbox-level isolation does not** — the cold domains route through the primary business mailbox. Cody weighed this and accepted the trade-off on 2026-06-17.

## Status

- The prior blocker was `.ca`/`.net` DKIM; with that in place, Jenn connects both aliases in Instantly per the guide.
- Cody then enables and configures warmup on both addresses (typically 2–3 weeks) before any campaign sends.

## Related pages

- [Separate cold outreach domains](separate-cold-outreach-domains.md)
- [Dedicated cold email tool](dedicated-cold-email-tool.md)
- [Lead generation system](../systems/lead-generation-system.md)
- [Third-party stack](../topics/third-party-stack.md)
