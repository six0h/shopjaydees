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
