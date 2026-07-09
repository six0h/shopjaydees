import * as ff from "@google-cloud/functions-framework";
import type { Request, Response } from "@google-cloud/functions-framework";
import type { ClickUpClient } from "./clients/clickup.js";
import type { HunterClient } from "./clients/hunter.js";
import type { InstantlyClient } from "./clients/instantly.js";
import type { Alerter } from "./alerting.js";
import type { Logger } from "./logger.js";
import type { Config } from "./config.js";
import type {
  ClickUpTask,
  HunterContact,
  DiscoveryRunResult,
  RequestResult,
  Segment,
  Category,
  City,
  LeadData,
  GeminiDraftOutput,
  PersonalizationRunResult,
  LeadPersonalizationResult,
  SendRunResult,
  SendLeadResult,
  DormancyRunResult,
  DormancyLeadResult,
} from "./types.js";
import { InstantlyApiError, createInstantlyClient } from "./clients/instantly.js";
import { createFirecrawlClient, findSecondaryPages } from "./clients/firecrawl.js";
import type { FirecrawlClient } from "./clients/firecrawl.js";
import { createGeminiClient } from "./clients/gemini.js";
import type { GeminiClient } from "./clients/gemini.js";
import { scoreLead } from "./scoring.js";
import { categoryToDiscoverFilters, cityToPhase } from "./mapping.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createAlerter } from "./alerting.js";
import { createClickUpClient } from "./clients/clickup.js";
import { createHunterClient, HunterRateLimitError } from "./clients/hunter.js";
import { runReplyPoll } from "./reply-poll.js";

// --- Domain Normalization ---

function normalizeDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// --- Contact Selection ---

const MIN_CONTACT_CONFIDENCE = 40;

export function selectBestContact(
  contacts: HunterContact[]
): HunterContact | null {
  const eligible = contacts.filter(
    (c) => c.type === "personal" && c.confidence >= MIN_CONTACT_CONFIDENCE
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.confidence - a.confidence);
  return eligible[0];
}

export function extractCaslSourceUrl(
  contact: HunterContact,
  prospectDomain: string
): string {
  const match = contact.sources.find((s) => s.domain === prospectDomain);
  return match?.uri ?? "";
}

// --- Dropdown Value Resolution ---

function resolveDropdownValue(
  fieldOptions: Array<{ name: string; orderindex: number }> | undefined,
  label: string
): number | null {
  if (!fieldOptions) return null;
  const match = fieldOptions.find(
    (o) => o.name.toLowerCase() === label.toLowerCase()
  );
  return match?.orderindex ?? null;
}

// --- Request Field Extraction ---

/**
 * ClickUp returns number-typed custom fields as strings ("5", not 5). Reading
 * them with a `typeof === "number"` check silently yields 0, which is how every
 * lead once scored 0 and fell out of the personalize eligibility filter.
 */
function numericFieldValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractRequestFields(task: ClickUpTask): {
  segment: Segment;
  category: Category;
  targetCity: City;
  targetVolume: number;
} {
  let segment: Segment = "Business";
  let category: Category = "Other";
  let targetCity: City = "Surrey";
  let targetVolume = 25;

  for (const field of task.custom_fields) {
    if (field.name === "Segment" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) segment = opt.name as Segment;
    }
    if (field.name === "Category" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) category = opt.name as Category;
    }
    if (field.name === "Target City" && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) targetCity = opt.name as City;
    }
    // The live list names this "Max Results"; "Target Volume" is the legacy
    // name. ClickUp returns number-field values as strings, so coerce.
    if (field.name === "Max Results" || field.name === "Target Volume") {
      const parsed = Number(field.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        targetVolume = parsed;
      }
    }
  }

  return { segment, category, targetCity, targetVolume };
}

// --- Discovery Agent Core ---

