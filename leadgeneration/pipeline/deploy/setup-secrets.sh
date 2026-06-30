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
