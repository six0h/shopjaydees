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
