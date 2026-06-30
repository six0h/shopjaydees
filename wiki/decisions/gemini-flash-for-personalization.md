---
title: Gemini Flash for Personalization
type: wiki-page
category: decision
status: active
owner: cody
created: 2026-06-11
updated: 2026-06-11
tags: [gemini, llm, design-decision]
sources:
  - file: ingested/documents/2026-05-20-lead-generation-system-design.md
    ingested: 2026-06-11
---

# Decision: Gemini 2.5 Flash for Personalization

The personalization agent runs on Gemini 2.5 Flash. From the key design decisions in the 2026-05-20 design spec.

## Rationale

Template filling and context-aware copy generation do not require frontier-model reasoning. Flash is cost-effective (estimated two to five US dollars per month) and more than capable at this workload, which keeps the pipeline inside the under-$100-per-month budget constraint.

## Related pages

- [Lead generation system](../systems/lead-generation-system.md)
- [Outreach messaging framework](../systems/outreach-messaging-framework.md)
- [Third-party stack](../topics/third-party-stack.md)
