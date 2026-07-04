# Go-Live Status & Session Handoff — 2026-07-03

Living handoff for the ShopJayDees lead-gen deployment. Updated through the
2026-07-03 session (dry run → `.env`/ClickUp/GCP prep → safe-deploy design).

Related: deploy runbook `pipeline/deploy/README.md`; reply-poll design/plan
`docs/superpowers/{specs,plans}/2026-06-29-instantly-reply-poll-agent*`;
deployment wiring `docs/superpowers/{specs/2026-06-30-deployment-design.md,plans/2026-06-30-deployment-wiring.md}`.

---

## ▶ RESUME HERE (next session)

**Two things are owed by Cody before deploy can start:**
1. `FIRECRAWL_API_KEY` — real value from the Firecrawl dashboard → into `pipeline/.env` (last placeholder secret).
2. Top up **Gemini billing** in AI Studio (https://ai.studio/projects → `shop-jaydees-lead-gen`) — the key works but the paid tier's prepayment credits are depleted, so Gemini calls currently 429.

**Then the immediate next step is a decision, not code:** Cody gives the explicit
go-ahead on the **safe-deploy design** (§4 below). On approval:
- Write the design up as `docs/superpowers/specs/2026-07-03-safe-deployment-design.md` and commit (this was in progress — brainstorming reached "present design", not yet written/approved).
- Then run **Phase 1** (bootstrap → secrets → deploy 5 functions, private, **no schedulers**).

Nothing touches GCP until the design is approved.

---

## 1. What this session accomplished

- **Dry run** of the deploy readiness (build ✅, `bash -n` on all scripts ✅).
- **Fixed 2 failing tests** — `tests/send.test.ts` hardcoded `Business - 2026-06`; code derives the current month (`src/index.ts:1110`), so they broke on the July rollover. Now derive the month dynamically → **217/217 green**, no production change.
- **Resolved the 2 carried-forward wiki lint findings** (discovery-stack consistency + Unibox→API-polling) across 7 wiki pages; logged in `wiki/log.md`.
- **`.env` brought almost to complete** (see §3) — token rotated, ClickUp fields created/backfilled, owner ID + Gemini + Instantly keys in.
- **ClickUp:** created the missing `Outreach Started Date` field; found Jenn's user ID.
- **GCP:** created a restricted Gemini API key; discovered the real project already exists; fixed the project-ID mismatch in the deploy scripts; generated `env.yaml`.
- **Designed the safe rollout** (§4) via brainstorming — 3 key decisions locked.

## 2. Environment facts (confirmed this session)

- **GCP project:** real ID is **`shop-jaydees-lead-gen`** (# 511192368881), **billing enabled**. (The deploy scripts previously hardcoded the wrong `shopjaydees-leadgen` — now fixed.)
- **ClickUp:** the `.env` `pk_` token (Cody's, user 216019014) is the credential for all ShopJaydees ClickUp work. The ClickUp **MCP** is connected to a *different* workspace (SixOhQuad) and **cannot** reach the leads list — use the REST API via the token, not MCP.
  - Leads list `901417162427`, Prospecting list `901417162428`, team `90141078100`.
  - **Jenn** = user `204037863` (`hello@shopjaydees.com`, owner) → `CLICKUP_OWNER_USER_ID`.
  - Fields created this session: `Last Reply Date` `44553125-1969-4c2b-a032-2cade999bed8`, `Outreach Started Date` `b5635cf8-7951-43d5-b621-811fffd2f7eb`.
- **Gemini:** key `fee918e5-…` in `shop-jaydees-lead-gen`, restricted to `generativelanguage.googleapis.com`. Authenticates, but **AI Studio prepayment credits depleted → 429** until topped up.
- **Instantly:** key validated (Bearer auth, `GET /api/v2/campaigns` → 0 campaigns, expected pre-launch).

## 3. `pipeline/.env` state

| Var | State |
| --- | --- |
| `CLICKUP_API_TOKEN` | ✅ rotated to valid token this session (old one was revoked) |
| `HUNTER_API_KEY` | ✅ real |
| `GEMINI_API_KEY` | ✅ real (⚠️ needs AI Studio billing top-up to actually call) |
| `INSTANTLY_API_KEY` | ✅ real & validated |
| `CLICKUP_OWNER_USER_ID` | ✅ `204037863` |
| all ClickUp list/field IDs | ✅ complete (incl. the 2 new date fields) |
| `FIRECRAWL_API_KEY` | ❌ still `fc-xxx…` placeholder — **Cody to supply** |

`loadConfig()` passes on all **required** vars. `env.yaml` (56 non-secret vars) is
generated and clean. `.env` and `env.yaml` are gitignored.

## 4. Safe-deploy design (agreed decisions + phased plan)

**Decisions locked with Cody:**
1. **Environment:** deploy to the live `shop-jaydees-lead-gen` project against the live ClickUp list, but gate with the built-in **DRY_RUN** mechanism — no duplicate/test infra.
2. **Execution:** Claude runs the scripted steps; **Cody approves each promotion** to live writes/sends.
3. **Pre-warmup:** **prime the pipeline** — discovery + personalize + reply-poll go live before warmup so Jenn builds an approved-lead backlog; **send stays hard-gated on mailbox warmup** (~mid-July).

**Safety mechanisms (already built into the code/scripts):**
- No scheduler = no automatic runs; `deploy-functions` and `deploy-schedulers` are separate steps.
- Per-invocation `dry_run`: `curl … -d '{"dry_run": true}'` runs full real logic against live data but performs **zero external writes** (`src/index.ts:430`). Scheduler POSTs carry an empty body → live.
- Functions private (no unauthenticated); scheduler retries = 0; **kill switch** = `gcloud scheduler jobs pause <job>`.

**Phases:**
- **Phase 0 — Prereqs (Cody):** GCP project+billing ✅ · owner id/Gemini/Instantly keys ✅ · `config.sh`/`env.yaml` ✅ · **Firecrawl key ⬜ · Gemini billing top-up ⬜**.
- **Phase 1 — Deploy, no schedulers (Claude runs, Cody approves start):** `bootstrap.sh` → `setup-secrets.sh` → `deploy-functions.sh` (all 5, private). Gate: all deploy, URLs resolve, nothing triggers.
- **Phase 2 — Dry-run validation (`{"dry_run": true}` per agent; Cody reviews logs):** verify each agent's behavior with zero writes. Bonus: reply-poll dry-run against real Instantly data validates the 2 open go-live flags (raw `/emails` field names + bounce reconciliation) for free.
- **Phase 3 — Controlled live prime:** one live Prospecting Request through discovery → personalize; enable reply-poll (read/flag only). Gate: ClickUp looks right; Jenn starts daily approvals. **`send` not invoked live.**
- **Phase 4 — Schedulers minus send:** `deploy-schedulers.sh`, then immediately `gcloud scheduler jobs pause send-job`. discover/personalize/dormancy/replyPoll now on cron; send scheduler exists but paused.
- **Phase 5 — Gated send (after warmup, Cody gates hard):** confirm warmup done → start-small 5–10 lead live send batch (per `start-small-then-scale` decision) → watch deliverability + reply flow → `resume send-job` → full volume.

## 5. Still-open go-live validation (from earlier, needs live traffic)

- Confirm raw `/emails` field names in `normalizeEmail` (reply-poll) — validated for free in Phase 2.
- **Bounce reconciliation not yet functional** (daemon bounces resolve to daemon address → land in `noMatch` safely) — needs a real bounce payload.
- Unsubscribes intentionally out of scope.

## 6. Uncommitted working-tree changes (branch `main`)

Nothing committed this session. Modified (git-visible):
- `wiki/` — 7 pages + `wiki/log.md` (lint fixes)
- `leadgeneration/pipeline/tests/send.test.ts` (date-coupling fix)
- `leadgeneration/pipeline/deploy/config.sh`, `deploy/README.md` (project-ID fix)
- this handoff doc (untracked)

Gitignored, not committed: `pipeline/.env` (token + keys + field IDs), `pipeline/env.yaml`.

**Decision pending:** whether to commit the wiki + test + config.sh fixes, or leave staged for review.
