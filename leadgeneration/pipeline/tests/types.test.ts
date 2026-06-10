import { describe, it, expect } from "vitest";
import {
  type Segment,
  type Category,
  type ProspectStatus,
  type ProspectingRequestStatus,
  type GeminiDraftOutput,
  type PersonalizationRunResult,
  type LeadPersonalizationResult,
  type FirecrawlScrapeResult,
  type SendRunResult,
  type SendLeadResult,
  type DormancyRunResult,
  type DormancyLeadResult,
  SEGMENTS,
  PROSPECT_STATUSES,
  PROSPECTING_REQUEST_STATUSES,
  ABOUT_PATH_KEYWORDS,
  COMMUNITY_PATH_KEYWORDS,
  SENDING_DOMAINS,
  SEQUENCE_STATUSES,
} from "../src/types.js";

describe("types", () => {
  it("exports all three segments", () => {
    expect(SEGMENTS).toEqual(["Business", "School", "Team"]);
  });

  it("exports prospect statuses matching ClickUp data model", () => {
    expect(PROSPECT_STATUSES).toContain("New");
    expect(PROSPECT_STATUSES).toContain("Enriched");
    expect(PROSPECT_STATUSES).toContain("Personalizing");
    expect(PROSPECT_STATUSES).toContain("Ready for Review");
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

  it("exports about page path keywords for secondary page discovery", () => {
    expect(ABOUT_PATH_KEYWORDS).toContain("/about");
    expect(ABOUT_PATH_KEYWORDS).toContain("/about-us");
    expect(ABOUT_PATH_KEYWORDS).toContain("/our-story");
    expect(ABOUT_PATH_KEYWORDS).toContain("/team");
  });

  it("exports community page path keywords for secondary page discovery", () => {
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/community");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/giving");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/charity");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/sponsorship");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/csr");
    expect(COMMUNITY_PATH_KEYWORDS).toContain("/give-back");
  });

  it("exports sending domains", () => {
    expect(SENDING_DOMAINS).toEqual(["shopjaydees.ca", "shopjaydees.net"]);
  });

  it("exports sequence statuses matching ClickUp data model", () => {
    expect(SEQUENCE_STATUSES).toContain("Not Started");
    expect(SEQUENCE_STATUSES).toContain("Touch 1 Sent");
    expect(SEQUENCE_STATUSES).toContain("Touch 2 Sent");
    expect(SEQUENCE_STATUSES).toContain("Touch 3 Sent");
    expect(SEQUENCE_STATUSES).toContain("Sequence Complete");
    expect(SEQUENCE_STATUSES).toContain("Paused");
    expect(SEQUENCE_STATUSES).toContain("Cancelled");
  });
});
