#!/usr/bin/env bash
# Shared configuration for ShopJayDees lead-gen deployment.
# Sourced by bootstrap.sh, setup-secrets.sh, deploy-functions.sh, deploy-schedulers.sh.
set -euo pipefail

PROJECT="shop-jaydees-lead-gen"
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
