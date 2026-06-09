export interface Config {
  clickupApiToken: string;
  hunterApiKey: string;
  clickupListId: string;
  clickupProspectingListId: string;
  clickupRateLimit: number;
  dryRun: boolean;
  alertEmail: string;
  alertWebhookUrl: string;
  fields: ClickUpFieldIds;
  prospectingFields: ProspectingRequestFieldIds;
}

export interface ClickUpFieldIds {
  companyName: string;
  companyDomain: string;
  companyIndustry: string;
  companyHeadcount: string;
  companyCity: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  emailConfidence: string;
  contactLinkedin: string;
  contactPhone: string;
  segment: string;
  category: string;
  leadScore: string;
  scoreRationale: string;
  geographicPhase: string;
  caslSourceUrl: string;
  importBatch: string;
}

export interface ProspectingRequestFieldIds {
  resultsFound: string;
  leadsCreated: string;
  leadsParked: string;
  duplicatesSkipped: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    clickupApiToken: required("CLICKUP_API_TOKEN"),
    hunterApiKey: required("HUNTER_API_KEY"),
    clickupListId: required("CLICKUP_LIST_ID"),
    clickupProspectingListId: required("CLICKUP_PROSPECTING_LIST_ID"),
    clickupRateLimit: parseInt(process.env.CLICKUP_RATE_LIMIT ?? "90", 10),
    dryRun: process.env.DRY_RUN === "true",
    alertEmail: required("ALERT_EMAIL"),
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
    fields: {
      companyName: required("CLICKUP_FIELD_COMPANY_NAME"),
      companyDomain: required("CLICKUP_FIELD_COMPANY_DOMAIN"),
      companyIndustry: required("CLICKUP_FIELD_COMPANY_INDUSTRY"),
      companyHeadcount: required("CLICKUP_FIELD_COMPANY_HEADCOUNT"),
      companyCity: required("CLICKUP_FIELD_COMPANY_CITY"),
      contactName: required("CLICKUP_FIELD_CONTACT_NAME"),
      contactTitle: required("CLICKUP_FIELD_CONTACT_TITLE"),
      contactEmail: required("CLICKUP_FIELD_CONTACT_EMAIL"),
      emailConfidence: required("CLICKUP_FIELD_EMAIL_CONFIDENCE"),
      contactLinkedin: required("CLICKUP_FIELD_CONTACT_LINKEDIN"),
      contactPhone: required("CLICKUP_FIELD_CONTACT_PHONE"),
      segment: required("CLICKUP_FIELD_SEGMENT"),
      category: required("CLICKUP_FIELD_CATEGORY"),
      leadScore: required("CLICKUP_FIELD_LEAD_SCORE"),
      scoreRationale: required("CLICKUP_FIELD_SCORE_RATIONALE"),
      geographicPhase: required("CLICKUP_FIELD_GEOGRAPHIC_PHASE"),
      caslSourceUrl: required("CLICKUP_FIELD_CASL_SOURCE_URL"),
      importBatch: required("CLICKUP_FIELD_IMPORT_BATCH"),
    },
    prospectingFields: {
      resultsFound: required("CLICKUP_FIELD_PR_RESULTS_FOUND"),
      leadsCreated: required("CLICKUP_FIELD_PR_LEADS_CREATED"),
      leadsParked: required("CLICKUP_FIELD_PR_LEADS_PARKED"),
      duplicatesSkipped: required("CLICKUP_FIELD_PR_DUPLICATES_SKIPPED"),
    },
  };
}
