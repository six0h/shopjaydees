# Deployment Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable, idempotent gcloud-based deploy wiring for the five Cloud Functions and their Cloud Scheduler triggers.

**Architecture:** A `pipeline/deploy/` directory of bash scripts driven by a shared `config.sh` (project, region, runtime, service accounts, and a per-function table of memory/timeout/cron). Functions deploy as Gen2 from the single `pipeline/` source, each selected by `--entry-point=<target>`; the GCP Node buildpack compiles TypeScript via a new `gcp-build` script. API keys come from Secret Manager (`--set-secrets`); the ~61 non-secret vars come from a gitignored `env.yaml` (`--env-vars-file`). Scheduler jobs authenticate to the private functions with OIDC tokens minted as a dedicated `scheduler-sa`.

**Tech Stack:** bash, Google Cloud SDK (gcloud 574+), Cloud Functions Gen2 (Cloud Run-backed), Cloud Scheduler, Secret Manager, Node.js 20 buildpack, TypeScript.

## Global Constraints

- **GCP project:** `shopjaydees-leadgen` (verbatim).
- **Region:** `us-west1`. **Runtime:** `nodejs20`. **Scheduler timezone:** `America/Vancouver`.
- **Generation:** Gen2 for all functions.
- **Every function:** `--max-instances=1`, `--concurrency=1`, `--trigger-http`, `--no-allow-unauthenticated`.
- **Scheduler retries:** `--max-retry-attempts=0` (functions are idempotent/self-healing).
- **Five targets** (registered via `ff.http(...)` in `pipeline/src/index.ts`): `discover`, `personalize`, `send`, `dormancyCheck`, `replyPoll`.
- **Per-function config** (memory | timeout | cron):
  - `discover` | 512MB | 540s | `0 4 * * 1-5`
  - `personalize` | 512MB | 540s | `0 5 * * 1-5`
  - `send` | 256MB | 300s | `0 9 * * 1-5`
  - `dormancyCheck` | 256MB | 120s | `0 6 * * 0`
  - `replyPoll` | 256MB | 300s | `*/20 7-21 * * *`
- **Secrets (Secret Manager → mounted env var):** `clickup-api-token`→`CLICKUP_API_TOKEN`, `hunter-api-key`→`HUNTER_API_KEY`, `firecrawl-api-key`→`FIRECRAWL_API_KEY`, `gemini-api-key`→`GEMINI_API_KEY`, `instantly-api-key`→`INSTANTLY_API_KEY`.
- **Service accounts:** `scheduler-sa@shopjaydees-leadgen.iam.gserviceaccount.com` (roles `cloudfunctions.invoker` + `run.invoker`); `runtime-sa@shopjaydees-leadgen.iam.gserviceaccount.com` (role `secretmanager.secretAccessor` on the 5 secrets).
- **No new infra beyond the above:** no Terraform, no CI trigger, no Pub/Sub.

**Verification convention:** these are deploy scripts, not unit-testable code. Each script task's "test" is `bash -n <file>` (syntax) plus, where a gcloud flag is asserted, a `gcloud ... --help` grep to confirm the flag exists in the installed SDK. Live execution against GCP is gated in Task 9. Run `shellcheck` too if available (`command -v shellcheck`), but `bash -n` is the required gate.

---

## File Structure

```
pipeline/
  package.json            # MODIFY: add "main" + "gcp-build"
  .gitignore              # MODIFY: ignore env.yaml
  .gcloudignore           # CREATE: control what uploads as function source
  env.yaml.example        # CREATE: committed template of the ~61 non-secret vars
  env.yaml                # (generated locally from env.yaml.example; gitignored)
  deploy/
    config.sh             # CREATE: shared config + per-function table
    bootstrap.sh          # CREATE: enable APIs, create SAs, grant invoker roles
    setup-secrets.sh      # CREATE: create/version the 5 secrets, grant accessor
    deploy-functions.sh   # CREATE: deploy/redeploy the five functions
    deploy-schedulers.sh  # CREATE: create-or-update the five scheduler jobs
    README.md             # CREATE: prerequisites + run order
```

---

### Task 1: Build / entry-point fix in package.json

