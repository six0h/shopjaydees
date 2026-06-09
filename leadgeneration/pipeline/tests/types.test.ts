import { describe, it, expect } from "vitest";
import {
  type Segment,
  type Category,
  type ProspectStatus,
  type ProspectingRequestStatus,
  type HunterContact,
  type HunterCompany,
  type ProspectingRequest,
  type LeadScoreResult,
  type DiscoveryRunResult,
  type RequestResult,
  SEGMENTS,
  PROSPECT_STATUSES,
  PROSPECTING_REQUEST_STATUSES,
} from "../src/types.js";

describe("types", () => {
  it("exports all three segments", () => {
    expect(SEGMENTS).toEqual(["Business", "School", "Team"]);
  });

  it("exports prospect statuses matching ClickUp data model", () => {
    expect(PROSPECT_STATUSES).toContain("New");
    expect(PROSPECT_STATUSES).toContain("Enriched");
    expect(PROSPECT_STATUSES).toContain("Parked");
    expect(PROSPECT_STATUSES).toContain("Dormant");
    expect(PROSPECT_STATUSES).toContain("Unsubscribed");
    expect(PROSPECT_STATUSES).toContain("Bounced");
  });

  it("exports prospecting request statuses", () => {
    expect(PROSPECTING_REQUEST_STATUSES).toEqual([
      "Requested",
      "Running",
      "Complete",
      "Failed",
    ]);
  });
});
