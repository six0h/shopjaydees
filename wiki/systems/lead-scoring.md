---
title: Lead Scoring
type: wiki-page
category: system
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [scoring, qualification, discovery]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Lead Scoring

The one-to-five fit score the Discovery Agent assigns automatically to every prospect in Stage 1 of the [lead generation system](lead-generation-system.md). From the 2026-05-20 design spec.

## Inputs

Scoring uses data available from Hunter.io: headcount (larger organizations score higher for apparel volume potential), email confidence score, title seniority (Owner, CEO, Principal, Director score higher than generic titles), industry fit against the target category, and web presence (has a domain versus none found).

## Rubric

| Score | Criteria |
| --- | --- |
| 5 | High-volume apparel need, decision-maker found, email verified, recent growth signal |
| 4 | Clear apparel need, contact found, active business |
| 3 | Likely apparel need, some contact info, stable business |
| 2 | Possible apparel need, limited info found |
| 1 | Unclear need or very small operation |

## Routing

- Scores of three or higher enter the personalization pipeline automatically with status "Enriched".
- Scores of one or two are set to status "Parked" for future re-evaluation. A dormant lead can re-enter later with a different angle if it still scores three or higher.
- Jenn can override any score in ClickUp if she disagrees with the agent's assessment.

## Related pages

- [Lead generation system](lead-generation-system.md)
- [Jenn Milne](../people/jenn-milne.md)
- [Hunter.io for discovery and enrichment](../decisions/hunter-io-for-discovery-and-enrichment.md)