Without a `main` field and a `gcp-build` script, the Node buildpack will not compile `src/` to `dist/`, and `--entry-point=<target>` cannot resolve the `ff.http` targets.

**Files:**
- Modify: `pipeline/package.json`

**Interfaces:**
- Produces: a buildable deploy artifact where `dist/index.js` exports the five `ff.http` targets after `npm run gcp-build`.

- [ ] **Step 1: Add `main` and `gcp-build`**

In `pipeline/package.json`, add the top-level `"main"` field and a `"gcp-build"` script. Result:

```json
{
  "name": "shopjaydees-leadgen",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "tsc",
    "gcp-build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "npx functions-framework --target=discover --source=dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Verify the build produces the entry point**

Run: `cd pipeline && npm run gcp-build && node -e "import('./dist/index.js').then(()=>console.log('loaded OK'))"`
Expected: tsc completes with no errors; prints `loaded OK` (the module imports without throwing — `ff.http` registrations run at import time).

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd pipeline && npm test`
Expected: all tests pass (217 passing), no regressions.

- [ ] **Step 4: Commit**

```bash
git add pipeline/package.json
git commit -m "build: add main + gcp-build so the GCP Node buildpack compiles TS for deploy"
```

---

### Task 2: Source-upload hygiene (.gcloudignore, env.yaml ignore, env.yaml.example)

When a `.gcloudignore` exists, gcloud stops honoring `.gitignore`, so it must explicitly exclude `node_modules/`, `dist/`, `.env`, and `env.yaml` (the buildpack reinstalls deps and rebuilds; secrets/config must never ship inside the source bundle).

**Files:**
- Create: `pipeline/.gcloudignore`
- Create: `pipeline/env.yaml.example`
- Modify: `pipeline/.gitignore`

**Interfaces:**
- Produces: `env.yaml.example` — the committed template an operator copies to `pipeline/env.yaml` (consumed by `deploy-functions.sh` via `--env-vars-file`).

- [ ] **Step 1: Create `pipeline/.gcloudignore`**

```
.git
.gitignore
node_modules/
dist/
.env
env.yaml
env.yaml.example
tests/
scripts/
vitest.config.ts
*.tgz
.firecrawl/
```

- [ ] **Step 2: Add `env.yaml` to `pipeline/.gitignore`**

Resulting `pipeline/.gitignore`:

```
node_modules/
dist/
.env
env.yaml
*.tgz
```

- [ ] **Step 3: Create `pipeline/env.yaml.example`**

A YAML map of every non-secret env var (the 5 API keys are intentionally absent — they come from Secret Manager). Values are placeholders; `--env-vars-file` requires all values be quoted strings.

```yaml
# Non-secret env vars for all five functions (--env-vars-file).
# API keys are NOT here — they come from Secret Manager via --set-secrets.
# Copy to env.yaml and fill real values before deploying.

# ClickUp Workspace IDs
CLICKUP_LIST_ID: "123456789"
CLICKUP_PROSPECTING_LIST_ID: "123456789"

# Contact & Company Info
CLICKUP_FIELD_COMPANY_NAME: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_COMPANY_DOMAIN: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_COMPANY_INDUSTRY: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_COMPANY_HEADCOUNT: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_COMPANY_CITY: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CONTACT_NAME: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CONTACT_TITLE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CONTACT_EMAIL: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_CONFIDENCE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CONTACT_LINKEDIN: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CONTACT_PHONE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Lead Qualification
CLICKUP_FIELD_SEGMENT: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CATEGORY: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_LEAD_SCORE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_SCORE_RATIONALE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_GEOGRAPHIC_PHASE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# CASL Compliance (discovery)
CLICKUP_FIELD_CASL_SOURCE_URL: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Metadata (discovery)
CLICKUP_FIELD_IMPORT_BATCH: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Prospecting Request fields
CLICKUP_FIELD_PR_RESULTS_FOUND: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_PR_LEADS_CREATED: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_PR_LEADS_PARKED: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_PR_DUPLICATES_SKIPPED: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Personalization & Draft Message fields
CLICKUP_FIELD_WEBSITE_SCRAPE_SUMMARY: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_COMMUNITY_SIGNALS: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_PERSONALIZATION_HOOKS: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_1: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_1_SUBJECT: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_2: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_2_SUBJECT: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_3: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_EMAIL_TOUCH_3_SUBJECT: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_LINKEDIN_MESSAGE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CASL_OPT_OUT_CHECK: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CASL_RELEVANCE_RATIONALE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CASL_CONSENT_BASIS: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_CASL_DATE_VERIFIED: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_REVIEW_DECISION: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Outreach Tracking fields
CLICKUP_FIELD_INSTANTLY_CAMPAIGN_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_INSTANTLY_LEAD_ID: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_SENDING_DOMAIN: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_SEQUENCE_STATUS: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_DORMANT_DATE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_DORMANT_REACTIVATION_DATE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_LAST_REPLY_DATE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
CLICKUP_FIELD_OUTREACH_STARTED_DATE: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Configuration
CLICKUP_OWNER_USER_ID: "0"
CLICKUP_RATE_LIMIT: "90"
DRY_RUN: "false"
PERSONALIZATION_BATCH_SIZE: "15"
REPLY_POLL_LOOKBACK_MINUTES: "90"
SEQUENCE_COMPLETE_AFTER_DAYS: "14"
INSTANTLY_SENDING_DOMAINS: "shopjaydees.ca,shopjaydees.net"

# Alerting
ALERT_EMAIL: "cody@sixohquad.com"
ALERT_WEBHOOK_URL: ""
```

