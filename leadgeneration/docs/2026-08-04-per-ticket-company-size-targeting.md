---
title: Per-Ticket Company Size Targeting
type: spec
status: shipped
owner: cody
created: 2026-08-04
updated: 2026-08-04
tags: [lead-generation, discovery, hunter, clickup, scoring]
---

# Per-Ticket Company Size Targeting

**Shipped 2026-08-04.** The ClickUp `Company Size` dropdown (field id
`d7ec49bd-0cd3-48df-ae1b-14cc0e7f32e0`) exists on the Prospecting Requests list
`901417162428`, and the `discover` Cloud Function was redeployed (revision
`discover-00010-lom`, `us-west1`) with the pipeline change below.

## Goal

Jenn wants to prospect smaller companies than the pipeline has been finding, on the belief that smaller businesses are an easier entry for Jaydees Apparel. Give her a way to target a specific company-size band on any single Prospecting Request ticket, when she wants to, without changing the default behaviour of tickets that leave it blank.

## Background

A Prospecting Request ticket in ClickUp (list `901417162428`) carries **Segment**, **Category**, **Target City**, and **Max Results**. The Discovery Agent (Cloud Function) turns Category and City into a Hunter.io Discover query. Company size is not selectable per ticket today: every request uses one hardcoded default headcount band, `config.hunterDefaultHeadcount` = `1-10, 11-50, 51-200`, applied at `src/index.ts`.

Lead scoring (`src/scoring.ts`) is biased toward larger firms: `+1` for headcount 11 or more, `-1` for headcount 10 or fewer when the contact is not a decision-maker. Only leads scoring 3 or higher move to outreach. The headcount value fed to the scorer is not the company's real headcount (Hunter's Domain Search does not return it); it is a proxy set to the first configured headcount band (`config.hunterDefaultHeadcount[0]`, that is `"1-10"`). Consequently the `+1` large bonus never fires today and the `-1` small penalty fires for every non-owner contact.

## Change

Two coordinated parts. Both are additive: a blank Company Size field reproduces today's behaviour exactly.

### 1. ClickUp: Company Size dropdown

Add one optional `drop_down` custom field, **Company Size**, to the prospecting list. Options (order matters, mapped by name in code):

| Option | Hunter headcount ranges | Small-targeting |
| --- | --- | --- |
| _(blank)_ | `1-10, 11-50, 51-200` (default) | no |
| `Micro (1-10)` | `1-10` | yes |
| `Small (11-50)` | `11-50` | yes |
| `1-50 (small+micro)` | `1-10, 11-50` | yes |

The field is read-only for the pipeline (never written back), matched by field name exactly like Segment, Category, and Target City. No new environment variable or config id is required.

### 2. Pipeline

- `mapping.ts`: add `COMPANY_SIZE_HEADCOUNTS` (the table above) and a `headcountsAreSmall(ranges)` helper that returns true when every requested range tops out at 50 or fewer.
- `extractRequestFields` (`index.ts`): read the Company Size dropdown by name into an optional `companySizeHeadcount: string[] | null`.
- Discovery loop (`index.ts`): set `filters.headcount = companySizeHeadcount ?? config.hunterDefaultHeadcount`. Compute `smallTargeting = companySizeHeadcount ? headcountsAreSmall(companySizeHeadcount) : false`. Pass the chosen band's first range as the scorer's headcount proxy, and pass `smallTargeting` through.
- `scoring.ts`: add optional `smallTargeting` to `ScoreInput`. When true, skip the `+1` headcount-11-plus bonus and skip the `-1` small-or-unknown-headcount penalty, so intentionally-small leads compete fairly and are not parked for being small.

## Scope and non-goals

- The offered bands are all small; larger bands are deliberately not added (YAGNI, matches the ask).
- No change to Segment, Category, City, Max Results, discovery keywords, geography, or send behaviour.
- No change to the seasonal or default headcount for blank tickets.

## Testing

- `mapping.test.ts`: mapping table values; `headcountsAreSmall` true for small bands and the default set's small ranges, false for a set containing `51-200`.
- `scoring.test.ts`: `smallTargeting` suppresses the `+1` and the `-1`; a micro non-owner lead that would score 2 today scores 3 with `smallTargeting`.
- `discovery.test.ts`: `extractRequestFields` reads Company Size; a ticket with a small band produces `filters.headcount` equal to the mapped ranges; a blank ticket falls back to `config.hunterDefaultHeadcount`.

## Rollout

1. Land and test the pipeline change in the repo.
2. Create the ClickUp field (external write, confirmed with Cody).
3. Redeploy the discovery Cloud Function.
4. Update the wiki (`lead-generation-system`, `target-market`) and add a decision page.
