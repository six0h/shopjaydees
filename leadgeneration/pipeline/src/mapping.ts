import type { Category, City, GeographicPhase, DiscoverFilters } from "./types.js";

const CATEGORY_SEARCH_MAP: Record<string, string> = {
  "Trades & Contractors":
    "plumbing electrical HVAC construction contractor",
  "Restaurants & Hospitality":
    "restaurant food beverage hospitality catering",
  "Fitness & Wellness": "fitness gym wellness yoga pilates recreation",
  "Real Estate & Property Mgmt":
    "real estate property management brokerage",
  "Auto & Trades Shops": "automotive auto repair mechanic body shop",
  "Elementary & Secondary":
    "school elementary secondary high school education",
  "Independent & Private Schools": "private school independent academy",
  "Daycares & Preschools": "daycare preschool childcare early learning",
  "Post-Secondary Clubs":
    "university college student club association",
  "Youth Sports Leagues":
    "youth sports league minor hockey soccer baseball",
  "Adult Rec Leagues": "adult recreation league sports beer league",
  "Dance & Performance":
    "dance studio martial arts performing arts gymnastics",
  "Community Sport Orgs":
    "community sport organization recreation association",
};

export function categoryToSearchQuery(category: Category): string {
  return CATEGORY_SEARCH_MAP[category] ?? category;
}

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

export function buildSearchQuery(
  category: Category,
  city: City
): string {
  const terms = categoryToSearchQuery(category);
  return `${terms} ${city} BC Canada`;
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