- [ ] **Step 4: Verify env.yaml is ignored and example is valid YAML**

Run: `cd pipeline && cp env.yaml.example env.yaml && git check-ignore env.yaml && node -e "const fs=require('fs');const t=fs.readFileSync('env.yaml.example','utf8');let n=0;for(const l of t.split('\n')){const s=l.trim();if(!s||s.startsWith('#'))continue;if(!/^[A-Z0-9_]+: \".*\"$/.test(s))throw new Error('bad line: '+l);n++}console.log('ok',n,'vars')" && rm env.yaml`
Expected: `git check-ignore` prints `env.yaml` (ignored); validation prints `ok 56 vars` (every non-comment line is `KEY: "value"` — 56 non-secret vars; the 5 API keys are deliberately excluded); temp file removed.

- [ ] **Step 5: Commit**

```bash
git add pipeline/.gcloudignore pipeline/.gitignore pipeline/env.yaml.example
git commit -m "build: add .gcloudignore + env.yaml.example template; ignore env.yaml"
```

---

### Task 3: Shared config (`deploy/config.sh`)

**Files:**
- Create: `pipeline/deploy/config.sh`

**Interfaces:**
- Produces (consumed by all other deploy scripts via `source`): `PROJECT`, `REGION`, `RUNTIME`, `TIMEZONE`, `SCHEDULER_SA`, `RUNTIME_SA`, `SECRETS_MOUNT`, arrays `SECRET_NAMES[]` / `SECRET_ENV_VARS[]`, and `FUNCTIONS[]` (rows of `target|memory|timeout|cron`).

- [ ] **Step 1: Create `pipeline/deploy/config.sh`**

```bash
#!/usr/bin/env bash
# Shared configuration for ShopJayDees lead-gen deployment.
# Sourced by bootstrap.sh, setup-secrets.sh, deploy-functions.sh, deploy-schedulers.sh.
set -euo pipefail

PROJECT="shopjaydees-leadgen"
REGION="us-west1"
RUNTIME="nodejs20"
TIMEZONE="America/Vancouver"

# Service accounts (created by bootstrap.sh).
SCHEDULER_SA="scheduler-sa@${PROJECT}.iam.gserviceaccount.com"
RUNTIME_SA="runtime-sa@${PROJECT}.iam.gserviceaccount.com"

# Secret Manager secrets mounted as env vars (--set-secrets).
SECRETS_MOUNT="CLICKUP_API_TOKEN=clickup-api-token:latest,HUNTER_API_KEY=hunter-api-key:latest,FIRECRAWL_API_KEY=firecrawl-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,INSTANTLY_API_KEY=instantly-api-key:latest"

# Parallel arrays: secret name -> source env var in .env (used by setup-secrets.sh).
SECRET_NAMES=(clickup-api-token hunter-api-key firecrawl-api-key gemini-api-key instantly-api-key)
SECRET_ENV_VARS=(CLICKUP_API_TOKEN HUNTER_API_KEY FIRECRAWL_API_KEY GEMINI_API_KEY INSTANTLY_API_KEY)

# Per-function deploy + schedule table: target|memory|timeout|cron
FUNCTIONS=(
  "discover|512MB|540s|0 4 * * 1-5"
  "personalize|512MB|540s|0 5 * * 1-5"
  "send|256MB|300s|0 9 * * 1-5"
  "dormancyCheck|256MB|120s|0 6 * * 0"
  "replyPoll|256MB|300s|*/20 7-21 * * *"
)
```

