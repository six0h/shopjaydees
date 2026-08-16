---
title: Outreach Messaging Framework
type: wiki-page
category: system
status: active
owner: cody
created: 2026-06-11
updated: 2026-08-11
tags: [messaging, personalization, outreach]
sources:
  - file: ingested/documents/messaging-framework.html
    ingested: 2026-06-11
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Outreach Messaging Framework

How the [lead generation system](lead-generation-system.md) researches, personalizes, and writes outreach for Jaydees Apparel. Flow: research, personalize, send three touches over nine days, then the client takes over warm leads.

## Research before writing

Every message starts from gathered context, never a generic blast:

- **Hunter.io data.** Company name, domain, decision-maker name and title, industry, verified email.
- **Website scan.** What they do, services, recent events or news, brand presence.
- **Community signals.** Sponsorships, charity work, causes they support. These are the natural bridges to [Wear It Forward](../topics/wear-it-forward.md).

## Voice

Messages sound like a real person at a local business ([Ellie](../people/ellie.md)) with a genuine reason to reach out this week: warm, direct, confident, first names, no jargon, local community values woven in naturally. Never salesy or corporate, and never apologetic about emailing. Confident never means pushy: no guilt trips, no fake scarcity, no invented discounts. The only urgency permitted is the real calendar (see below). Revised 2026-08-11 after July's 1.5 percent reply rate; the original "friendly first, no pressure" voice is retired (see [messaging impact and urgency](../decisions/messaging-impact-and-urgency.md)).

The LinkedIn note is unchanged: a short personalized note, no pitch. "Hi [name], I came across [their org] and love what you're doing with [specific thing]. Would love to connect."

## Message structure

1. **Open with a specific observation** about their business, then why it matters right now for the coming season.
2. **Wear It Forward bridge.** Community impact as a genuine differentiator, not the headline.
3. **Direct ask.** One specific question the reader can answer in one line, for example "Want me to put a no-obligation fall quote together for you this week?". Soft closers ("worth a quick chat?", "just checking in", "no worries if not", "no pressure") are banned and fail validation.

## Real-calendar urgency (2026-08-11)

Every touch anchors to the season the prospect is buying into: custom apparel has real production lead times, so an order conversation that starts this week means gear in hand before the season, and one that starts in a month may not. The copy must make that concrete for the specific prospect (crew back on site, league starting, staff in front of customers). Never permitted: invented discounts, deadlines Jaydees did not set, claims that Jaydees is "closing a production window", or "spots filling up". The deadline belongs to the prospect's season, not to us.

## A/B message angles (2026-08-11)

Each lead is deterministically assigned one of two angles (hash of the ClickUp task id) and tagged `angle:deadline` or `angle:direct-ask` on the task:

- **deadline**: Touch 1 opens with the seasonal lock-in window and the lead-time math, then personalizes.
- **direct-ask**: Touch 1 opens with the personalized observation and goes straight to the quote question; the timing argument arrives in Touch 2.

Reply performance per angle is read by filtering ClickUp on the `angle:` tag against the `interest:` tags set by the reply poller. This is the first controlled messaging comparison in the engagement.

## Four personalization layers

Segment template (value prop per segment), business context (their name, what they do, their situation), community signals (their visible involvement connected to Wear It Forward), and seasonal timing (see [seasonal playbook](../topics/seasonal-playbook.md)). As of 2026-07-22 the seasonal layer is computed deterministically from the send date — the agent sells the season that is *coming* for the current period, never one inferred by the model.

## Content guardrails (2026-07-22)

Hard limits on what the agent may say, enforced in code, not just prompt guidance (see [personalization content guardrails](../decisions/personalization-content-guardrails.md)):

- **Generic apparel only.** Copy offers "custom apparel" / "branded apparel" and never names a specific product, garment, style, fabric, colour, or price. The segment varies the message, not the product.
- **The concrete offer is a no-obligation quote**, not a free mockup. The agent never states or estimates a price.
- **Correct season only.** Each period allows one selling-season word; the others fail validation and force a regenerate.
- **Every touch ends on a real question** (2026-08-11): each body must contain a question and must not contain a soft closer ("worth a quick chat", "just checking in", "no worries if", "no pressure", and similar), and must carry Ellie's sign-off.

A draft breaking any of these is regenerated (up to three tries per run) before it can reach the queue.

## Credibility claims per segment

- Schools: "We work with over 100 schools in the Lower Mainland."
- Teams: "We've helped teams raise thousands through apparel-based fundraising, no inventory, no hassle."
- Businesses: "We frequently work with businesses with anywhere from 12 to 250 plus employees."

These claims come from the framework deck; they are positioned as authentic social proof without name-dropping.

## The three-touch sequence

- **Day zero, why now.** Specific observation, the seasonal why-now, Wear It Forward, and the direct quote question.
- **Day four, value plus timeline.** One genuinely useful, specific idea for their situation, then an honest restatement that the seasonal window is shrinking, and the ask again in fresh words.
- **Day nine, break-up.** Ellie is wrapping up her seasonal outreach list and closes the file unless they say otherwise: one-line recap, a genuinely easy out, one final yes-or-no question. Replaced the "friendly check-in" (2026-08-11); a break-up email is more honest than a third nudge and is the highest-reply touch in cold outreach.

No response after touch three puts the lead in a ninety-day cool-off. LinkedIn connection requests are short, personal, and not a pitch; the client sends them manually to keep them human.

## Client control

Every message lands in the ClickUp queue before sending. Options: approve, edit, reject, or flag "I know this person" (switches to a warm intro). Client feedback tunes the AI to match their voice over time. See [Daily approval workflow](daily-approval-workflow.md).

## Related pages

- [Lead generation system](lead-generation-system.md)
- [Ellie, the outreach persona](../people/ellie.md)
- [Messaging impact and urgency](../decisions/messaging-impact-and-urgency.md)
- [Personalization content guardrails](../decisions/personalization-content-guardrails.md)
- [Anti-AI-writing guardrails](../decisions/anti-ai-writing-guardrails.md)
- [Seasonal playbook](../topics/seasonal-playbook.md)
- [Wear It Forward](../topics/wear-it-forward.md)
- [Target market](../topics/target-market.md)
