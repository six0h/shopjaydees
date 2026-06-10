import type { LeadScoreResult } from "./types.js";

const DECISION_MAKER_TITLES = [
  "owner",
  "president",
  "ceo",
  "principal",
  "director",
  "head of school",
];

interface ScoreInput {
  emailConfidence: number;
  contactTitle: string | null;
  seniority: string | null;
  headcount: string | null;
  hasDomain: boolean;
}

function headcountAtLeast11(headcount: string | null): boolean {
  if (!headcount) return false;
  const match = headcount.match(/^(\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) >= 11;
}

function isDecisionMaker(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return DECISION_MAKER_TITLES.some((t) => lower.includes(t));
}

function isSmallOrUnknownHeadcount(headcount: string | null): boolean {
  if (!headcount) return true;
  const match = headcount.match(/^(\d+)/);
  if (!match) return true;
  return parseInt(match[1], 10) <= 10;
}

export function scoreLead(input: ScoreInput): LeadScoreResult {
  let score = 3;
  const reasons: string[] = [];

  // +1 for high email confidence
  if (input.emailConfidence >= 90) {
    score += 1;
    reasons.push(`confidence ${input.emailConfidence}%`);
  }

  // +1 for decision-maker title
  if (isDecisionMaker(input.contactTitle)) {
    score += 1;
    reasons.push(`${input.contactTitle} title`);
  }

  // +1 for meaningful headcount (11+)
  if (headcountAtLeast11(input.headcount)) {
    score += 1;
    reasons.push(`${input.headcount} headcount`);
  }

  if (input.hasDomain) {
    reasons.push("has domain");
  }

  // -1 for low email confidence
  if (input.emailConfidence < 50) {
    score -= 1;
    reasons.push(`low confidence ${input.emailConfidence}%`);
  }

  // -1 for small or unknown headcount when a non-DM title is present
  // (DM titles are exempt: if they're the decision-maker we don't penalise unknown size)
  if (
    input.contactTitle !== null &&
    !isDecisionMaker(input.contactTitle) &&
    input.seniority !== "executive" &&
    isSmallOrUnknownHeadcount(input.headcount)
  ) {
    score -= 1;
    reasons.push(input.headcount ? `${input.headcount} headcount` : "unknown headcount");
  }

  score = Math.max(1, Math.min(5, score));

  return {
    score,
    rationale: `Auto-scored: ${reasons.join(", ")} -> ${score}`,
  };
}