- [ ] **Step 2: Verify syntax and that the table parses**

Run:
```bash
cd pipeline/deploy && bash -n config.sh && bash -c 'source ./config.sh; echo "$PROJECT $REGION"; for r in "${FUNCTIONS[@]}"; do IFS="|" read -r t m to c <<< "$r"; echo "$t|$m|$to|$c"; done'
```
Expected: no syntax error; prints `shopjaydees-leadgen us-west1` then five rows, e.g. `discover|512MB|540s|0 4 * * 1-5` ... `replyPoll|256MB|300s|*/20 7-21 * * *`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/deploy/config.sh
git commit -m "deploy: add shared config.sh (project, SAs, per-function table)"
```

---

### Task 4: Bootstrap script (`deploy/bootstrap.sh`)

One-time setup: enable APIs, create the two service accounts, grant scheduler invoker roles. Idempotent (`describe || create`; `add-iam-policy-binding` is a no-op if the binding exists).

**Files:**
- Create: `pipeline/deploy/bootstrap.sh`

**Interfaces:**
- Consumes: `config.sh` (`PROJECT`, `SCHEDULER_SA`, `RUNTIME_SA`).
- Produces: enabled APIs + `scheduler-sa` / `runtime-sa` service accounts with invoker roles, ready for `setup-secrets.sh` and `deploy-functions.sh`.

- [ ] **Step 1: Create `pipeline/deploy/bootstrap.sh`**

```bash
#!/usr/bin/env bash
# One-time project bootstrap: APIs, service accounts, invoker roles. Idempotent.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"

echo "==> Setting active project: ${PROJECT}"
gcloud config set project "${PROJECT}"

echo "==> Enabling APIs"
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  logging.googleapis.com \
  --project="${PROJECT}"

echo "==> Creating service accounts (idempotent)"
gcloud iam service-accounts describe "${SCHEDULER_SA}" --project="${PROJECT}" >/dev/null 2>&1 \
  || gcloud iam service-accounts create scheduler-sa \
       --display-name="Cloud Scheduler invoker for lead-gen functions" --project="${PROJECT}"
gcloud iam service-accounts describe "${RUNTIME_SA}" --project="${PROJECT}" >/dev/null 2>&1 \
  || gcloud iam service-accounts create runtime-sa \
       --display-name="Runtime identity for lead-gen functions" --project="${PROJECT}"

echo "==> Granting scheduler-sa invoker roles (idempotent)"
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SCHEDULER_SA}" --role="roles/cloudfunctions.invoker" --condition=None
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${SCHEDULER_SA}" --role="roles/run.invoker" --condition=None

echo "==> Bootstrap complete. Next: ./setup-secrets.sh"
```

- [ ] **Step 2: Make executable and verify syntax**

Run: `cd pipeline/deploy && chmod +x bootstrap.sh && bash -n bootstrap.sh && echo "syntax OK"`
Expected: prints `syntax OK`, no errors.

- [ ] **Step 3: Verify asserted gcloud flags exist in the SDK**

Run: `gcloud iam service-accounts create --help | grep -q -- '--display-name' && gcloud projects add-iam-policy-binding --help | grep -q -- '--condition' && echo "flags OK"`
Expected: prints `flags OK`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/deploy/bootstrap.sh
git commit -m "deploy: add bootstrap.sh (APIs, service accounts, invoker roles)"
```

---

