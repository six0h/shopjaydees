/**
 * One-off (2026-08-11): push every lead sitting in "Ready for Review" back to
 * "Enriched" so the next scheduled personalize run regenerates its drafts with
 * the impact-and-urgency prompt. Approved leads are deliberately untouched:
 * Jenn signed those off and they are the send agent's queue.
 *   npx tsx scripts/regenerate-pending.ts          # dry run (default): list only
 *   npx tsx scripts/regenerate-pending.ts --apply  # perform the status updates
 * Add --include-approved to ALSO pull back leads in "Approved". That discards
 * Jenn's sign-off on those leads (she has to re-review them), so only run it
 * when a human has decided the approved-but-unsent copy should not go out.
 * Reads CLICKUP_API_TOKEN and CLICKUP_LIST_ID from pipeline/.env.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClickUpClient } from "../src/clients/clickup.js";
import { createLogger } from "../src/logger.js";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "..", ".env"), "utf8");
const env = (name: string): string => {
  const value = envText.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
  if (!value) {
    console.error(`${name} not found in pipeline/.env`);
    process.exit(1);
  }
  return value;
};

const apply = process.argv.includes("--apply");
const includeApproved = process.argv.includes("--include-approved");
const statuses = includeApproved
  ? ["Ready for Review", "Approved"]
  : ["Ready for Review"];
const clickup = createClickUpClient({
  token: env("CLICKUP_API_TOKEN"),
  rateLimit: 60,
  logger: createLogger("regenerate-pending"),
});

const tasks = await clickup.getTasks(env("CLICKUP_LIST_ID"), { statuses });
console.log(`${tasks.length} task(s) in ${statuses.map((s) => `"${s}"`).join(" + ")}`);

for (const task of tasks) {
  if (apply) {
    await clickup.updateTask(task.id, { status: "Enriched" });
    console.log(`reset  ${task.id}  ${task.name}`);
  } else {
    console.log(`would reset  ${task.id}  ${task.name}`);
  }
}

console.log(
  apply
    ? "Done. The next scheduled personalize run (5:00am weekdays) will regenerate these with the new prompt."
    : "Dry run only. Re-run with --apply to perform the reset."
);
