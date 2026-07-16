# ShopJayDees Lead-Gen — Google Cloud Resources

Inventory of everything deployed to Google Cloud for the lead-generation pipeline. Captured 2026-07-16 (full autonomous deployment).

- **Project:** `shop-jaydees-lead-gen` (number `511192368881`)
- **Region:** `us-west1`
- **Console:** set the project picker to `shop-jaydees-lead-gen`, or use the pre-scoped links below.

## Core resources

### Cloud Functions (Gen2) — 5, all ACTIVE
`discover` · `personalize` · `send` · `dormancyCheck` · `replyPoll`
- Console: https://console.cloud.google.com/functions/list?project=shop-jaydees-lead-gen
- A function's **Logs** tab shows every run; **Source** the deployed code; **Metrics** invocations/errors.
- All are private (`--no-allow-unauthenticated`), run as `runtime-sa`, and load config from `env.yaml` (non-secret vars) + Secret Manager (keys).

### Cloud Run services — 5 (these *are* the Gen2 functions)
Gen2 functions run on Cloud Run under the hood: `discover`, `personalize`, `send`, `dormancycheck`, `replypoll`. Managed via the Functions screen; listed here if you need the raw service.
- Console: https://console.cloud.google.com/run?project=shop-jaydees-lead-gen

### Cloud Scheduler jobs — 5, all ENABLED (the automation)
| Job | Schedule (America/Vancouver) |
| --- | --- |
| `discover-job` | `0 4 * * 1-5` — 4:00am weekdays |
| `personalize-job` | `0 5 * * 1-5` — 5:00am weekdays |
| `send-job` | `0 9 * * 1-5` — 9:00am weekdays |
| `dormancyCheck-job` | `0 6 * * 0` — 6:00am Sundays |
| `replyPoll-job` | `*/20 7-21 * * *` — every 20 min, 7am–9pm daily |

- Console: https://console.cloud.google.com/cloudscheduler?project=shop-jaydees-lead-gen
- **Kill switch:** ⋮ → **Pause** on any job stops that stage running on its own. **Force run** triggers on demand. Each job POSTs (empty body = live run) to its function via OIDC as `scheduler-sa`; retries = 0.

### Secret Manager — 5 secrets (API keys)
`clickup-api-token` · `hunter-api-key` · `firecrawl-api-key` · `gemini-api-key` · `instantly-api-key`
- Console: https://console.cloud.google.com/security/secret-manager?project=shop-jaydees-lead-gen
- Rotate: add a new version; functions read `:latest` and pick it up on next cold start (or redeploy to force).

### Service accounts — 2 we created (+ Google-managed defaults)
- `runtime-sa@shop-jaydees-lead-gen.iam.gserviceaccount.com` — identity the functions run as.
- `scheduler-sa@shop-jaydees-lead-gen.iam.gserviceaccount.com` — identity Cloud Scheduler uses to invoke the private functions.
- Console: https://console.cloud.google.com/iam-admin/serviceaccounts?project=shop-jaydees-lead-gen
- Leave the Google-managed defaults (`appspot`, `…-compute`, `ais-gemini-key-…`).

## Supporting resources (auto-created by deploys)

- **Logs Explorer** (where to see what happened) — https://console.cloud.google.com/logs/query?project=shop-jaydees-lead-gen — best place to check "did the 5am run work?"
- **Cloud Build** (build history per deploy) — https://console.cloud.google.com/cloud-build/builds?project=shop-jaydees-lead-gen
- **Artifact Registry** (function container images) — https://console.cloud.google.com/artifacts?project=shop-jaydees-lead-gen
- **Cloud Storage** (function source + build staging, `gcf-sources-…` / `…_cloudbuild`) — https://console.cloud.google.com/storage/browser?project=shop-jaydees-lead-gen
- **Org Policies** — the project-scoped `allowAll` exception on `iam.allowedPolicyMemberDomains` applied to permit the deploy — https://console.cloud.google.com/iam-admin/orgpolicies?project=shop-jaydees-lead-gen

## Deploy tooling (in this repo)
`leadgeneration/pipeline/deploy/`: `bootstrap.sh` (APIs, SAs, IAM), `setup-secrets.sh` (secrets from `.env`), `deploy-functions.sh [target]` (deploy/redeploy functions from `env.yaml`), `deploy-schedulers.sh` (create/update the 5 crons), `config.sh` (project/region/SA/cron table). Non-secret config lives in `pipeline/env.yaml` (gitignored); keys in `pipeline/.env` (gitignored). See `deploy/README.md`.

## Not in Google Cloud (external systems)
- **ClickUp** — the pipeline's data + human approval workspace (prospects, drafts, CRM).
- **Instantly** — sending, campaigns, mailbox warmup.
- **Hunter.io** — discovery/enrichment credits (Starter plan, annual).
- **Gemini API key** — issued via AI Studio (ai.studio); stored here as the `gemini-api-key` secret; billing on this GCP project.
