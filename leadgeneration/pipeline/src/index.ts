import * as ff from "@google-cloud/functions-framework";
import type { Request, Response } from "@google-cloud/functions-framework";
import type { ClickUpClient } from "./clients/clickup.js";
import type { HunterClient } from "./clients/hunter.js";
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
} from "./types.js";
import { scoreLead } from "./scoring.js";
import { buildSearchQuery, cityToPhase } from "./mapping.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createAlerter } from "./alerting.js";
import { createClickUpClient } from "./clients/clickup.js";
import { createHunterClient } from "./clients/hunter.js";

// --- Contact Selection ---

const TITLE_PRIORITY: string[][] = [
  ["owner", "president", "ceo"],
  ["principal", "head of school", "director"],
  ["manager", "coordinator"],
];

const MIN_CONTACT_CONFIDENCE = 40;

function titlePriorityRank(position: string | null): number {
  if (!position) return TITLE_PRIORITY.length + 1;
  const lower = position.toLowerCase();
  for (let i = 0; i < TITLE_PRIORITY.length; i++) {
    if (TITLE_PRIORITY[i].some((t) => lower.includes(t))) return i;
  }
  return TITLE_PRIORITY.length;
}

export function selectBestContact(
  contacts: HunterContact[]
): HunterContact | null {
  const eligible = contacts.filter(
    (c) => c.type === "personal" && c.confidence >= MIN_CONTACT_CONFIDENCE
  );
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const rankDiff = titlePriorityRank(a.position) - titlePriorityRank(b.position);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });

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