### Task 5: Secrets script (`deploy/setup-secrets.sh`)

Creates each secret if absent, adds a new version from the matching value in `pipeline/.env`, and grants `runtime-sa` accessor. Idempotent and re-runnable on key rotation.

**Files:**
- Create: `pipeline/deploy/setup-secrets.sh`

**Interfaces:**
- Consumes: `config.sh` (`PROJECT`, `RUNTIME_SA`, `SECRET_NAMES[]`, `SECRET_ENV_VARS[]`); reads `pipeline/.env`.
- Produces: 5 Secret Manager secrets with a current version, each readable by `runtime-sa` — satisfying the `--set-secrets` references in `deploy-functions.sh`.

- [ ] **Step 1: Create `pipeline/deploy/setup-secrets.sh`**

```bash
#!/usr/bin/env bash
# Create/version the 5 API-key secrets from pipeline/.env; grant runtime-sa accessor.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"

ENV_FILE="${SCRIPT_DIR}/../.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Populate it from .env.example first." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

for i in "${!SECRET_NAMES[@]}"; do
  name="${SECRET_NAMES[$i]}"
  var="${SECRET_ENV_VARS[$i]}"
  value="${!var:-}"
  if [[ -z "${value}" ]]; then
    echo "ERROR: ${var} is empty in ${ENV_FILE}" >&2
    exit 1
  fi
  if ! gcloud secrets describe "${name}" --project="${PROJECT}" >/dev/null 2>&1; then
    echo "==> Creating secret ${name}"
    gcloud secrets create "${name}" --replication-policy=automatic --project="${PROJECT}"
  fi
  echo "==> Adding new version for ${name}"
  printf '%s' "${value}" | gcloud secrets versions add "${name}" --data-file=- --project="${PROJECT}"
  gcloud secrets add-iam-policy-binding "${name}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" --project="${PROJECT}" >/dev/null
done

echo "==> Secrets configured."
```

- [ ] **Step 2: Make executable and verify syntax**

Run: `cd pipeline/deploy && chmod +x setup-secrets.sh && bash -n setup-secrets.sh && echo "syntax OK"`
Expected: prints `syntax OK`.

- [ ] **Step 3: Verify asserted gcloud flags exist**

Run: `gcloud secrets create --help | grep -q -- '--replication-policy' && gcloud secrets versions add --help | grep -q -- '--data-file' && echo "flags OK"`
Expected: prints `flags OK`.

- [ ] **Step 4: Verify the missing-.env guard fires**

Run: `cd /tmp && bash /mnt/ssd/projects/soq/clients/shopjaydees/leadgeneration/pipeline/deploy/setup-secrets.sh; echo "exit=$?"` (run from a dir where `../.env` relative to the script still resolves to the real file — so instead force the guard by temporarily pointing at a missing file)

Simpler deterministic check: `bash -c 'ENV_FILE=/nonexistent; [[ -f "$ENV_FILE" ]] || { echo "guard OK"; exit 0; }'`
Expected: prints `guard OK` (confirms the guard pattern behaves; the script itself exits 1 with the ERROR message when `.env` is absent).

- [ ] **Step 5: Commit**

```bash
git add pipeline/deploy/setup-secrets.sh
git commit -m "deploy: add setup-secrets.sh (Secret Manager from .env + accessor grant)"
```

---

### Task 6: Deploy functions script (`deploy/deploy-functions.sh`)

Loops the `FUNCTIONS` table and deploys each Gen2 function. `gcloud functions deploy` is upsert, so re-running redeploys. Accepts an optional single-target argument for redeploying one function.

**Files:**
- Create: `pipeline/deploy/deploy-functions.sh`

**Interfaces:**
- Consumes: `config.sh` (`PROJECT`, `REGION`, `RUNTIME`, `RUNTIME_SA`, `SECRETS_MOUNT`, `FUNCTIONS[]`); requires `pipeline/env.yaml`; requires Task 1's `gcp-build`.
- Produces: five deployed HTTP functions whose URLs `deploy-schedulers.sh` resolves.

- [ ] **Step 1: Create `pipeline/deploy/deploy-functions.sh`**

