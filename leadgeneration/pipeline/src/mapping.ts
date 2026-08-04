import type { Category, City, GeographicPhase, DiscoverFilters } from "./types.js";

const PHASE_1_CITIES = new Set([
  "Surrey",
  "Langley",
  "Abbotsford",
  "Chilliwack",
  "Mission",
  "Maple Ridge",
]);

const PHASE_2_CITIES = new Set([
  "Burnaby",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Pitt Meadows",
]);

const PHASE_3_CITIES = new Set([
  "Richmond",
  "Delta",
  "North Vancouver",
  "Vancouver",
]);

export function cityToPhase(city: City): GeographicPhase {
  if (PHASE_1_CITIES.has(city)) return "Phase 1 - Fraser Valley Core";
  if (PHASE_2_CITIES.has(city)) return "Phase 2 - Tri-Cities & Burnaby";
  if (PHASE_3_CITIES.has(city)) return "Phase 3 - Metro Vancouver";
  return "Future - Rest of BC+";
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Trades & Contractors": ["plumbing", "electrical", "HVAC", "construction", "contractor"],
  "Restaurants & Hospitality": ["restaurant", "food", "beverage", "hospitality", "catering"],
  "Fitness & Wellness": ["fitness", "gym", "wellness", "yoga", "pilates", "recreation"],
  "Real Estate & Property Mgmt": ["real estate", "property management", "brokerage"],
  "Auto & Trades Shops": ["automotive", "auto repair", "mechanic", "body shop"],
  "Elementary & Secondary": ["school", "elementary", "secondary", "high school", "education"],
  "Independent & Private Schools": ["private school", "independent", "academy"],
  "Daycares & Preschools": ["daycare", "preschool", "childcare", "early learning"],
  "Post-Secondary Clubs": ["university", "college", "student club", "association"],
  "Youth Sports Leagues": ["youth sports", "league", "minor hockey", "soccer", "baseball"],
  "Adult Rec Leagues": ["adult recreation", "league", "sports", "beer league"],
  "Dance & Performance": ["dance studio", "martial arts", "performing arts", "gymnastics"],
  "Community Sport Orgs": ["community sport", "organization", "recreation", "association"],
};

export function categoryToDiscoverFilters(
  category: Category,
  city: City
): DiscoverFilters {
  const keywords = CATEGORY_KEYWORDS[category] ?? [category];
  return {
    headquarters_location: { include: [{ country: "CA", city }] },
    keywords: { include: keywords, match: "any" },
  };
}

/**
 * Optional per-ticket "Company Size" dropdown on a Prospecting Request, mapped to
 * the Hunter Discover headcount ranges it should target. A blank field is absent
 * from this map and the pipeline falls back to config.hunterDefaultHeadcount.
 * Options are all small on purpose (the client wants to reach smaller businesses).
 */
export const COMPANY_SIZE_HEADCOUNTS: Record<string, string[]> = {
  "Micro (1-10)": ["1-10"],
  "Small (11-50)": ["11-50"],
  "1-50 (small+micro)": ["1-10", "11-50"],
};

/** Upper bound of a Hunter headcount range string ("11-50" -> 50, "10001+" -> Infinity). */
function headcountRangeMax(range: string): number {
  const bounded = range.match(/^(\d+)-(\d+)$/);
  if (bounded) return parseInt(bounded[2], 10);
  const open = range.match(/^(\d+)\+$/);
  if (open) return Number.POSITIVE_INFINITY;
  return Number.POSITIVE_INFINITY;
}

/**
 * True when every requested headcount range tops out at 50 or fewer, i.e. the
 * ticket is deliberately targeting small companies. Used to neutralise the
 * headcount bias in lead scoring so small leads are not parked for being small.
 */
export function headcountsAreSmall(ranges: string[]): boolean {
  return ranges.length > 0 && ranges.every((r) => headcountRangeMax(r) <= 50);
}
