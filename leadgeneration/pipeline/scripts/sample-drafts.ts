/**
 * Dry-run copy sampler: generates Ellie drafts for representative leads with the
 * current prompt, for both message angles, and prints them as markdown. No
 * ClickUp or Instantly writes — this is for eyeballing copy changes before a
 * deploy and for pasting samples into review docs.
 *   npx tsx scripts/sample-drafts.ts
 * Reads GEMINI_API_KEY from pipeline/.env.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildPrompt,
  validateDrafts,
  sanitizeDrafts,
  type OutreachAngle,
} from "../src/index.js";
import { createGeminiClient } from "../src/clients/gemini.js";
import { resolveSeasonalContext, findForbiddenSeasonMentions } from "../src/seasonality.js";
import { createLogger } from "../src/logger.js";
import type { LeadData } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(here, "..", ".env"), "utf8");
const geminiKey = envText.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!geminiKey) {
  console.error("GEMINI_API_KEY not found in pipeline/.env");
  process.exit(1);
}

const leads: Array<{ lead: LeadData; website: string }> = [
  {
    lead: {
      taskId: "sample-business",
      companyName: "Westridge Plumbing Ltd.",
      companyDomain: "https://westridgeplumbing.example",
      contactName: "Mike Harmon",
      contactTitle: "Owner",
      segment: "Business",
      category: "Trades & Contractors",
      leadScore: 4,
      companyIndustry: "Construction",
      companyHeadcount: "11-50",
      companyCity: "Abbotsford",
      isReEngagement: false,
    },
    website:
      "## Homepage\n\nWestridge Plumbing has served the Fraser Valley since 2008. Residential and commercial plumbing, 24/7 emergency service. Recently expanded with a second location in Abbotsford. Proud sponsor of Abbotsford Minor Hockey.",
  },
  {
    lead: {
      taskId: "sample-team",
      companyName: "Valley United FC",
      companyDomain: "https://valleyunitedfc.example",
      contactName: "Sandra Leung",
      contactTitle: "Club Manager",
      segment: "Team",
      category: "Soccer Clubs",
      leadScore: 4,
      companyIndustry: "Sports",
      companyHeadcount: "5-10",
      companyCity: "Langley",
      isReEngagement: false,
    },
    website:
      "## Homepage\n\nValley United FC is a community soccer club in Langley with 32 teams from U6 to adult. Fall registration is open now. The club runs an annual fundraising drive to keep fees affordable.",
  },
];

const gemini = createGeminiClient({ apiKey: geminiKey, logger: createLogger("sample-drafts") });
const seasonal = resolveSeasonalContext(new Date());
const angles: OutreachAngle[] = ["deadline", "direct-ask"];

const out: string[] = [`# Ellie sample drafts (${new Date().toISOString().slice(0, 10)})`, ""];

for (const { lead, website } of leads) {
  for (const angle of angles) {
    out.push(`## ${lead.companyName} (${lead.segment}) — angle: ${angle}`, "");

    // Mirror the pipeline's bounded retry: failed validation feeds back into the
    // next attempt so samples reflect what the personalize agent actually ships.
    let drafts;
    let errors: string[] = [];
    let retryFeedback: string | undefined;
    let attempts = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      attempts = attempt;
      const prompt = buildPrompt(lead, website, seasonal, angle, retryFeedback);
      const result = await gemini.generateDrafts(prompt);
      if (!result.drafts) {
        errors = [`GENERATION FAILED: ${result.error ?? "no drafts"}`];
        drafts = undefined;
        break;
      }
      const candidate = sanitizeDrafts(result.drafts);
      errors = [
        ...validateDrafts(candidate, lead),
        ...findForbiddenSeasonMentions(
          [
            candidate.email_touch_1_body,
            candidate.email_touch_2_body,
            candidate.email_touch_3_body,
            candidate.email_touch_1_subject,
            candidate.email_touch_2_subject,
            candidate.email_touch_3_subject,
            candidate.linkedin_message,
          ],
          seasonal
        ),
      ];
      drafts = candidate;
      if (errors.length === 0) break;
      retryFeedback = errors.join("; ");
    }
    if (!drafts) {
      out.push(errors.join("; "), "");
      continue;
    }
    out.push(
      `Validators: ${errors.length === 0 ? `PASS (attempt ${attempts})` : `FAIL after ${attempts} attempts — ${errors.join("; ")}`}`,
      ""
    );
    for (const n of [1, 2, 3] as const) {
      const subject = drafts[`email_touch_${n}_subject`];
      const body = drafts[`email_touch_${n}_body`];
      out.push(`### Touch ${n}: ${subject}`, "", body, "");
    }
    out.push(`### LinkedIn note`, "", drafts.linkedin_message, "");
  }
}

console.log(out.join("\n"));