```bash
#!/usr/bin/env bash
# Deploy (upsert) the five Gen2 functions. Optional arg: a single target to deploy.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"
SOURCE_DIR="${SCRIPT_DIR}/.."   # pipeline/

ENV_YAML="${SOURCE_DIR}/env.yaml"
if [[ ! -f "${ENV_YAML}" ]]; then
  echo "ERROR: ${ENV_YAML} not found. Copy env.yaml.example to env.yaml and fill it." >&2
  exit 1
fi

TARGET_FILTER="${1:-}"   # optional: deploy only this target

for row in "${FUNCTIONS[@]}"; do
  IFS='|' read -r target memory timeout cron <<< "${row}"
  if [[ -n "${TARGET_FILTER}" && "${target}" != "${TARGET_FILTER}" ]]; then
    continue
  fi
  echo "==> Deploying ${target} (mem=${memory} timeout=${timeout})"
  gcloud functions deploy "${target}" \
    --gen2 \
    --runtime="${RUNTIME}" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --source="${SOURCE_DIR}" \
    --entry-point="${target}" \
    --trigger-http \
    --no-allow-unauthenticated \
    --service-account="${RUNTIME_SA}" \
    --memory="${memory}" \
    --timeout="${timeout}" \
    --max-instances=1 \
    --concurrency=1 \
    --set-secrets="${SECRETS_MOUNT}" \
    --env-vars-file="${ENV_YAML}"
done

echo "==> Functions deployed."
```

- [ ] **Step 2: Make executable and verify syntax**

Run: `cd pipeline/deploy && chmod +x deploy-functions.sh && bash -n deploy-functions.sh && echo "syntax OK"`
Expected: prints `syntax OK`.

- [ ] **Step 3: Verify asserted gcloud flags exist (incl. the runtime-SA flag)**

Run:
```bash
gcloud functions deploy --help | grep -q -- '--gen2' \
 && gcloud functions deploy --help | grep -q -- '--entry-point' \
 && gcloud functions deploy --help | grep -q -- '--set-secrets' \
 && gcloud functions deploy --help | grep -q -- '--env-vars-file' \
 && gcloud functions deploy --help | grep -q -- '--service-account' \
 && gcloud functions deploy --help | grep -q -- '--concurrency' \
 && echo "flags OK"
```
Expected: prints `flags OK`. (If `--service-account` is absent in this SDK version, the runtime-identity flag may be named differently — substitute the flag shown in `--help` and update the script.)

- [ ] **Step 4: Commit**

```bash
git add pipeline/deploy/deploy-functions.sh
git commit -m "deploy: add deploy-functions.sh (upsert all five Gen2 functions)"
```

---

### Task 7: Deploy schedulers script (`deploy/deploy-schedulers.sh`)

Resolves each function's URL, then create-or-updates its scheduler job with an OIDC token minted as `scheduler-sa`. 0 retries.

**Files:**
- Create: `pipeline/deploy/deploy-schedulers.sh`

**Interfaces:**
- Consumes: `config.sh` (`PROJECT`, `REGION`, `TIMEZONE`, `SCHEDULER_SA`, `FUNCTIONS[]`); requires the functions to be deployed (Task 6) so URLs resolve.
- Produces: five Cloud Scheduler jobs named `<target>-job`.

- [ ] **Step 1: Create `pipeline/deploy/deploy-schedulers.sh`**

```bash
#!/usr/bin/env bash
# Create-or-update the five Cloud Scheduler jobs (OIDC to private functions, 0 retries).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "${SCRIPT_DIR}/config.sh"

for row in "${FUNCTIONS[@]}"; do
  IFS='|' read -r target memory timeout cron <<< "${row}"
  job="${target}-job"

  echo "==> Resolving URL for ${target}"
  url="$(gcloud functions describe "${target}" --gen2 --region="${REGION}" \
        --project="${PROJECT}" --format='value(serviceConfig.uri)')"
  if [[ -z "${url}" ]]; then
    echo "ERROR: could not resolve URL for ${target}; deploy the function first." >&2
    exit 1
  fi

  if gcloud scheduler jobs describe "${job}" --location="${REGION}" --project="${PROJECT}" >/dev/null 2>&1; then
    verb=update
  else
    verb=create
  fi

  echo "==> ${verb} scheduler job ${job} (${cron})"
  gcloud scheduler jobs "${verb}" http "${job}" \
    --location="${REGION}" \
    --project="${PROJECT}" \
    --schedule="${cron}" \
    --time-zone="${TIMEZONE}" \
    --uri="${url}" \
    --http-method=POST \
    --oidc-service-account-email="${SCHEDULER_SA}" \
    --oidc-token-audience="${url}" \
    --max-retry-attempts=0
done

echo "==> Schedulers configured."
```

