---
title: Autonomous Pipeline Deployment (Gates Removed)
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-07-16
updated: 2026-07-16
tags: [deployment, automation, schedulers, send, go-live]
---

# Autonomous Pipeline Deployment (Gates Removed)

**Decision (2026-07-16, Cody):** deploy the lead-gen pipeline to run fully on its own — all five Cloud Scheduler crons enabled, including `send` — with Jenn's ClickUp approval as the only remaining gate.

## Why

The project had been treated as handed off ("runs every morning at 5am"), but **the schedulers had never been deployed** — Phase 4 was gated at go-live and never completed. A Youth Sports/Surrey prospecting ticket created 2026-07-15 sat untouched in `requested` because nothing was triggering discovery. The pipeline only ever ran when a function was invoked by hand. With the engagement now in its ongoing [maintenance & reporting phase](maintenance-and-reporting-phase.md), it needs to run unattended.

## What was decided and done

- **All 5 Cloud Scheduler jobs deployed and ENABLED** (America/Vancouver): discover 4am, personalize 5am, send 9am (weekdays), dormancy Sun 6am, replyPoll every 20 min 7am–9pm.
- **The send gate is removed:** `send-job` is enabled (not paused). Approved leads send automatically at 9am. This is safe because mailbox warmup is at 100 and the send path was validated with the first live sends on 2026-07-15 ([Monark/Blue Pine](../overview.md)).
- All 5 functions were redeployed on the latest code first, so the fleet is consistent.

## The one gate that stays (deliberate)

**Jenn's ClickUp approval** before any lead sends. Nothing is emailed until she moves a lead to `Approved`. Removing this would send unreviewed cold email, which is not wanted — it is the human checkpoint, not an automation blocker. This preserves the human-in-the-loop principle the whole system was designed around.

## Consequences / operator notes

- Kill switch for any stage: Cloud Scheduler → pause the job.
- Two operational to-dos remain on Cody's side (not blockers): enable Instantly open-tracking; establish the `Lead Source = AI Outreach` tagging habit for [monthly-report](maintenance-and-reporting-phase.md) attribution.
- Full GCP resource inventory + console links: `leadgeneration/docs/gcp-resources.md`. Deployment status: `leadgeneration/docs/2026-07-03-go-live-status-and-session-handoff.md`.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Transition to maintenance & reporting phase](maintenance-and-reporting-phase.md)
- [Start small then scale](start-small-then-scale.md)
- [Daily approval workflow](../systems/daily-approval-workflow.md)
