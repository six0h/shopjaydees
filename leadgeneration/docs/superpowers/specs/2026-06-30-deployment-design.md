# Deployment Design — ShopJayDees Lead-Gen Pipeline

**Date:** 2026-06-30
**Status:** Approved (design); implementation plan pending
**Scope:** Stand up repeatable deployment of the five Cloud Functions and their
Cloud Scheduler triggers. No deploy wiring exists in the repo today.

---

## Goal

A clean, repeatable, idempotent way to deploy all five Google Cloud Functions and
their Cloud Scheduler jobs into the `shopjaydees-leadgen` GCP project. Re-running
the deploy converges infrastructure to the desired state without manual cleanup.

The architecture is already fully specified in prior specs
(`2026-06-08-spec-review-resolutions.md`, `2026-06-08-api-contracts.md`,
`2026-06-29-instantly-reply-poll-agent-design.md`). This document wires up what
those specs prescribe; it does not redesign the agents.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| GCP project | `shopjaydees-leadgen` | Per spec; dedicated client-owned project, hosting billed to client (~$0–5/mo). |
| Tooling | Idempotent **gcloud bash scripts** | Small static infra (~5 functions + 5 schedulers + 2 SAs); team already on gcloud; no state backend to manage. Terraform/Cloud Build rejected as overkill (YAGNI). |
| Secrets | **Hybrid** — Secret Manager for the 5 API keys, `env.yaml` for the ~61 non-secret vars | API keys never sit in plaintext files or show in function config; field UUIDs/constants aren't sensitive so don't warrant secret overhead. |
| Functions generation | **Gen2** (Cloud Run-backed) | Current GCP standard; `--set-secrets`, concurrency knobs, longer timeouts. Gen1 is legacy. |
| Region | `us-west1` | Per spec (`GCP_REGION=us-west1`). |
| Runtime | `nodejs20` | Per spec; matches `engines.node >=20`. |

## Function inventory

All five are registered as named HTTP targets via `ff.http(...)` in
`pipeline/src/index.ts`, compiled to `dist/index.js`. Each deploys from the same
source, selected by `--entry-point`.

| Target | Memory | Timeout | Schedule (cron) | Timezone | Cadence |
|---|---|---|---|---|---|
| `discover` | 512 MB | 540s | `0 4 * * 1-5` | America/Vancouver | 4:00 AM Mon–Fri |
| `personalize` | 512 MB | 540s | `0 5 * * 1-5` | America/Vancouver | 5:00 AM Mon–Fri |
| `send` | 256 MB | 300s | `0 9 * * 1-5` | America/Vancouver | 9:00 AM Mon–Fri |
| `dormancyCheck` | 256 MB | 120s | `0 6 * * 0` | America/Vancouver | 6:00 AM Sunday |
| `replyPoll` | 256 MB | 300s | `*/20 7-21 * * *` | America/Vancouver | ≈every 20 min, 7:00 AM–9:40 PM, **daily** |

Common to all functions: `--max-instances=1`, `--concurrency=1`,
`--trigger-http`, `--no-allow-unauthenticated`.

**replyPoll cron note:** `*/20 7-21 * * *` fires at :00/:20/:40 from 07:00 through
21:40 (last fire 9:40 PM). For a hard 9:00 PM stop, use `*/20 7-20 * * *` (last fire
8:40 PM). The inclusive `7-21` form is the chosen default.

## Cost estimate (monthly)

~1,350 replyPoll runs/mo + ~70 runs/mo for the other four ≈ 1,420 invocations/mo.

| Line item | Estimate | Basis |
|---|---|---|
| Function invocations | $0 | ~1,420/mo vs 2M/mo free tier |
| Function compute (vCPU-s + GiB-s) | $0 | ~38k vCPU-s & ~12k GiB-s/mo vs 180k / 360k free tiers; runs are short |
| Cloud Scheduler | ~$0.20 | 5 jobs; first 3 free, $0.10/job after → 2 billable |
| Secret Manager | ~$0.32 | 5 secrets × $0.06 + trivial access ops |
| Artifact Registry (image storage) | ~$0.10–0.50 | function container images |
| Cloud Build (redeploys only) | ~$0 | within 120 build-min/day free tier |
| Egress | pennies | small API payloads |

**Total ≈ $0.60–1.00/month**, within the spec's "$0–5/mo" client estimate. The
wide daily replyPoll window is effectively free because compute stays inside the
free tier.

---

## Architecture

### Artifacts (new files under `pipeline/`)

```
pipeline/
  deploy/
    config.sh             # single source of truth (project, region, runtime, SAs, per-function table)
    bootstrap.sh          # one-time: enable APIs, create service accounts, assign roles
    setup-secrets.sh      # create/update the 5 Secret Manager secrets from a local source; grant accessor
    deploy-functions.sh   # idempotent: loop the function table, gcloud functions deploy each
    deploy-schedulers.sh  # idempotent create-or-update of the 5 scheduler jobs
    README.md             # prerequisites + run order
  env.yaml                # gitignored: ~61 non-secret vars, generated from .env
  .gcloudignore           # exclude node_modules, tests, .env, dist from upload as needed
```

### `config.sh`

Sourced by the other scripts. Holds:
- `PROJECT=shopjaydees-leadgen`, `REGION=us-west1`, `RUNTIME=nodejs20`
- `SCHEDULER_SA` and `RUNTIME_SA` email identities
- A per-function table mapping target → memory, timeout, cron, timezone. Bash
  associative arrays (or a newline-delimited table parsed in a loop) so both
  `deploy-functions.sh` and `deploy-schedulers.sh` iterate the same source.