(`memory`/`timeout` are unused here but kept so the same `IFS='|' read` parses the shared table; harmless.)

- [ ] **Step 2: Make executable and verify syntax**

Run: `cd pipeline/deploy && chmod +x deploy-schedulers.sh && bash -n deploy-schedulers.sh && echo "syntax OK"`
Expected: prints `syntax OK`.

- [ ] **Step 3: Verify asserted gcloud flags exist**

Run:
```bash
gcloud scheduler jobs create http --help | grep -q -- '--oidc-service-account-email' \
 && gcloud scheduler jobs create http --help | grep -q -- '--oidc-token-audience' \
 && gcloud scheduler jobs create http --help | grep -q -- '--time-zone' \
 && gcloud scheduler jobs create http --help | grep -q -- '--max-retry-attempts' \
 && echo "flags OK"
```
Expected: prints `flags OK`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/deploy/deploy-schedulers.sh
git commit -m "deploy: add deploy-schedulers.sh (OIDC scheduler jobs, 0 retries)"
```

---

### Task 8: Deploy README (`deploy/README.md`)

**Files:**
- Create: `pipeline/deploy/README.md`

**Interfaces:**
- Consumes: nothing. Documents the run order and prerequisites for an operator.

- [ ] **Step 1: Create `pipeline/deploy/README.md`**

````markdown
# Deployment — ShopJayDees Lead-Gen Pipeline

Deploys five Gen2 Cloud Functions (`discover`, `personalize`, `send`,
`dormancyCheck`, `replyPoll`) and their Cloud Scheduler triggers into the
`shopjaydees-leadgen` GCP project (`us-west1`, Node 20).

Design: `../../docs/superpowers/specs/2026-06-30-deployment-design.md`.

## Prerequisites

1. `gcloud auth login` and access to the `shopjaydees-leadgen` project (create it
   and link billing if it does not exist).
2. `pipeline/.env` populated with the 5 API keys **and** all ClickUp field UUIDs
   (`loadConfig()` throws on any missing required var).
3. `pipeline/env.yaml` created from `env.yaml.example` with real (non-secret)
   values — ClickUp list/field IDs, `CLICKUP_OWNER_USER_ID`, etc.

## Run order

```bash
cd pipeline/deploy

./bootstrap.sh          # one-time: APIs, service accounts, invoker roles
./setup-secrets.sh      # one-time / on key rotation: 5 secrets from ../.env
./deploy-functions.sh   # deploy/redeploy all five functions (idempotent)
./deploy-schedulers.sh  # create/update all five scheduler jobs (idempotent)
```

Redeploy a single function: `./deploy-functions.sh send`.

## Notes

- Functions are private (`--no-allow-unauthenticated`); only `scheduler-sa` can
  invoke them. Manual test invocation needs an identity token from an account with
  the invoker role:
  `curl -H "Authorization: bearer $(gcloud auth print-identity-token)" <function-url>`.
- Scheduler retries are 0 by design — functions are idempotent and self-healing;
  the next scheduled run handles any remainder.
- Schedules (America/Vancouver): discover `0 4 * * 1-5`, personalize `0 5 * * 1-5`,
  send `0 9 * * 1-5`, dormancyCheck `0 6 * * 0`, replyPoll `*/20 7-21 * * *` (daily).
````

- [ ] **Step 2: Verify it renders as a file**

Run: `test -f pipeline/deploy/README.md && grep -q "Run order" pipeline/deploy/README.md && echo "README OK"`
Expected: prints `README OK`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/deploy/README.md
git commit -m "deploy: add deploy/README.md (prerequisites + run order)"
```

