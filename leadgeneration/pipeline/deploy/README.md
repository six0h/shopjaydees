# Deployment — ShopJayDees Lead-Gen Pipeline

Deploys five Gen2 Cloud Functions (`discover`, `personalize`, `send`,
`dormancyCheck`, `replyPoll`) and their Cloud Scheduler triggers into the
`shop-jaydees-lead-gen` GCP project (`us-west1`, Node 20).

Design: `../../docs/superpowers/specs/2026-06-30-deployment-design.md`.

## Prerequisites

0. **Org-policy exception (one-time, blocks everything below).** The project is
   under org `247493366000`, which enforces Domain Restricted Sharing
   (`iam.allowedPolicyMemberDomains`). Without an exception, `bootstrap.sh` fails
   at "Enabling APIs" (`FAILED_PRECONDITION: ...do not belong to a permitted
   customer`) because Google-managed service agents get rejected. Fix (requires
   `roles/orgpolicy.policyAdmin` on the org):
   ```
   gcloud services enable orgpolicy.googleapis.com --project=shop-jaydees-lead-gen
   gcloud org-policies set-policy allow-all-policy.yaml   # project-scoped Allow-All
   ```
1. `gcloud auth login` and access to the `shop-jaydees-lead-gen` project
   (already exists, project # 511192368881, billing enabled).
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
- On a brand-new project, the first `deploy-functions.sh` run builds via Cloud Build using the default compute service account. `bootstrap.sh` grants it `roles/cloudbuild.builds.builder`; if a first deploy still fails with a build/permission error, re-run `bootstrap.sh` and retry.
- IAM grants are eventually consistent: `setup-secrets.sh` grants `runtime-sa` secret access seconds before functions deploy, so a function's first cold start can occasionally fail to mount a secret and will succeed on the next scheduled run. No action needed unless it persists.
- Non-secret config lives in BOTH `../.env` (local dev/tests) and `env.yaml` (deploy via `--env-vars-file`). When you change a ClickUp field UUID or other non-secret value, update both files or they will silently drift.
