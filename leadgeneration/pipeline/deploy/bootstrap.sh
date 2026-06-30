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
