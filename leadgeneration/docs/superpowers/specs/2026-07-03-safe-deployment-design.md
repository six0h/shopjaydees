# Safe-Deployment Design — ShopJayDees Lead-Gen Pipeline

**Date:** 2026-07-03
**Status:** Design agreed in brainstorming (3 decisions locked with Cody); phased
rollout pending Cody's explicit go-ahead per phase.
**Scope:** *How* to roll the already-built pipeline into live operation safely —
without duplicate/test infrastructure, without automatic runs, and without any
external send until mailbox warmup completes.

Companion to the deployment *wiring* design (`2026-06-30-deployment-design.md`),
which specifies the scripts and infrastructure. This document specifies the
**order, gating, and safety envelope** for using them against live data.

Related: deploy runbook `pipeline/deploy/README.md`; living handoff
`docs/2026-07-03-go-live-status-and-session-handoff.md`.

---

## Goal

Take the merged, tested pipeline (5 Cloud Functions + deploy scripts, 217 tests
green) from "built" to "operating against live ClickUp/Instantly/Hunter data" in
controlled, individually-approved steps — such that at every step the blast radius
is understood and no irreversible external action (email send, bulk ClickUp
mutation) happens before it is explicitly gated open.

## Decisions (locked with Cody during brainstorming)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Environment | Deploy to the **live** `shop-jaydees-lead-gen` project against the **live** ClickUp list, gated by the built-in **DRY_RUN** mechanism | No duplicate/test infra to build or keep in sync; `dry_run` already exercises full real logic against live data with zero external writes. |
| 2 | Execution model | **Claude runs** the scripted steps; **Cody approves each promotion** to live writes/sends | Human gate on every irreversible boundary; automation only for mechanical steps. |
| 3 | Pre-warmup posture | **Prime the pipeline** — discovery + personalize + reply-poll go live *before* warmup so Jenn builds an approved-lead backlog; **send stays hard-gated on mailbox warmup** (~mid-July) | Front-loads the human-in-the-loop approval work so there's a ready backlog the moment sending is allowed; keeps the one irreversible action (send) locked until deliverability is safe. |

## Safety mechanisms (already built into code/scripts — nothing new to build)

- **No scheduler = no automatic runs.** `deploy-functions.sh` and
  `deploy-schedulers.sh` are separate steps. Functions can exist and be invoked
  manually long before any cron is attached.
- **Per-invocation `dry_run`.** `curl … -d '{"dry_run": true}'` runs the full real
  logic against live data but performs **zero external writes**
  (`src/index.ts:430`). Scheduler POSTs carry an empty body → live path. So the
  same deployed function is safe-by-request or live-by-request with no redeploy.
- **Functions private.** All deploy with `--no-allow-unauthenticated`; only
  `scheduler-sa` and operators with invoker rights can call them.
- **Scheduler retries = 0.** Idempotent, self-healing; the next scheduled run
  handles any remainder.
- **Kill switch.** `gcloud scheduler jobs pause <job>` halts any agent instantly
  without touching code or functions.
- **Graceful Firecrawl degradation.** If `FIRECRAWL_API_KEY` is absent/placeholder
  or the scrape errors, `discover` proceeds with Hunter.io data only
  (`src/index.ts:807`) — the missing key never blocks a deploy or a discover run.

## Phased rollout

Each phase has an explicit **gate** that must be met (and, per Decision 2,
approved by Cody) before the next begins.

### Phase 0 — Prereqs (Cody)
- GCP project + billing ✅
- owner id / Gemini / Instantly / Hunter keys ✅
- `config.sh` / `env.yaml` ✅
- **Firecrawl key ⬜** — real value → `pipeline/.env` (only affects `discover`
  scrape enrichment; degrades gracefully until supplied).
- **Gemini billing top-up ⬜** — key authenticates but AI Studio prepayment
  credits are depleted → `personalize` (Gemini generation) 429s until topped up.

**Gate:** neither prereq blocks *deploy* or the reply-poll/dormancy/discover(Hunter)
dry-runs. They gate only `personalize` (Gemini) and live `discover` scrape.

### Phase 1 — Deploy, no schedulers *(Claude runs, Cody approves start)*
`bootstrap.sh` → `setup-secrets.sh` → `deploy-functions.sh` (all 5, private).
Uses the placeholder Firecrawl secret; no external calls happen at deploy time.

**Gate:** all 5 functions deploy; URLs resolve; nothing is triggered.

### Phase 2 — Dry-run validation *(Cody reviews logs)*
`{"dry_run": true}` per agent; verify each agent's behavior with zero writes.
- `dormancyCheck`, `replyPoll` — fully validated now (no external-gen dependency).
- `replyPoll` dry-run against real Instantly data **validates the 2 open go-live
  flags for free** (raw `/emails` field names in `normalizeEmail`; bounce
  reconciliation path).
- `discover` — Hunter path validated; scrape path exercises the graceful-fallback
  branch until the Firecrawl key lands.
- `personalize` — **deferred** until Gemini billing is topped up (dry-run still
  calls Gemini for generation, which is not a "write" and will 429).

**Gate:** logs show correct behavior, zero external writes.

### Phase 3 — Controlled live prime *(Cody approves)*
One live Prospecting Request through `discover` → `personalize` (live writes);
enable `replyPoll` in read/flag-only mode.

**Gate:** ClickUp looks right; Jenn starts daily approvals. **`send` never
invoked live.**

### Phase 4 — Schedulers minus send *(Cody approves)*
`deploy-schedulers.sh`, then immediately `gcloud scheduler jobs pause send-job`.
discover / personalize / dormancy / replyPoll now on cron; the send scheduler
exists but is paused.

**Gate:** crons fire on schedule; send-job confirmed paused.

### Phase 5 — Gated send *(after warmup; Cody gates hard)*
Confirm warmup done → start-small 5–10-lead live send batch (per the
`start-small-then-scale` decision) → watch deliverability + reply flow →
`resume send-job` → full volume.

**Gate:** deliverability healthy on the small batch.

## Current position

- Code/infra: **built and merged** (5 functions + deploy scripts, 217 tests green).
- `.env` / `env.yaml`: complete except the Firecrawl placeholder; `loadConfig()`
  passes all required vars.
- **Nothing has touched live GCP yet.** Awaiting Cody's go-ahead to start Phase 1.
- The two Phase-0 prereqs (Firecrawl key, Gemini billing) gate only the
  personalize/discover-scrape paths — **Phases 1, 2 (dormancy/reply-poll/discover),
  and the deploy itself do not depend on them.**

## Out of scope

- Duplicate/staging GCP project or ClickUp list (Decision 1 — use dry_run instead).
- Automatic deploy triggers / CI (covered by the wiring design's YAGNI section).
- Unsubscribe handling (intentionally out of scope for go-live).
