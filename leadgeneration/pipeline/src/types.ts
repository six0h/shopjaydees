export const SEGMENTS = ["Business", "School", "Team"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PROSPECT_STATUSES = [
  "New",
  "Enriched",
  "Personalizing",
  "Ready for Review",
  "Approved",
  "Outreach Active",
  "Responded - Owner Follow-up",
  "Parked",
  "Won",
  "Lost",
  "Dormant",
  "Unsubscribed",
  "Bounced",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECTING_REQUEST_STATUSES = [
  "Requested",
  "Running",
  "Complete",
  "Failed",
] as const;
export type ProspectingRequestStatus =
  (typeof PROSPECTING_REQUEST_STATUSES)[number];

export const BUSINESS_CATEGORIES = [
  "Trades & Contractors",
  "Restaurants & Hospitality",
  "Fitness & Wellness",
  "Real Estate & Property Mgmt",
  "Auto & Trades Shops",
] as const;

export const SCHOOL_CATEGORIES = [
  "Elementary & Secondary",
  "Independent & Private Schools",
  "Daycares & Preschools",
  "Post-Secondary Clubs",
] as const;

export const TEAM_CATEGORIES = [
  "Youth Sports Leagues",
  "Adult Rec Leagues",
  "Dance & Performance",
  "Community Sport Orgs",
] as const;

export type Category =
  | (typeof BUSINESS_CATEGORIES)[number]
  | (typeof SCHOOL_CATEGORIES)[number]
  | (typeof TEAM_CATEGORIES)[number]
  | "Other";

export const CITIES = [
  "Surrey",
  "Langley",
  "Abbotsford",
  "Chilliwack",
  "Mission",
  "Maple Ridge",
  "Burnaby",
  "New Westminster",
  "Coquitlam",
  "Port Coquitlam",
  "Pitt Meadows",
  "Richmond",
  "Delta",
  "North Vancouver",
  "Vancouver",
  "Other",
] as const;
export type City = (typeof CITIES)[number];

export const GEOGRAPHIC_PHASES = [
  "Phase 1 - Fraser Valley Core",
  "Phase 2 - Tri-Cities & Burnaby",
  "Phase 3 - Metro Vancouver",
  "Future - Rest of BC+",
] as const;
export type GeographicPhase = (typeof GEOGRAPHIC_PHASES)[number];

export interface HunterContact {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  position: string | null;
  value: string;
  type: "personal" | "generic";
  confidence: number;
  linkedin: string | null;
  phone_number: string | null;
  sources: Array<{ uri: string; domain: string }>;
}

export interface HunterCompany {
  domain: string;
  organization: string;
  industry: string | null;
  emails: HunterContact[];
}

export interface ProspectingRequest {
  taskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  maxResults: number;
}

export interface LeadScoreResult {
  score: number;
  rationale: string;
}

export interface RequestResult {
  requestTaskId: string;
  segment: Segment;
  category: Category;
  targetCity: City;
  resultsFound: number;
  leadsCreated: number;
  leadsParked: number;
  duplicatesSkipped: number;
  noContactSkipped: number;
  status: "completed" | "failed";
  error?: string;
}

export interface DiscoveryRunResult {
  runId: string;
  timestamp: string;
  requestsFound: number;
  requestsProcessed: number;
  results: {
    completed: number;
    failed: number;
    staleReset: number;
  };
  requests: RequestResult[];
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string };
  date_created: string;
  date_updated: string;
  custom_fields: Array<{
    id: string;
    name: string;
    value: unknown;
    type: string;
    type_config?: { options?: Array<{ id: string; name: string; orderindex: number }> };
  }>;
  tags: Array<{ name: string }>;
}

export interface ClickUpFieldOption {
  id: string;
  name: string;
  orderindex: number;
}