export interface DiscoveryDeps {
  config: Config;
  clickup: ClickUpClient;
  hunter: HunterClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runDiscovery(
  deps: DiscoveryDeps
): Promise<DiscoveryRunResult> {
  const { config, clickup, hunter, alerter, logger } = deps;
  const now = new Date();
  const runId = `discover-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Discovery agent starting");

  const result: DiscoveryRunResult = {
    runId,
    timestamp: now.toISOString(),
    requestsFound: 0,
    requestsProcessed: 0,
    results: { completed: 0, failed: 0, staleReset: 0 },
    requests: [],
  };

  // Pre-step: Reset stale Running requests
  const runningTasks = await clickup.getTasks(config.clickupProspectingListId, {
    statuses: ["Running"],
  });
  for (const task of runningTasks) {
    const updatedAt = parseInt(task.date_updated, 10);
    const minutesStale = (Date.now() - updatedAt) / 60_000;
    if (minutesStale > 30) {
      if (!config.dryRun) {
        await clickup.updateTask(task.id, { status: "Requested" });
      }
      logger.warn("RESET: stale Running request", {
        taskId: task.id,
        minutesStale: Math.round(minutesStale),
      });
      result.results.staleReset += 1;
    }
  }

  // Step 1: Get Prospecting Requests
  const requests = await clickup.getTasks(config.clickupProspectingListId, {
    statuses: ["Requested"],
  });
  result.requestsFound = requests.length;

  if (requests.length === 0) {
    logger.info("No pending prospecting requests. Exiting.");
    return result;
  }

  // Fetch dropdown options for the Prospects list (needed for index mapping)
  const prospectFields = await clickup.getFields(config.clickupListId);
  const dropdownOptions: Record<string, Array<{ name: string; orderindex: number }>> = {};
  for (const field of prospectFields) {
    if (field.type_config?.options) {
      dropdownOptions[field.id] = field.type_config.options;
    }
  }

  // Check Hunter.io quota
  const quota = await hunter.getAccountQuota();
  logger.info("Hunter.io quota", { searches: quota.searches, verifications: quota.verifications });

  // Pre-fetch all existing prospect domains for dedup
  const existingTasks = await clickup.getTasks(config.clickupListId, { includeClosed: true });
  const knownDomains = new Set<string>();
  for (const task of existingTasks) {
    const domainField = task.custom_fields?.find((f: any) => f.id === config.fields.companyDomain);
    if (domainField?.value) {
      knownDomains.add(normalizeDomain(domainField.value as string));
    }
  }

  // Process each request
  for (const requestTask of requests) {
    const { segment, category, targetCity, targetVolume } =
      extractRequestFields(requestTask);
    const requestResult: RequestResult = {
      requestTaskId: requestTask.id,
      segment,
      category,
      targetCity,
      companiesDiscovered: 0,
      companiesSearched: 0,
      leadsCreated: 0,
      leadsParked: 0,
      duplicatesSkipped: 0,
      noContactSkipped: 0,
      status: "completed",
    };

    try {
      if (!config.dryRun) {
        await clickup.updateTask(requestTask.id, { status: "Running" });
      }

      // Step 1: Discover companies (free)
      const filters = categoryToDiscoverFilters(category, targetCity);
      filters.headcount = config.hunterDefaultHeadcount;
      logger.info("Discovering companies", { category, targetCity, filters });
      const discoverResponse = await hunter.discover(filters);
      const discoveredCompanies = discoverResponse.data;
      requestResult.companiesDiscovered = discoveredCompanies.length;

      // Step 2: Filter out known domains before spending credits
      const newCompanies = discoveredCompanies.filter((c) => {
        const norm = normalizeDomain(c.domain);
        if (knownDomains.has(norm)) {
          logger.info("SKIP: duplicate domain from Discover", { domain: c.domain });
          requestResult.duplicatesSkipped += 1;
          return false;
        }
        return true;
      });

      // Step 3: Domain Search each new company (1 credit each)
      const companiesToSearch = newCompanies.slice(0, targetVolume);
      const now = new Date();
      const importBatch = `${now.toISOString().slice(0, 10)}-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${targetCity.toLowerCase()}`;

      for (const company of companiesToSearch) {
        if (quota.searches.available < 1) {
          logger.warn("Search credits exhausted mid-batch", {
            domain: company.domain,
            remaining: companiesToSearch.length - requestResult.companiesSearched,
          });
          break;
        }

        const domainResponse = await hunter.searchDomain(company.domain, {
          limit: 10,
          seniority: config.hunterDefaultSeniority,
        });
        quota.searches.available -= 1;
        requestResult.companiesSearched += 1;

        if (!domainResponse.data.emails || domainResponse.data.emails.length === 0) {
          logger.info("No contacts found", { domain: company.domain });
          requestResult.noContactSkipped += 1;
          continue;
        }

        const contacts: HunterContact[] = domainResponse.data.emails.map((e) => ({
          ...e,
          full_name:
            e.first_name && e.last_name
              ? `${e.first_name} ${e.last_name}`
              : e.first_name ?? e.last_name ?? null,
        }));

        const bestContact = selectBestContact(contacts);
        if (!bestContact) {
          logger.info("NO_CONTACT: No suitable contact", { domain: company.domain });
          requestResult.noContactSkipped += 1;
          continue;
        }

        knownDomains.add(normalizeDomain(company.domain));

        const bestEmail = domainResponse.data.emails.find((e) => e.value === bestContact.value);
        const scoreResult = scoreLead({
          emailConfidence: bestContact.confidence,
          contactTitle: bestContact.position,
          seniority: bestEmail?.seniority ?? null,
          headcount: config.hunterDefaultHeadcount[0] ?? null,
          hasDomain: true,
        });

        const status = scoreResult.score >= 3 ? "Enriched" : "Parked";
        const contactName =
          bestContact.full_name ??
          [bestContact.first_name, bestContact.last_name].filter(Boolean).join(" ") ??
          bestContact.value;
        const taskName = `${company.organization || company.domain} — ${contactName}`;
        const caslSourceUrl = extractCaslSourceUrl(bestContact, company.domain);

        if (!config.dryRun) {
          const segmentIndex = resolveDropdownValue(dropdownOptions[config.fields.segment], segment);
          const categoryIndex = resolveDropdownValue(dropdownOptions[config.fields.category], category);
          const cityIndex = resolveDropdownValue(dropdownOptions[config.fields.companyCity], targetCity);
          const phaseLabel = cityToPhase(targetCity);
          const phaseIndex = resolveDropdownValue(dropdownOptions[config.fields.geographicPhase], phaseLabel);

          await clickup.createTask(config.clickupListId, {
            name: taskName,
            status,
            custom_fields: [
              { id: config.fields.companyName, value: company.organization || company.domain },
              { id: config.fields.companyDomain, value: `https://${company.domain}` },
              { id: config.fields.companyIndustry, value: "" },
              { id: config.fields.companyHeadcount, value: config.hunterDefaultHeadcount.join(", ") },
              { id: config.fields.companyCity, value: cityIndex },
              { id: config.fields.contactName, value: contactName },
              { id: config.fields.contactTitle, value: bestContact.position ?? "" },
              { id: config.fields.contactEmail, value: bestContact.value },
              { id: config.fields.emailConfidence, value: bestContact.confidence },
              { id: config.fields.contactLinkedin, value: bestContact.linkedin ?? "" },
              { id: config.fields.contactPhone, value: bestContact.phone_number ?? "" },
              { id: config.fields.segment, value: segmentIndex },
              { id: config.fields.category, value: categoryIndex },
              { id: config.fields.leadScore, value: scoreResult.score },
              { id: config.fields.scoreRationale, value: scoreResult.rationale },
              { id: config.fields.geographicPhase, value: phaseIndex },
              { id: config.fields.caslSourceUrl, value: caslSourceUrl },
              { id: config.fields.importBatch, value: importBatch },
            ],
          });
        }

        if (status === "Enriched") {
          requestResult.leadsCreated += 1;
        } else {
          requestResult.leadsParked += 1;
        }

        logger.info("Lead created", { taskName, score: scoreResult.score, status, dryRun: config.dryRun });
      }

      // Update Prospecting Request
      if (!config.dryRun) {
        await clickup.updateTask(requestTask.id, {
          status: "Complete",
          custom_fields: [
            { id: config.prospectingFields.resultsFound, value: requestResult.companiesDiscovered },
            { id: config.prospectingFields.leadsCreated, value: requestResult.leadsCreated },
            { id: config.prospectingFields.leadsParked, value: requestResult.leadsParked },
            { id: config.prospectingFields.duplicatesSkipped, value: requestResult.duplicatesSkipped },
          ],
        });
        await clickup.addComment(
          requestTask.id,
          `Completed: ${requestResult.companiesDiscovered} companies discovered, ${requestResult.companiesSearched} searched, ${requestResult.leadsCreated} leads created (score 3+), ${requestResult.leadsParked} parked (score 1-2), ${requestResult.duplicatesSkipped} duplicates skipped`
        );
      }

      result.results.completed += 1;
    } catch (err) {
      if (err instanceof HunterRateLimitError) {
        logger.warn("Hunter.io rate limited — aborting remaining requests");
        await alerter.send("Hunter.io rate limited", "Discovery batch aborted due to 429. Remaining requests will be retried next run.");
        requestResult.status = "failed";
        requestResult.error = "Hunter.io rate limited";
        result.results.failed += 1;
        result.requests.push(requestResult);
        result.requestsProcessed += 1;
        break;
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Request processing failed", {
        requestTaskId: requestTask.id,
        error: errorMsg,
      });
      requestResult.status = "failed";
      requestResult.error = errorMsg;
      result.results.failed += 1;

      try {
        if (!config.dryRun) {
          await clickup.updateTask(requestTask.id, { status: "Failed" });
          await clickup.addComment(requestTask.id, `Error: ${errorMsg}`);
        }
      } catch {
        // Best effort
      }

      await alerter.send(`Discovery agent error on request ${requestTask.id}`, errorMsg);
    }

    result.requests.push(requestResult);
    result.requestsProcessed += 1;
  }

  logger.info("Discovery agent complete", {
    requestsProcessed: result.requestsProcessed,
    completed: result.results.completed,
    failed: result.results.failed,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("discover", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("discovery-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const hunter = createHunterClient({
    apiKey: config.hunterApiKey,
    logger,
  });

  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig =
      dryRunOverride !== undefined
        ? { ...config, dryRun: dryRunOverride }
        : config;

    const result = await runDiscovery({
      config: effectiveConfig,
      clickup,
      hunter,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Discovery Agent", { error: errorMsg });
    await alerter.send("Unhandled error in discovery-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// =====================================================
// PERSONALIZATION AGENT
// =====================================================

// --- Lead Data Extraction ---

export function extractLeadData(task: ClickUpTask, config: Config): LeadData {
  let companyName = "";
  let companyDomain = "";
  let contactName = "";
  let contactTitle = "";
  let segment = "Business";
  let category = "Other";
  let leadScore = 0;
  let companyIndustry = "";
  let companyHeadcount = "";
  let companyCity = "";

  for (const field of task.custom_fields) {
    switch (field.id) {
      case config.fields.companyName:
        companyName = String(field.value ?? "");
        break;
      case config.fields.companyDomain:
        companyDomain = String(field.value ?? "");
        break;
      case config.fields.contactName:
        contactName = String(field.value ?? "");
        break;
      case config.fields.contactTitle:
        contactTitle = String(field.value ?? "");
        break;
      case config.fields.segment:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) segment = opt.name;
        }
        break;
      case config.fields.category:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) category = opt.name;
        }
        break;
      case config.fields.leadScore:
        leadScore = numericFieldValue(field.value);
        break;
      case config.fields.companyIndustry:
        companyIndustry = String(field.value ?? "");
        break;
      case config.fields.companyHeadcount:
        companyHeadcount = String(field.value ?? "");
        break;
      case config.fields.companyCity:
        if (field.type_config?.options && typeof field.value === "number") {
          const opt = field.type_config.options.find(
            (o) => o.orderindex === field.value
          );
          if (opt) companyCity = opt.name;
        } else {
          companyCity = String(field.value ?? "");
        }
        break;
    }
  }

  const isReEngagement = task.tags.some((t) => t.name === "re-engagement");

  return {
    taskId: task.id,
    companyName,
    companyDomain,
    contactName,
    contactTitle,
    segment,
    category,
    leadScore,
    companyIndustry,
    companyHeadcount,
    companyCity,
    isReEngagement,
  };
}

// --- Prompt Builder ---

export function buildPrompt(lead: LeadData, scrapedContent: string): string {
  const websiteSection =
    scrapedContent.trim().length > 0
      ? scrapedContent
      : "No website content available — use the company data above.";

  const socialProofMap: Record<string, string> = {
    School: 'Schools: "We work with over 100 schools in the Lower Mainland"',
    Team: 'Teams: "We\'ve helped teams raise thousands through apparel-based fundraising — no inventory, no hassle"',
    Business:
      'Corporate: "We frequently work with businesses with anywhere from 12 to 250+ employees"',
  };
  const socialProof =
    socialProofMap[lead.segment] ?? socialProofMap["Business"];

  let prompt = `You are writing cold outreach for ShopJaydees (shopjaydees.com), a custom clothing
company in BC's Lower Mainland. They serve businesses, schools, and teams with
branded apparel — uniforms, spirit wear, team gear, corporate swag.

ShopJaydees runs "Wear It Forward" — a portion of every order goes to community
initiatives. This is a genuine differentiator, not a gimmick. Mention it naturally
once in Touch 1, but don't lead with it.

TONE: Friendly > Professional > Casual. Like a local business owner reaching out
to another. First-name basis. No corporate jargon, no buzzwords, no pressure.

PROSPECT DATA:
- Company: ${lead.companyName}
- Domain: ${lead.companyDomain}
- Contact: ${lead.contactName}, ${lead.contactTitle}
- Segment: ${lead.segment}
- Category: ${lead.category}
- Industry: ${lead.companyIndustry}
- Headcount: ${lead.companyHeadcount}
- City: ${lead.companyCity}

WEBSITE CONTENT:
${websiteSection}

SOCIAL PROOF (use the one matching the segment):
${socialProof}

INSTRUCTIONS:
1. Write 3 email touches following the sequence structure (Touch 1: intro + value,
   Touch 2: value-add follow-up, Touch 3: friendly check-in).
2. Reference something specific from their website or business. Do not be generic.
3. Subject lines: 4-8 words, no clickbait, no ALL CAPS, no emojis.
4. Sign all emails as "Ellie" (the ShopJaydees outreach persona — not the owner's name).
5. Write a LinkedIn connection request note (under 300 chars, no pitch).
6. Check the website content for any "do not contact" or "do not solicit" statements.
7. Write one sentence explaining why custom apparel is relevant to ${lead.contactName}'s
   role at ${lead.companyName}.
8. If no website content was available, still write the emails using the company data,
   but note that in the website_scrape_summary field.

Return your response as structured JSON matching the schema provided.`;

  if (lead.isReEngagement) {
    prompt += `

RE-ENGAGEMENT NOTICE: This prospect was contacted previously with no response.
Their 90-day cool-off period has passed. You MUST:
- Use a completely different angle than a typical first outreach
- Do NOT reference or acknowledge previous outreach attempts
- Find a fresh hook — new seasonal angle, different value prop, updated community signal
- The tone should feel like a first contact, not a follow-up`;
  }

  return prompt;
}

// --- Draft Validation ---

export function validateDrafts(
  drafts: GeminiDraftOutput,
  lead: LeadData
): string[] {
  const errors: string[] = [];

  if (drafts.email_touch_1_body.length < 100) {
    errors.push(
      `email_touch_1_body too short: ${drafts.email_touch_1_body.length} chars (min 100)`
    );
  }
  if (drafts.email_touch_2_body.length < 80) {
    errors.push(
      `email_touch_2_body too short: ${drafts.email_touch_2_body.length} chars (min 80)`
    );
  }
  if (drafts.email_touch_3_body.length < 60) {
    errors.push(
      `email_touch_3_body too short: ${drafts.email_touch_3_body.length} chars (min 60)`
    );
  }

  if (!drafts.email_touch_1_body.includes(lead.companyName)) {
    errors.push(
      `email_touch_1_body missing company name "${lead.companyName}"`
    );
  }

  const firstName = lead.contactName.split(" ")[0];
  if (firstName && !drafts.email_touch_1_body.includes(firstName)) {
    errors.push(
      `email_touch_1_body missing contact first name "${firstName}"`
    );
  }

  const subjects = [
    { name: "email_touch_1_subject", value: drafts.email_touch_1_subject },
    { name: "email_touch_2_subject", value: drafts.email_touch_2_subject },
    { name: "email_touch_3_subject", value: drafts.email_touch_3_subject },
  ];
  for (const subj of subjects) {
    if (subj.value.length < 3 || subj.value.length > 80) {
      errors.push(
        `${subj.name} length ${subj.value.length} out of range 3-80: "${subj.value}"`
      );
    }
  }

  return errors;
}

// --- Personalization Agent Core ---

export interface PersonalizationDeps {
  config: Config;
  clickup: ClickUpClient;
  firecrawl: FirecrawlClient;
  gemini: GeminiClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runPersonalization(
  deps: PersonalizationDeps
): Promise<PersonalizationRunResult> {
  const { config, clickup, firecrawl, gemini, alerter, logger } = deps;
  const now = new Date();
  const runId = `personalize-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Personalization agent starting");

  const result: PersonalizationRunResult = {
    runId,
    timestamp: now.toISOString(),
    batchSizeRequested: config.personalizationBatchSize,
    leadsAvailable: 0,
    leadsProcessed: 0,
    results: {
      success: 0,
      generationFailed: 0,
      caslBlocked: 0,
      scrapeFailedButProceeded: 0,
      stuckLeadsReset: 0,
    },
    leads: [],
    deferredRemaining: 0,
  };

  // Pre-step: Reset leads stuck in "Personalizing" status > 30 min
  const stuckLeads = await clickup.getTasks(config.clickupListId, {
    statuses: ["Personalizing"],
  });
  for (const task of stuckLeads) {
    const updatedAt = parseInt(task.date_updated, 10);
    const minutesStale = (Date.now() - updatedAt) / 60_000;
    if (minutesStale > 30) {
      if (!config.dryRun) {
        await clickup.updateTask(task.id, { status: "Enriched" });
      }
      logger.warn("RESET: stuck Personalizing lead", { taskId: task.id, minutesStale: Math.round(minutesStale) });
      result.results.stuckLeadsReset += 1;
    }
  }

  // Step 1: Query ClickUp for Enriched leads
  const allEnriched = await clickup.getTasks(config.clickupListId, {
    statuses: ["Enriched"],
  });

  // Client-side filtering: score >= 3
  const eligible = allEnriched.filter((task) => {
    const scoreField = task.custom_fields.find(
      (f) => f.id === config.fields.leadScore
    );
    const score = numericFieldValue(scoreField?.value);
    return score >= 3;
  });

  // Client-side sorting: score DESC, date_created ASC
  eligible.sort((a, b) => {
    const valA = a.custom_fields.find((f) => f.id === config.fields.leadScore)?.value;
    const scoreA = numericFieldValue(valA);
    const valB = b.custom_fields.find((f) => f.id === config.fields.leadScore)?.value;
    const scoreB = numericFieldValue(valB);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return parseInt(a.date_created, 10) - parseInt(b.date_created, 10);
  });

  result.leadsAvailable = eligible.length;

  if (eligible.length === 0) {
    logger.info("No eligible Enriched leads. Exiting.");
    return result;
  }

  // Take batch
  const batch = eligible.slice(0, config.personalizationBatchSize);

  logger.info("Processing batch", {
    batchSize: batch.length,
    totalAvailable: eligible.length,
  });

  // Process each lead
  for (const task of batch) {
    const lead = extractLeadData(task, config);
    const leadResult: LeadPersonalizationResult = {
      taskId: lead.taskId,
      company: lead.companyName,
      status: "success",
      scrapePages: 0,
      geminiTokensUsed: 0,
      tagsAdded: [],
    };

    try {
      // Step 2: Lock lead
      if (!config.dryRun) {
        await clickup.updateTask(lead.taskId, { status: "Personalizing" });
      }

      // Step 4: Scrape prospect website
      let scrapedContent = "";
      let scrapeFailed = false;
      let pagesScraped = 0;

      const homepageResult = await firecrawl.scrape(lead.companyDomain);
      if (homepageResult.success && homepageResult.data?.markdown) {
        scrapedContent += `## Homepage (${lead.companyDomain})\n\n${homepageResult.data.markdown}`;
        pagesScraped += 1;

        const links = homepageResult.data.links ?? [];
        const secondaryPages = findSecondaryPages(links, lead.companyDomain);

        for (const pageUrl of secondaryPages) {
          const pageResult = await firecrawl.scrape(pageUrl);
          if (pageResult.success && pageResult.data?.markdown) {
            scrapedContent += `\n\n---\n\n## ${pageUrl}\n\n${pageResult.data.markdown}`;
            pagesScraped += 1;
          }
        }
      } else {
        scrapeFailed = true;
        if (!config.dryRun) {
          await clickup.addTag(lead.taskId, "no-scrape");
        }
        leadResult.tagsAdded.push("no-scrape");
        logger.warn("Firecrawl failed — proceeding with Hunter.io data only", {
          taskId: lead.taskId,
          company: lead.companyName,
        });
      }

      leadResult.scrapePages = pagesScraped;

      if (scrapeFailed) {
        result.results.scrapeFailedButProceeded += 1;
      }

      // Step 5: Generate drafts via Gemini
      const prompt = buildPrompt(lead, scrapedContent);
      const geminiResult = await gemini.generateDrafts(prompt);
      leadResult.geminiTokensUsed = geminiResult.tokensUsed;

      // Handle Gemini rate limit — defer entire remaining batch
      if (geminiResult.isRateLimited) {
        logger.warn("Gemini 429 — deferring remaining batch", {
          taskId: lead.taskId,
          company: lead.companyName,
        });

        if (!config.dryRun) {
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.status = "deferred";
        result.leads.push(leadResult);
        result.leadsProcessed += 1;

        const currentIndex = batch.indexOf(task);
        result.deferredRemaining = batch.length - currentIndex - 1;

        await alerter.send(
          "Gemini rate limit — personalization batch deferred",
          `Rate limited after processing lead ${lead.companyName}. ${result.deferredRemaining} leads deferred to next run.`
        );

        break;
      }

      // Handle other Gemini errors
      if (geminiResult.error || !geminiResult.drafts) {
        logger.error("Gemini generation failed", {
          taskId: lead.taskId,
          company: lead.companyName,
          error: geminiResult.error,
        });
        if (!config.dryRun) {
          await clickup.addTag(lead.taskId, "generation-failed");
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.tagsAdded.push("generation-failed");
        leadResult.status = "generation_failed";
        leadResult.error = geminiResult.error;
        result.results.generationFailed += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      const drafts = geminiResult.drafts;

      // Step 6: Validate — CASL opt-out check first
      if (!drafts.casl_opt_out_check) {
        logger.warn("CASL block — prospect website has do-not-contact", {
          taskId: lead.taskId,
          company: lead.companyName,
        });
        if (!config.dryRun) {
          await clickup.addTag(lead.taskId, "casl-block");
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.tagsAdded.push("casl-block");
        leadResult.status = "casl_blocked";
        result.results.caslBlocked += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      // Step 6 continued: Validate draft quality
      const validationErrors = validateDrafts(drafts, lead);
      if (validationErrors.length > 0) {
        logger.error("Draft validation failed", {
          taskId: lead.taskId,
          company: lead.companyName,
          errors: validationErrors,
        });
        if (!config.dryRun) {
          await clickup.addTag(lead.taskId, "generation-failed");
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
        }
        leadResult.tagsAdded.push("generation-failed");
        leadResult.status = "generation_failed";
        leadResult.error = `Validation: ${validationErrors.join("; ")}`;
        result.results.generationFailed += 1;
        result.leads.push(leadResult);
        result.leadsProcessed += 1;
        continue;
      }

      // Step 7: Write results back to ClickUp
      const linkedinMessage = drafts.linkedin_message.length > 300
        ? drafts.linkedin_message.slice(0, 300)
        : drafts.linkedin_message;
      const todayMidnightUtc = new Date();
      todayMidnightUtc.setUTCHours(0, 0, 0, 0);
      const caslDateMs = todayMidnightUtc.getTime();

      if (!config.dryRun) {
        await clickup.updateTask(lead.taskId, {
          status: "Ready for Review",
          custom_fields: [
            {
              id: config.personalizationFields.websiteScrapeSummary,
              value: drafts.website_scrape_summary,
            },
            {
              id: config.personalizationFields.communitySignals,
              value: drafts.community_signals,
            },
            {
              id: config.personalizationFields.personalizationHooks,
              value: drafts.personalization_hooks,
            },
            {
              id: config.personalizationFields.emailTouch1,
              value: drafts.email_touch_1_body,
            },
            {
              id: config.personalizationFields.emailTouch1Subject,
              value: drafts.email_touch_1_subject,
            },
            {
              id: config.personalizationFields.emailTouch2,
              value: drafts.email_touch_2_body,
            },
            {
              id: config.personalizationFields.emailTouch2Subject,
              value: drafts.email_touch_2_subject,
            },
            {
              id: config.personalizationFields.emailTouch3,
              value: drafts.email_touch_3_body,
            },
            {
              id: config.personalizationFields.emailTouch3Subject,
              value: drafts.email_touch_3_subject,
            },
            {
              id: config.personalizationFields.linkedinMessage,
              value: linkedinMessage,
            },
            {
              id: config.personalizationFields.caslOptOutCheck,
              value: true,
            },
            {
              id: config.personalizationFields.caslRelevanceRationale,
              value: drafts.casl_relevance_rationale,
            },
            {
              id: config.personalizationFields.caslConsentBasis,
              value: 0,
            },
            {
              id: config.personalizationFields.caslDateVerified,
              value: caslDateMs,
            },
            {
              id: config.personalizationFields.reviewDecision,
              value: 0,
            },
          ],
        });
      }

      result.results.success += 1;
      logger.info("Lead personalized successfully", {
        taskId: lead.taskId,
        company: lead.companyName,
        scrapePages: pagesScraped,
        tokensUsed: geminiResult.tokensUsed,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Lead personalization failed", {
        taskId: lead.taskId,
        company: lead.companyName,
        error: errorMsg,
      });
      leadResult.status = "generation_failed";
      leadResult.error = errorMsg;
      result.results.generationFailed += 1;

      if (!config.dryRun) {
        try {
          await clickup.addTag(lead.taskId, "generation-failed");
          await clickup.updateTask(lead.taskId, { status: "Enriched" });
          leadResult.tagsAdded.push("generation-failed");
        } catch {
          // Don't mask the real error
        }
      }
    }

    result.leads.push(leadResult);
    result.leadsProcessed += 1;
  }

  logger.info("Personalization agent complete", {
    leadsProcessed: result.leadsProcessed,
    success: result.results.success,
    generationFailed: result.results.generationFailed,
    caslBlocked: result.results.caslBlocked,
    deferredRemaining: result.deferredRemaining,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("personalize", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("personalization-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const firecrawlClient = createFirecrawlClient({
    apiKey: config.firecrawlApiKey,
    logger,
  });
  const geminiClient = createGeminiClient({
    apiKey: config.geminiApiKey,
    logger,
  });

  try {
    const batchSizeOverride =
      req.body && typeof req.body === "object" && "batch_size" in req.body
        ? parseInt(String(req.body.batch_size), 10)
        : undefined;
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig = {
      ...config,
      ...(batchSizeOverride !== undefined && !isNaN(batchSizeOverride)
        ? { personalizationBatchSize: batchSizeOverride }
        : {}),
      ...(dryRunOverride !== undefined ? { dryRun: dryRunOverride } : {}),
    };

    const result = await runPersonalization({
      config: effectiveConfig,
      clickup,
      firecrawl: firecrawlClient,
      gemini: geminiClient,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Personalization Agent", {
      error: errorMsg,
    });
    await alerter.send("Unhandled error in personalization-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// =====================================================
// SEND AGENT
// =====================================================

// --- Send Agent Helpers ---

export function getSegmentLabel(task: ClickUpTask, segmentFieldId: string): string {
  for (const field of task.custom_fields) {
    if (field.id === segmentFieldId && field.type_config?.options) {
      const opt = field.type_config.options.find(
        (o) => o.orderindex === field.value
      );
      if (opt) return opt.name;
    }
  }
  return "Business";
}

export function buildCampaignName(segment: string, now: Date): string {
  const month = now.toISOString().slice(0, 7);
  return `${segment} - ${month}`;
}

function getSendFieldValue(task: ClickUpTask, fieldId: string): unknown {
  const field = task.custom_fields.find((f) => f.id === fieldId);
  return field?.value ?? null;
}

export function extractSendData(
  task: ClickUpTask,
  config: Config
): {
  contactEmail: string;
  contactName: string;
  firstName: string;
  lastName: string;
  companyName: string;
  touch1Body: string;
  touch1Subject: string;
  touch2Body: string;
  touch2Subject: string;
  touch3Body: string;
  touch3Subject: string;
} {
  const contactEmail = String(getSendFieldValue(task, config.fields.contactEmail) ?? "");
  const contactName = String(getSendFieldValue(task, config.fields.contactName) ?? "");
  const parts = contactName.split(" ");
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  return {
    contactEmail,
    contactName,
    firstName,
    lastName,
    companyName: String(getSendFieldValue(task, config.fields.companyName) ?? ""),
    touch1Body: String(getSendFieldValue(task, config.personalizationFields.emailTouch1) ?? ""),
    touch1Subject: String(getSendFieldValue(task, config.personalizationFields.emailTouch1Subject) ?? ""),
    touch2Body: String(getSendFieldValue(task, config.personalizationFields.emailTouch2) ?? ""),
    touch2Subject: String(getSendFieldValue(task, config.personalizationFields.emailTouch2Subject) ?? ""),
    touch3Body: String(getSendFieldValue(task, config.personalizationFields.emailTouch3) ?? ""),
    touch3Subject: String(getSendFieldValue(task, config.personalizationFields.emailTouch3Subject) ?? ""),
  };
}

function getSendLeadScore(task: ClickUpTask, leadScoreFieldId: string): number {
  const field = task.custom_fields.find((f) => f.id === leadScoreFieldId);
  return numericFieldValue(field?.value);
}

// --- Send Agent Core ---

export interface SendDeps {
  config: Config;
  clickup: ClickUpClient;
  instantly: InstantlyClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runSend(deps: SendDeps): Promise<SendRunResult> {
  const { config, clickup, instantly, alerter, logger } = deps;
  const now = new Date();
  const runId = `send-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Send agent starting");

  const result: SendRunResult = {
    runId,
    timestamp: now.toISOString(),
    leadsQueued: 0,
    results: {
      sent: 0,
      instantlyDuplicate: 0,
      invalidEmail: 0,
      deferredRateLimit: 0,
      errors: 0,
    },
    leads: [],
  };

  const approvedTasks = await clickup.getTasks(config.clickupListId, {
    statuses: ["Approved"],
  });

  if (approvedTasks.length === 0) {
    logger.info("No approved leads. Exiting.");
    return result;
  }

  approvedTasks.sort(
    (a, b) =>
      getSendLeadScore(b, config.fields.leadScore) -
      getSendLeadScore(a, config.fields.leadScore)
  );

  result.leadsQueued = approvedTasks.length;
  logger.info("Approved leads found", { count: approvedTasks.length });

  const prospectFields = await clickup.getFields(config.clickupListId);
  const dropdownOptions: Record<string, Array<{ name: string; orderindex: number }>> = {};
  for (const field of prospectFields) {
    if (field.type_config?.options) {
      dropdownOptions[field.id] = field.type_config.options;
    }
  }

  const existingCampaigns = config.dryRun ? [] : await instantly.listCampaigns();
  const campaignCache = new Map<string, string>();
  for (const camp of existingCampaigns) {
    campaignCache.set(camp.name, camp.id);
  }

  let rateLimited = false;

  for (let i = 0; i < approvedTasks.length; i++) {
    const task = approvedTasks[i];
    const leadResult: SendLeadResult = {
      taskId: task.id,
      company: "",
      email: "",
      status: "sent",
      campaignId: null,
      sendingDomain: null,
    };

    try {
      if (rateLimited) {
        leadResult.status = "deferred_rate_limit";
        result.results.deferredRateLimit += 1;
        result.leads.push(leadResult);
        continue;
      }

      const leadData = extractSendData(task, config);
      leadResult.company = leadData.companyName;
      leadResult.email = leadData.contactEmail;

      if (!leadData.contactEmail || !leadData.contactEmail.includes("@")) {
        logger.warn("Missing or invalid email, skipping", {
          taskId: task.id,
          email: leadData.contactEmail,
        });
        if (!config.dryRun) {
          await clickup.addTag(task.id, "invalid-email");
          await clickup.updateTask(task.id, { status: "Bounced" });
        }
        leadResult.status = "invalid_email";
        result.results.invalidEmail += 1;
        result.leads.push(leadResult);
        continue;
      }

      const sendingDomain = config.instantlySendingDomains[i % config.instantlySendingDomains.length];
      leadResult.sendingDomain = sendingDomain;

      const segment = getSegmentLabel(task, config.fields.segment);
      const campaignName = buildCampaignName(segment, now);

      if (config.dryRun) {
        logger.info("DRY_RUN: would send lead", {
          taskId: task.id,
          email: leadData.contactEmail,
          campaign: campaignName,
          sendingDomain,
        });
        result.results.sent += 1;
        result.leads.push(leadResult);
        continue;
      }

      let campaignId = campaignCache.get(campaignName);
      if (!campaignId) {
        logger.info("Creating new campaign", { name: campaignName });
        const newCampaign = await instantly.createCampaign(campaignName);
        campaignId = newCampaign.id;
        campaignCache.set(campaignName, campaignId);
      }
      leadResult.campaignId = campaignId;

      const instantlyResponse = await instantly.addLeadToCampaign(campaignId, {
        email: leadData.contactEmail,
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        companyName: leadData.companyName,
        customVariables: {
          touch_1_subject: leadData.touch1Subject,
          touch_1_body: leadData.touch1Body,
          touch_2_subject: leadData.touch2Subject,
          touch_2_body: leadData.touch2Body,
          touch_3_subject: leadData.touch3Subject,
          touch_3_body: leadData.touch3Body,
          sending_domain: sendingDomain,
        },
      });

      const isSkipped = instantlyResponse.leads_skipped > 0;
      if (isSkipped) {
        logger.warn("Lead skipped by Instantly (already in workspace)", {
          taskId: task.id,
          email: leadData.contactEmail,
        });
        await clickup.addTag(task.id, "instantly-duplicate");
        leadResult.status = "instantly_duplicate";
        result.results.instantlyDuplicate += 1;
      } else {
        leadResult.status = "sent";
        result.results.sent += 1;
      }

      // Write tracking data back to ClickUp with retry
      const sendingDomainIndex = dropdownOptions[config.outreachFields.sendingDomain]?.find(
        (o) => o.name === sendingDomain
      )?.orderindex ?? 0;
      const notStartedIndex = dropdownOptions[config.outreachFields.sequenceStatus]?.find(
        (o) => o.name === "Not Started"
      )?.orderindex ?? 0;

      let clickupSuccess = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await clickup.updateTask(task.id, {
            status: "Outreach Active",
            custom_fields: [
              { id: config.outreachFields.instantlyCampaignId, value: campaignId },
              { id: config.outreachFields.instantlyLeadId, value: instantlyResponse.upload_id },
              { id: config.outreachFields.sendingDomain, value: sendingDomainIndex },
              { id: config.outreachFields.sequenceStatus, value: notStartedIndex },
              { id: config.outreachFields.outreachStartedDate, value: Date.now() },
            ],
          });
          clickupSuccess = true;
          break;
        } catch (clickupErr) {
          const waitMs = Math.pow(2, attempt) * 1000;
          logger.warn("ClickUp PUT failed, retrying", {
            taskId: task.id,
            attempt: attempt + 1,
            waitMs,
            error: clickupErr instanceof Error ? clickupErr.message : String(clickupErr),
          });
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      }

      if (!clickupSuccess) {
        const alertMsg = `Task ${task.id} (${leadData.contactEmail}) was added to Instantly campaign ${campaignId} but ClickUp update failed after 3 retries. Manual reconciliation needed.`;
        logger.critical("ClickUp/Instantly sync mismatch", {
          taskId: task.id,
          campaignId,
          email: leadData.contactEmail,
        });
        await alerter.send("CRITICAL: ClickUp/Instantly sync mismatch — manual fix needed", alertMsg);
        leadResult.status = "error";
        leadResult.error = "ClickUp update failed after Instantly success";
        result.results.errors += 1;
      }
    } catch (err) {
      if (err instanceof InstantlyApiError) {
        if (err.code === 429) {
          logger.warn("Instantly 429 — stopping batch", {
            taskId: task.id,
            remainingLeads: approvedTasks.length - i,
          });
          rateLimited = true;
          leadResult.status = "deferred_rate_limit";
          result.results.deferredRateLimit += 1;
          result.leads.push(leadResult);
          continue;
        }

        if (err.code === 400) {
          logger.warn("Instantly 400 — invalid email", { taskId: task.id });
          await clickup.addTag(task.id, "invalid-email");
          await clickup.updateTask(task.id, { status: "Bounced" });
          leadResult.status = "invalid_email";
          result.results.invalidEmail += 1;
          result.leads.push(leadResult);
          continue;
        }
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Send failed for lead", { taskId: task.id, error: errorMsg });
      leadResult.status = "error";
      leadResult.error = errorMsg;
      result.results.errors += 1;
    }

    result.leads.push(leadResult);
  }

  logger.info("Send agent complete", {
    sent: result.results.sent,
    duplicates: result.results.instantlyDuplicate,
    invalidEmails: result.results.invalidEmail,
    deferred: result.results.deferredRateLimit,
    errors: result.results.errors,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("send", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("send-agent");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const instantly = createInstantlyClient({
    apiKey: config.instantlyApiKey,
    logger,
  });

  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig =
      dryRunOverride !== undefined
        ? { ...config, dryRun: dryRunOverride }
        : config;

    const result = await runSend({
      config: effectiveConfig,
      clickup,
      instantly,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Send Agent", { error: errorMsg });
    await alerter.send("Unhandled error in send-agent", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// =====================================================
// DORMANCY CHECK
// =====================================================

// --- Dormancy Check Helpers ---

export function getReactivationCount(task: ClickUpTask): number {
  let max = 0;
  for (const tag of task.tags) {
    const match = tag.name.match(/^reactivation-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max;
}

export function isDormantEligible(
  task: ClickUpTask,
  config: Config,
  now: Date
): { eligible: boolean; reason?: string } {
  const leadScore = getSendLeadScore(task, config.fields.leadScore);
  if (leadScore < 3) {
    return { eligible: false, reason: "score_low" };
  }

  if (task.tags.some((t) => t.name === "do-not-reactivate")) {
    return { eligible: false, reason: "do_not_reactivate" };
  }

  if (getReactivationCount(task) >= 2) {
    return { eligible: false, reason: "max_attempts" };
  }

  const reactivationDateField = task.custom_fields.find(
    (f) => f.id === config.outreachFields.dormantReactivationDate
  );
  if (reactivationDateField && reactivationDateField.value) {
    const reactivationTs = parseInt(String(reactivationDateField.value), 10);
    if (reactivationTs > now.getTime()) {
      return { eligible: false, reason: "not_yet_due" };
    }
  }

  return { eligible: true };
}

// --- Dormancy Check Core ---

export interface DormancyDeps {
  config: Config;
  clickup: ClickUpClient;
  alerter: Alerter;
  logger: Logger;
}

export async function runDormancyCheck(
  deps: DormancyDeps
): Promise<DormancyRunResult> {
  const { config, clickup, alerter, logger } = deps;
  const now = new Date();
  const runId = `dormancy-check-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  logger.setRunId(runId);
  logger.info("Dormancy check starting");

  const result: DormancyRunResult = {
    runId,
    timestamp: now.toISOString(),
    dormantTasksChecked: 0,
    results: {
      reactivated: 0,
      notEligibleScoreLow: 0,
      notEligibleDoNotReactivate: 0,
      notEligibleMaxAttempts: 0,
      notYetDue: 0,
    },
    reactivatedLeads: [],
  };

  const dormantTasks = await clickup.getTasks(config.clickupListId, {
    statuses: ["Dormant"],
    includeClosed: true,
  });

  result.dormantTasksChecked = dormantTasks.length;

  if (dormantTasks.length === 0) {
    logger.info("No dormant leads found. Exiting.");
    return result;
  }

  logger.info("Dormant leads found", { count: dormantTasks.length });

  for (const task of dormantTasks) {
    const eligibility = isDormantEligible(task, config, now);

    if (!eligibility.eligible) {
      switch (eligibility.reason) {
        case "score_low":
          result.results.notEligibleScoreLow += 1;
          break;
        case "do_not_reactivate":
          result.results.notEligibleDoNotReactivate += 1;
          break;
        case "max_attempts":
          result.results.notEligibleMaxAttempts += 1;
          break;
        case "not_yet_due":
          result.results.notYetDue += 1;
          break;
      }
      logger.debug("Dormant lead not eligible", {
        taskId: task.id,
        reason: eligibility.reason,
      });
      continue;
    }

    const currentReactivationCount = getReactivationCount(task);
    const newReactivationNumber = currentReactivationCount + 1;

    const dormantDateField = task.custom_fields.find(
      (f) => f.id === config.outreachFields.dormantDate
    );
    const dormantSince = dormantDateField?.value
      ? new Date(parseInt(String(dormantDateField.value), 10)).toISOString().slice(0, 10)
      : "unknown";

    const companyNameField = task.custom_fields.find(
      (f) => f.id === config.fields.companyName
    );
    const companyName = String(companyNameField?.value ?? task.name);

    try {
      if (!config.dryRun) {
        await clickup.updateTask(task.id, {
          status: "Enriched",
          custom_fields: [
            { id: config.personalizationFields.websiteScrapeSummary, value: "" },
            { id: config.personalizationFields.communitySignals, value: "" },
            { id: config.personalizationFields.personalizationHooks, value: "" },
            { id: config.personalizationFields.emailTouch1, value: "" },
            { id: config.personalizationFields.emailTouch1Subject, value: "" },
            { id: config.personalizationFields.emailTouch2, value: "" },
            { id: config.personalizationFields.emailTouch2Subject, value: "" },
            { id: config.personalizationFields.emailTouch3, value: "" },
            { id: config.personalizationFields.emailTouch3Subject, value: "" },
            { id: config.personalizationFields.linkedinMessage, value: "" },
            { id: config.personalizationFields.reviewDecision, value: 0 },
            { id: config.outreachFields.instantlyCampaignId, value: "" },
            { id: config.outreachFields.instantlyLeadId, value: "" },
            { id: config.outreachFields.sequenceStatus, value: 0 },
          ],
        });

        await clickup.addTag(task.id, "re-engagement");
        await clickup.addTag(task.id, `reactivation-${newReactivationNumber}`);

        await clickup.addComment(
          task.id,
          `Dormancy reactivation: 90-day cool-off complete. Cleared old drafts, moved to Enriched for re-personalization with fresh angle. Reactivation #${newReactivationNumber}.`
        );
      } else {
        logger.info("DRY_RUN: would reactivate lead", {
          taskId: task.id,
          company: companyName,
          reactivationNumber: newReactivationNumber,
        });
      }

      logger.info("Lead reactivated", {
        taskId: task.id,
        company: companyName,
        reactivationNumber: newReactivationNumber,
        dormantSince,
      });

      result.results.reactivated += 1;
      result.reactivatedLeads.push({
        taskId: task.id,
        company: companyName,
        dormantSince,
        reactivationNumber: newReactivationNumber,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to reactivate dormant lead", {
        taskId: task.id,
        error: errorMsg,
      });
      await alerter.send(
        `Dormancy reactivation failed for task ${task.id}`,
        errorMsg
      );
    }
  }

  logger.info("Dormancy check complete", {
    checked: result.dormantTasksChecked,
    reactivated: result.results.reactivated,
    notEligibleScoreLow: result.results.notEligibleScoreLow,
    notEligibleDoNotReactivate: result.results.notEligibleDoNotReactivate,
    notEligibleMaxAttempts: result.results.notEligibleMaxAttempts,
    notYetDue: result.results.notYetDue,
  });

  return result;
}

// --- Cloud Function Entry Point ---

ff.http("dormancyCheck", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("dormancy-check");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });

  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig =
      dryRunOverride !== undefined
        ? { ...config, dryRun: dryRunOverride }
        : config;

    const result = await runDormancyCheck({
      config: effectiveConfig,
      clickup,
      alerter,
      logger,
    });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Dormancy Check", { error: errorMsg });
    await alerter.send("Unhandled error in dormancy-check", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

ff.http("replyPoll", async (req: Request, res: Response) => {
  const config = loadConfig();
  const logger = createLogger("reply-poll");
  const alerter = createAlerter({
    alertEmail: config.alertEmail,
    alertWebhookUrl: config.alertWebhookUrl,
  });
  const clickup = createClickUpClient({
    token: config.clickupApiToken,
    rateLimit: config.clickupRateLimit,
    logger,
  });
  const instantly = createInstantlyClient({ apiKey: config.instantlyApiKey, logger });

  try {
    const dryRunOverride =
      req.body && typeof req.body === "object" && "dry_run" in req.body
        ? req.body.dry_run === true
        : undefined;

    const effectiveConfig =
      dryRunOverride !== undefined
        ? { ...config, dryRun: dryRunOverride }
        : config;

    const result = await runReplyPoll({ config: effectiveConfig, clickup, instantly, alerter, logger });

    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.critical("Unhandled error in Reply Poll", { error: errorMsg });
    await alerter.send("Unhandled error in reply-poll", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});