### `deploy-functions.sh`

For each function target, runs:

```
gcloud functions deploy <target> \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-west1 \
  --project=shopjaydees-leadgen \
  --source=. \
  --entry-point=<target> \
  --trigger-http \
  --no-allow-unauthenticated \
  --run-service-account=<RUNTIME_SA> \
  --memory=<mem> \
  --timeout=<timeout> \
  --max-instances=1 \
  --concurrency=1 \
  --set-secrets='CLICKUP_API_TOKEN=clickup-api-token:latest,HUNTER_API_KEY=hunter-api-key:latest,FIRECRAWL_API_KEY=firecrawl-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,INSTANTLY_API_KEY=instantly-api-key:latest' \
  --env-vars-file=env.yaml
```

`gcloud functions deploy` is upsert by nature, so re-running redeploys cleanly.

### `deploy-schedulers.sh`

For each function, create-or-update an HTTP scheduler job that POSTs to the
function's URL with an OIDC token minted as `scheduler-sa`:

```
gcloud scheduler jobs describe <job> --location=us-west1 >/dev/null 2>&1 \
  && VERB=update || VERB=create
gcloud scheduler jobs $VERB http <job> \
  --location=us-west1 \
  --schedule='<cron>' \
  --time-zone='America/Vancouver' \
  --uri='<function-url>' \
  --http-method=POST \
  --oidc-service-account-email=<SCHEDULER_SA> \
  --oidc-token-audience='<function-url>' \
  --max-retry-attempts=0
```

Scheduler retries are 0 — functions are idempotent and self-healing; the next
scheduled run handles any remainder.

### `bootstrap.sh` (one-time)

1. Confirm/create the `shopjaydees-leadgen` project; ensure billing is linked.
2. Enable APIs: `cloudfunctions`, `run`, `cloudbuild`, `cloudscheduler`,
   `secretmanager`, `artifactregistry`, `eventarc` (Gen2 dependency), `logging`.
3. Create `scheduler-sa` and the function `runtime-sa` service accounts.
4. Grant `scheduler-sa`: `roles/cloudfunctions.invoker` **and** `roles/run.invoker`
   (Gen2 invocation goes through Cloud Run).
5. Grant `runtime-sa`: `roles/secretmanager.secretAccessor` on the 5 secrets.

### `setup-secrets.sh`

Creates the 5 Secret Manager secrets (`clickup-api-token`, `hunter-api-key`,
`firecrawl-api-key`, `gemini-api-key`, `instantly-api-key`) from a local source
(values pulled from `.env`), adding a new version on each run, and grants the
runtime SA `secretAccessor`.

## The build / entry-point fix (one code change to existing files)

The build outputs to `dist/`, but `package.json` has no `main` field, and the GCP
Node buildpack runs the `gcp-build` script (not `build`). Without addressing both,
`--entry-point=<target>` cannot resolve the `ff.http` targets.

Change `pipeline/package.json`:
- add `"main": "dist/index.js"`
- add `"gcp-build": "tsc"` to `scripts`

At deploy, the buildpack runs `gcp-build` → compiles TypeScript → `dist/index.js`
exports the registered targets → `--entry-point=<target>` resolves correctly.

## Security model

- **`scheduler-sa`** — holds only `roles/cloudfunctions.invoker` + `roles/run.invoker`.
  Cloud Scheduler calls each function with an OIDC token minted as this SA.
- **`runtime-sa`** — dedicated least-privilege runtime identity for the functions
  (instead of the default compute SA); granted `secretmanager.secretAccessor` for
  the 5 API-key secrets only.
- All functions deploy with `--no-allow-unauthenticated`; they are not publicly
  reachable. Only `scheduler-sa` (and operators with invoker rights) can call them.

## Idempotency / repeatability

- `gcloud functions deploy` upserts.
- Scheduler jobs use the `describe || create; else update` pattern.
- Re-running any script (or all in order) converges state without manual cleanup.

## Run order

```
gcloud auth login                 # operator prerequisite
./deploy/bootstrap.sh             # one-time: project, APIs, service accounts, roles
./deploy/setup-secrets.sh         # one-time / on key rotation
./deploy/deploy-functions.sh      # deploy/redeploy all five functions
./deploy/deploy-schedulers.sh     # create/update all five scheduler jobs
```

## Out of scope (YAGNI)

- Terraform / state backend.
- CI trigger / push-to-deploy (Cloud Build used only as the Gen2 build engine).
- Pub/Sub triggers (HTTP + Scheduler is sufficient — single caller, no fan-out).
- Separate source directories per function (all five share `dist/index.js`,
  selected by `--entry-point`).

## Known external blockers (not solved by this work)

- The live `.env` / `env.yaml` still needs the ClickUp field UUIDs,
  `CLICKUP_OWNER_USER_ID`, `CLICKUP_FIELD_LAST_REPLY_DATE`, and
  `CLICKUP_FIELD_OUTREACH_STARTED_DATE` populated, plus the two new ClickUp custom
  fields created in the workspace. `loadConfig()` throws on missing required vars,
  so functions will fail to start until these are set.
- Mailbox warmup (~mid-July) gates go-live validation of the reply-poll agent
  (field-name confirmation via `scripts/spike-emails.ts`; bounce reconciliation).
  Independent of deploy wiring.