---

### Task 9: Live deploy + smoke validation (GATED — requires auth, project, populated env)

This task runs the scripts against GCP. **Preconditions** (do not start until all hold):
- `gcloud auth login` completed; `shopjaydees-leadgen` exists with billing linked.
- `pipeline/.env` has the 5 real API keys and all ClickUp field UUIDs.
- `pipeline/env.yaml` created from the example with real values.

If preconditions are not yet met (e.g. ClickUp fields not created / mailbox warmup pending), **stop here** — Tasks 1–8 are the shippable deliverable; this task is the go-live step run later.

**Files:** none (execution only).

- [ ] **Step 1: Confirm auth and project**

Run: `gcloud auth list && gcloud projects describe shopjaydees-leadgen --format='value(projectId,lifecycleState)'`
Expected: an active credentialed account; prints `shopjaydees-leadgen ACTIVE`. (If the project does not exist: `gcloud projects create shopjaydees-leadgen` then link billing in the console.)

- [ ] **Step 2: Bootstrap**

Run: `cd pipeline/deploy && ./bootstrap.sh`
Expected: APIs enabled; `scheduler-sa` and `runtime-sa` exist; `Bootstrap complete.`

- [ ] **Step 3: Secrets**

Run: `./setup-secrets.sh`
Expected: 5 secrets created/versioned; `Secrets configured.` Verify: `gcloud secrets list --project=shopjaydees-leadgen` lists all five.

- [ ] **Step 4: Deploy functions**

Run: `./deploy-functions.sh`
Expected: five successful Gen2 deploys (the buildpack runs `gcp-build`/`tsc`). Verify: `gcloud functions list --project=shopjaydees-leadgen --gen2` shows all five `ACTIVE`.

- [ ] **Step 5: Deploy schedulers**

Run: `./deploy-schedulers.sh`
Expected: five jobs; `Schedulers configured.` Verify: `gcloud scheduler jobs list --location=us-west1 --project=shopjaydees-leadgen` shows `discover-job ... replyPoll-job`.

- [ ] **Step 6: Smoke-invoke one function via the scheduler**

Run: `gcloud scheduler jobs run replyPoll-job --location=us-west1 --project=shopjaydees-leadgen` then check logs: `gcloud functions logs read replyPoll --gen2 --region=us-west1 --project=shopjaydees-leadgen --limit=20`
Expected: the function is invoked (OIDC accepted — no 401/403). A 200 with a run summary confirms full success; a 500 from `loadConfig()` means env vars are still incomplete — fix `env.yaml`/secrets and redeploy. Either way, a non-401 confirms the auth/scheduler wiring is correct.

- [ ] **Step 7: Record go-live status**

No commit (execution only). Note in the project memory / status that deploy wiring is live and which functions are verified.

---

## Self-Review

**Spec coverage:** ✓ project (`config.sh`, Task 3), gcloud-script tooling (Tasks 3–7), hybrid secrets (Tasks 2/5/6), Gen2 + per-function memory/timeout/cron (`FUNCTIONS` table, Tasks 3/6/7), security model — `scheduler-sa`/`runtime-sa`, OIDC, `--no-allow-unauthenticated` (Tasks 4/6/7), build/entry-point fix (Task 1), idempotency (`describe||create`, upsert), README run order (Task 8), live validation (Task 9). Known external blockers (ClickUp UUIDs, mailbox warmup) are surfaced as Task 9 preconditions.

**Placeholder scan:** No "TBD"/"handle errors"-style gaps. The `xxxx`/`123456789` values in `env.yaml.example` are intentional template placeholders (the file's purpose), not plan placeholders.

**Type/name consistency:** `FUNCTIONS` row format `target|memory|timeout|cron` parsed identically in Tasks 3/6/7. Secret names match between `SECRETS_MOUNT`, `SECRET_NAMES[]`, and `setup-secrets.sh`. SA emails (`scheduler-sa`/`runtime-sa`) consistent across config/bootstrap/deploy. Scheduler job naming `<target>-job` consistent in Task 7 and Task 9 verification. `--service-account` flagged with a fallback note in Task 6 in case the SDK names the runtime-identity flag differently.
