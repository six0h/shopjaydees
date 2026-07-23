// The selling calendar. SOURCE OF TRUTH: wiki/topics/seasonal-playbook.md
// (BC Lower Mainland buying occasions + ~6-10wk cold-lead-to-delivery lead time).
// Each period sells the season that is COMING, and allows only its sellingSeason
// word; every other season word fails validation. "autumn" rides with "fall".
export interface SeasonalContext {
  period: string;
  sellingSeason: string;
  forbiddenSeasons: string[];
  theme: string;
  segmentFocus: string;
}

interface Quarter {
  months: number[]; // 0-indexed
  ctx: SeasonalContext;
}

const QUARTERS: Quarter[] = [
  {
    months: [5, 6, 7], // Jun, Jul, Aug
    ctx: {
      period: "June to August",
      sellingSeason: "fall",
      forbiddenSeasons: ["spring", "summer", "winter"],
      theme: "Lock in your fall order early",
      segmentFocus: "Fall-sports teams, businesses",
    },
  },
  {
    months: [8, 9, 10], // Sep, Oct, Nov
    ctx: {
      period: "September to November",
      sellingSeason: "winter",
      forbiddenSeasons: ["spring", "summer", "fall", "autumn"],
      theme: "Year-end gear and appreciation",
      segmentFocus: "Businesses, teams",
    },
  },
  {
    months: [11, 0, 1], // Dec, Jan, Feb
    ctx: {
      period: "December to February",
      sellingSeason: "spring",
      forbiddenSeasons: ["summer", "fall", "autumn", "winter"],
      theme: "New year, fresh look",
      segmentFocus: "Businesses, spring-sports teams",
    },
  },
  {
    months: [2, 3, 4], // Mar, Apr, May
    ctx: {
      period: "March to May",
      sellingSeason: "summer",
      forbiddenSeasons: ["fall", "autumn", "winter", "spring"],
      theme: "Gear up for your season",
      segmentFocus: "Teams, trades, businesses",
    },
  },
];

export function resolveSeasonalContext(now: Date): SeasonalContext {
  const month = now.getUTCMonth();
  const quarter = QUARTERS.find((q) => q.months.includes(month));
  // Every month 0-11 is covered by exactly one quarter above.
  return quarter!.ctx;
}

/**
 * Detects any forbidden-season word in the given prospect-facing fields.
 * One error per distinct forbidden word (not per occurrence). Word-bounded and
 * case-insensitive. Blunt by design: a stray "don't let it fall through" may trip
 * a regenerate — accepted, since the cost is a retry, not bad client-facing copy.
 */
export function findForbiddenSeasonMentions(
  fields: string[],
  seasonal: SeasonalContext
): string[] {
  const errors: string[] = [];
  const haystack = fields.join("\n").toLowerCase();
  for (const word of seasonal.forbiddenSeasons) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(haystack)) {
      errors.push(
        `draft references "${word}"; the selling season is "${seasonal.sellingSeason}" — rewrite the seasonal angle`
      );
    }
  }
  return errors;
}

/** Highest N among `personalize-attempt-N` tags, or 1 if none present. */
export function crossRunAttemptCount(tags: Array<{ name: string }>): number {
  let max = 1;
  for (const tag of tags) {
    const m = /^personalize-attempt-(\d+)$/.exec(tag.name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max;
}
