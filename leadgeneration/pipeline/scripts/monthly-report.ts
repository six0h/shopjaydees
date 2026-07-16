/**
 * On-demand runner: prints the MonthlyReportSummary JSON for a given month
 * (default: previous calendar month). Read-only — GET-only calls to
 * Instantly + ClickUp via the existing clients. No writes.
 *
 *   npx tsx scripts/monthly-report.ts [YYYY-MM]
 *
 * Loads pipeline/.env itself (see loadEnvFile below) so it can be run the
 * same way spike-emails.ts is, without a global dotenv dependency.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { createInstantlyClient } from "../src/clients/instantly.js";
import { createClickUpClient } from "../src/clients/clickup.js";
import { buildMonthlyReport } from "../src/report.js";

/**
 * Minimal inline .env loader: reads KEY=VALUE lines from pipeline/.env
 * (relative to this script) and sets process.env[KEY] only if not already
 * set. No new dependency (no dotenv/tsx-specific env loading assumed).
 */
function loadEnvFile(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(scriptDir, "..", ".env");
  let contents: string;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return; // no .env file; rely on whatever is already in process.env
  }
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function previousMonth(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; previous month handles Jan rollover
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  loadEnvFile();
  const month = process.argv[2] ?? previousMonth(new Date());
  const config = loadConfig();
  const logger = createLogger("monthly-report");
  const instantly = createInstantlyClient({ apiKey: config.instantlyApiKey, logger });
  const clickup = createClickUpClient({ token: config.clickupApiToken, rateLimit: config.clickupRateLimit, logger });
  const summary = await buildMonthlyReport({ config, instantly, clickup, logger }, month);
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
