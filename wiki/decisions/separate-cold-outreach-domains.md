---
title: Separate Cold Outreach Domains
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-22
tags: [deliverability, domains, email]
sources:
  - file: ingested/documents/service-agreement.html
    ingested: 2026-06-11
  - file: ingested/documents/account-setup-guide.md
    ingested: 2026-06-11
---

# Decision: Separate Cold Outreach Domains

All cold outreach is sent from separate domains, distinct from the client's primary business domain. Written into the service agreement as both a scope item (Section 1) and a client responsibility (Section 7).

## Rationale

Protect the reputation and deliverability of Jaydees Apparel's main domain. Cold email carries spam-flag risk; isolating it on dedicated domains keeps the primary domain clean for warm conversations and normal business email.

## Consequences

- The client registers and maintains the outreach domain(s) and gives SixOhQuad access to the associated email accounts for platform configuration.
- The cold email platform handles warmup of these domains before campaigns run.
- Established warm conversations transition from the unified inbox to the client's primary business email.

## Resolution

Cody confirmed on 2026-06-11 that the agreement's rule stands: cold outreach runs from separate domains, never the primary business domain. The example addresses on shopjaydees.com in the implementation roadmap and account setup guide are superseded drafting and do not reflect the standard; jay@shopjaydees.com (named in the roadmap) does not exist at all. The addresses that exist on the primary domain are hello@, ellie@, and jenn@, and they are for normal business email and warm conversations, not cold outreach. Any future setup material must use lookalike domains.

## Implementation (2026-06-17): aliases of the primary mailbox

The chosen outreach addresses are **ellie@shopjaydees.ca** and **ellie@shopjaydees.net**, implemented as **aliases of the primary mailbox hello@shopjaydees.com** and connected to Instantly over IMAP/SMTP. This **qualifies** the decision: domain-level separation still holds (distinct `.ca`/`.net` domains with their own SPF/DKIM/DMARC, never sending from `shopjaydees.com`), but **mailbox-level isolation does not** — the cold domains route through, and share the reputation and inbox of, the primary business mailbox. Cody accepted this trade-off on 2026-06-17. Full detail and mechanism: [Outreach aliases via IMAP/SMTP](outreach-aliases-via-imap-smtp.md).

## Update (2026-06-22): full isolation — standalone mailboxes

The 2026-06-17 mailbox-sharing trade-off was **reversed**. The `.ca`/`.net` addresses are being rebuilt as **real standalone mailboxes in a separate Google Workspace tenant**, so cold sending no longer authenticates as `hello@`. **Both domain-level and mailbox-level isolation now hold** — this realizes the original intent of this decision in full. See [Standalone outreach mailboxes](standalone-outreach-mailboxes.md) for the architecture, the migration ownership, and the ClickUp-only reply handoff.

## Related pages

- [Outreach aliases via IMAP/SMTP](outreach-aliases-via-imap-smtp.md)
- [Lead generation system](../systems/lead-generation-system.md)
- [Service agreement terms](../topics/service-agreement-terms.md)