function extractRequestFields(task: ClickUpTask): {
  segment: Segment;
  category: Category;
  targetCity: City;
  maxResults: number;
} {
  let segment: Segment = "Business";
  let category: Category = "Other";
  let targetCity: City = "Surrey";
  let maxResults = 25;

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
    if (field.name === "Max Results" && typeof field.value === "number") {
      maxResults = field.value;
    }
  }

  return { segment, category, targetCity, maxResults };
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
      await clickup.updateTask(task.id, { status: "Requested" });
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
  logger.info("Hunter.io quota", { used: quota.used, available: quota.available });

  // Process each request
  for (const requestTask of requests) {
    const { segment, category, targetCity, maxResults } =
      extractRequestFields(requestTask);
    const requestResult: RequestResult = {
      requestTaskId: requestTask.id,
      segment,
      category,
      targetCity,
      resultsFound: 0,
      leadsCreated: 0,
      leadsParked: 0,
      duplicatesSkipped: 0,
      noContactSkipped: 0,
      status: "completed",
    };

    try {
      // Quota check per request
      if (quota.available < maxResults) {
        const msg = `Hunter.io quota insufficient: ${quota.available} available, ${maxResults} needed`;
        logger.warn(msg);
        await alerter.send("Hunter.io monthly quota low", msg);
        requestResult.status = "failed";
        requestResult.error = msg;
        result.results.failed += 1;
        result.requests.push(requestResult);
        continue;
      }

      // Step 3: Lock request
      await clickup.updateTask(requestTask.id, { status: "Running" });

      // Step 4: Query Hunter.io
      const searchQuery = buildSearchQuery(category, targetCity);
      logger.info("Querying Hunter.io", { searchQuery, maxResults });
      const hunterResponse = await hunter.searchDomain(searchQuery, maxResults);
      const companies = hunterResponse.data;
      requestResult.resultsFound = hunterResponse.meta.results;

      // Process the single domain result
      if (!companies.emails || companies.emails.length === 0) {
        logger.info("No contacts found", { domain: companies.domain });
      } else {
        // Map Hunter response emails to HunterContact (add full_name)
        const contacts: HunterContact[] = companies.emails.map((e) => ({
          ...e,
          full_name:
            e.first_name && e.last_name
              ? `${e.first_name} ${e.last_name}`
              : e.first_name ?? e.last_name ?? null,
        }));

        // Step 5: Select best contact
        const bestContact = selectBestContact(contacts);
        if (!bestContact) {
          logger.info("NO_CONTACT: No suitable decision-maker", {
            domain: companies.domain,
          });
          requestResult.noContactSkipped += 1;
        } else {
          // Step 6: Dedup check
          const existing = await clickup.getTasks(config.clickupListId, {
            customFields: [
              {
                field_id: config.fields.companyDomain,
                operator: "=",
                value: `https://${companies.domain}`,
              },
            ],
            includeClosed: true,
          });

          if (existing.length > 0) {
            logger.info("SKIP: duplicate", {
              domain: companies.domain,
              existingTaskId: existing[0].id,
            });
            requestResult.duplicatesSkipped += 1;
          } else {
            // Step 7: Score
            const scoreResult = scoreLead({
              emailConfidence: bestContact.confidence,
              contactTitle: bestContact.position,
              headcount: null,
              hasDomain: !!companies.domain,
            });

            const status = scoreResult.score >= 3 ? "Enriched" : "Parked";
            const contactName =
              bestContact.full_name ??
              [bestContact.first_name, bestContact.last_name]
                .filter(Boolean)
                .join(" ") ??
              bestContact.value;
            const taskName = `${companies.organization || companies.domain} — ${contactName}`;
            const caslSourceUrl = extractCaslSourceUrl(
              bestContact,
              companies.domain
            );
            const importBatch = `${now.toISOString().slice(0, 10)}-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${targetCity.toLowerCase()}`;

            // Step 8: Create ClickUp task
            if (!config.dryRun) {
              const segmentIndex = resolveDropdownValue(
                dropdownOptions[config.fields.segment],
                segment
              );
              const categoryIndex = resolveDropdownValue(
                dropdownOptions[config.fields.category],
                category
              );
              const cityIndex = resolveDropdownValue(
                dropdownOptions[config.fields.companyCity],
                targetCity
              );
              const phaseLabel = cityToPhase(targetCity);
              const phaseIndex = resolveDropdownValue(
                dropdownOptions[config.fields.geographicPhase],
                phaseLabel
              );

              await clickup.createTask(config.clickupListId, {
                name: taskName,
                status,
                custom_fields: [
                  { id: config.fields.companyName, value: companies.organization || companies.domain },
                  { id: config.fields.companyDomain, value: `https://${companies.domain}` },
                  { id: config.fields.companyIndustry, value: "" },
                  { id: config.fields.companyHeadcount, value: "" },
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

            logger.info("Lead created", {
              taskName,
              score: scoreResult.score,
              status,
              dryRun: config.dryRun,
            });
          }
        }
      }

      // Step 9: Update Prospecting Request
      if (!config.dryRun) {
        await clickup.updateTask(requestTask.id, {
          status: "Complete",
          custom_fields: [
            { id: config.prospectingFields.resultsFound, value: requestResult.resultsFound },
            { id: config.prospectingFields.leadsCreated, value: requestResult.leadsCreated },
            { id: config.prospectingFields.leadsParked, value: requestResult.leadsParked },
            { id: config.prospectingFields.duplicatesSkipped, value: requestResult.duplicatesSkipped },
          ],
        });
        await clickup.addComment(
          requestTask.id,
          `Completed: ${requestResult.resultsFound} companies found, ${requestResult.leadsCreated} leads created (score 3+), ${requestResult.leadsParked} parked (score 1-2), ${requestResult.duplicatesSkipped} duplicates skipped`
        );
      }

      result.results.completed += 1;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Request processing failed", {
        requestTaskId: requestTask.id,
        error: errorMsg,
      });
      requestResult.status = "failed";
      requestResult.error = errorMsg;
      result.results.failed += 1;

      // Set request to Failed in ClickUp
      try {
        await clickup.updateTask(requestTask.id, { status: "Failed" });
        await clickup.addComment(requestTask.id, `Error: ${errorMsg}`);
      } catch {
        // Best effort — don't let status update failure mask the real error
      }

      await alerter.send(
        `Discovery agent error on request ${requestTask.id}`,
        errorMsg
      );
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
