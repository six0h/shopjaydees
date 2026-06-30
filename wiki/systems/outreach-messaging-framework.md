---
title: Outreach Messaging Framework
type: wiki-page
category: system
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
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

Messages sound like a local business owner reaching out to another: friendly first, warm, direct, casual (first names, no jargon), professional but not stiff, with local community values woven in naturally. Never salesy or corporate. The design spec sets the tone priority order as friendly, then professional, then casual, then community. Sample emails are signed "Jay, Jaydees Apparel".

The design spec's LinkedIn template: a short personalized note, no pitch. "Hi [name], I came across [their org] and love what you're doing with [specific thing]. Would love to connect."

## Message structure

1. **Open with value.** What Jaydees does for their specific type of organization, referencing the business directly.
2. **Wear It Forward bridge.** Community impact as a genuine differentiator, not the headline.
3. **Soft ask.** "Worth a quick chat?" No pressure or urgency tactics.

## Four personalization layers

Segment template (value prop per segment), business context (their name, what they do, their situation), community signals (their visible involvement connected to Wear It Forward), and seasonal timing (what is relevant now; see [seasonal playbook](../topics/seasonal-playbook.md)).

## Credibility claims per segment

- Schools: "We work with over 100 schools in the Lower Mainland."
- Teams: "We've helped teams raise thousands through apparel-based fundraising, no inventory, no hassle."
- Businesses: "We frequently work with businesses with anywhere from 12 to 250 plus employees."

These claims come from the framework deck; they are positioned as authentic social proof without name-dropping.

## The three-touch sequence

- **Day zero, intro.** Personalized value prop plus Wear It Forward plus a soft call to action.
- **Day four, value.** Share something genuinely useful for their situation, for example how similar schools use spirit wear as ongoing fundraisers. No hard sell.
- **Day nine, open door.** Brief friendly check-in from a different angle, lighter tone, genuinely leaving the door open.

No response after touch three puts the lead in a ninety-day cool-off. LinkedIn connection requests are short, personal, and not a pitch; the client sends them manually to keep them human.

## Client control

Every message lands in the ClickUp queue before sending. Options: approve, edit, reject, or flag "I know this person" (switches to a warm intro). Client feedback tunes the AI to match their voice over time. See [Daily approval workflow](daily-approval-workflow.md).

## Related pages

- [Lead generation system](lead-generation-system.md)
- [Wear It Forward](../topics/wear-it-forward.md)
- [Target market](../topics/target-market.md)
