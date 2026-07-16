---
title: Prospect Handoff to CRM Agent
type: wiki-page
category: system
status: active
owner: cody
created: 2026-07-15
updated: 2026-07-15
tags: [clickup, crm, automation, warm-leads]
sources:
  - file: "ingested/meetings/60 Min between Cody Halovich and Jenn - 2026_07_15 08_57 PDT - Notes by Gemini.md"
    ingested: 2026-07-15
---

# Prospect Handoff to CRM Agent

A ClickUp AI agent built live during the 2026-07-15 walkthrough to bridge the outbound pipeline and the client's CRM once a prospect replies.

## Trigger and action

- **Trigger:** a prospect's status changes to **Responded - Follow-up** in the prospects list.
- **Actions:** the agent creates a contact in the CRM (a ClickUp Space named "CRM") contacts list, comments on that contact task, and DMs Jenn so she knows a warm lead has landed.
- Tested live: Monark was flipped to Responded - Follow-up during the call; the notification arrived in Jenn's "super agents" DM and her main inbox after roughly one to two minutes.

## Why it copies rather than moves

The prospect must stay in the prospects list so [deduplication](lead-generation-system.md) keeps working and Hunter.io credits are not spent re-finding an existing contact. So the handoff is a **copy into the CRM plus an alert**, never a move out of prospects.

## CRM naming conventions (Jenn's)

- **Contacts:** organization / school / business name.
- **Leads & opportunities:** `business – product – year` (year = the school year for this product line).
- **Client-type field** (school, nonprofit, corporate, or team): set manually — not auto-matched by the agent.

## Downstream ownership

The alert hands off to the quote/opportunity workflow owned by [Tamara](../people/tamara.md), who collects the quote information once a prospect becomes a live lead.

## Open items

- The agent currently "lives under" Cody's ClickUp account rather than the client's; ownership may need to move to the client for the maintenance phase.
- Jenn floated eventually automating Tamara's intake step with a further ClickUp AI agent — aspirational, not committed.

## Related pages

- [Lead generation system](lead-generation-system.md)
- [Jenn Milne](../people/jenn-milne.md)
- [Tamara](../people/tamara.md)
