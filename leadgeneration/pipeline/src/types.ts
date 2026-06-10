export const SEGMENTS = ["Business", "School", "Team"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PROSPECT_STATUSES = [
  "New",
  "Enriched",
  "Personalizing",
  "Ready for Review",
  "Approved",
  "Outreach Active",
  "Responded - Follow-up",
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

// --- Personalization Agent Types ---

export const ABOUT_PATH_KEYWORDS = [
  "/about",
  "/about-us",
  "/our-story",
  "/team",
] as const;

export const COMMUNITY_PATH_KEYWORDS = [
  "/community",
  "/giving",
  "/charity",
  "/sponsorship",
  "/csr",
  "/give-back",
] as const;

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode?: number;
    };
    links?: string[];
  };
}

export interface GeminiDraftOutput {
  website_scrape_summary: string;
  community_signals: string;
  personalization_hooks: string;
  email_touch_1_subject: string;
  email_touch_1_body: string;
  email_touch_2_subject: string;
  email_touch_2_body: string;
  email_touch_3_subject: string;
  email_touch_3_body: string;
  linkedin_message: string;
  casl_opt_out_check: boolean;
  casl_relevance_rationale: string;
}

export interface LeadData {
  taskId: string;
  companyName: string;
  companyDomain: string;
  contactName: string;
  contactTitle: string;
  segment: string;
  category: string;
  leadScore: number;
  companyIndustry: string;
  companyHeadcount: string;
  companyCity: string;
  isReEngagement: boolean;
}

export interface LeadPersonalizationResult {
  taskId: string;
  company: string;
  status: "success" | "generation_failed" | "casl_blocked" | "deferred";
  scrapePages: number;
  geminiTokensUsed: number;
  tagsAdded: string[];
  error?: string;
}

export interface PersonalizationRunResult {
  runId: string;
  timestamp: string;
  batchSizeRequested: number;
  leadsAvailable: number;
  leadsProcessed: number;
  results: {
    success: number;
    generationFailed: number;
    caslBlocked: number;
    scrapeFailedButProceeded: number;
    stuckLeadsReset: number;
  };
  leads: LeadPersonalizationResult[];
  deferredRemaining: number;
}

// --- Send Agent Types ---

export const SENDING_DOMAINS = ["shopjaydees.ca", "shopjaydees.net"] as const;
export type SendingDomain = (typeof SENDING_DOMAINS)[number];

export const SEQUENCE_STATUSES = [
  "Not Started",
  "Touch 1 Sent",
  "Touch 2 Sent",
  "Touch 3 Sent",
  "Sequence Complete",
  "Paused",
  "Cancelled",
] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export interface SendLeadResult {
  taskId: string;
  company: string;
  email: string;
  status: "sent" | "instantly_duplicate" | "invalid_email" | "deferred_rate_limit" | "error";
  campaignId: string | null;
  sendingDomain: string | null;
  error?: string;
}

export interface SendRunResult {
  runId: string;
  timestamp: string;
  leadsQueued: number;
  results: {
    sent: number;
    instantlyDuplicate: number;
    invalidEmail: number;
    deferredRateLimit: number;
    errors: number;
  };
  leads: SendLeadResult[];
}

// --- Dormancy Check Types ---

export interface DormancyLeadResult {
  taskId: string;
  company: string;
  dormantSince: string;
  reactivationNumber: number;
}

export interface DormancyRunResult {
  runId: string;
  timestamp: string;
  dormantTasksChecked: number;
  results: {
    reactivated: number;
    notEligibleScoreLow: number;
    notEligibleDoNotReactivate: number;
    notEligibleMaxAttempts: number;
    notYetDue: number;
  };
  reactivatedLeads: DormancyLeadResult[];
}
