import { describe, it, expect } from "vitest";
import {
  categoryToDiscoverFilters,
  cityToPhase,
  COMPANY_SIZE_HEADCOUNTS,
  headcountsAreSmall,
} from "../src/mapping.js";

describe("cityToPhase", () => {
  it("maps Surrey to Phase 1", () => {
    expect(cityToPhase("Surrey")).toBe("Phase 1 - Fraser Valley Core");
  });

  it("maps Burnaby to Phase 2", () => {
    expect(cityToPhase("Burnaby")).toBe("Phase 2 - Tri-Cities & Burnaby");
  });

  it("maps Vancouver to Phase 3", () => {
    expect(cityToPhase("Vancouver")).toBe("Phase 3 - Metro Vancouver");
  });

  it("maps Other to Future", () => {
    expect(cityToPhase("Other")).toBe("Future - Rest of BC+");
  });

  it("maps all Phase 1 cities correctly", () => {
    for (const city of ["Surrey", "Langley", "Abbotsford", "Chilliwack", "Mission", "Maple Ridge"]) {
      expect(cityToPhase(city as any)).toBe("Phase 1 - Fraser Valley Core");
    }
  });

  it("maps all Phase 2 cities correctly", () => {
    for (const city of ["Burnaby", "New Westminster", "Coquitlam", "Port Coquitlam", "Pitt Meadows"]) {
      expect(cityToPhase(city as any)).toBe("Phase 2 - Tri-Cities & Burnaby");
    }
  });

  it("maps all Phase 3 cities correctly", () => {
    for (const city of ["Richmond", "Delta", "North Vancouver", "Vancouver"]) {
      expect(cityToPhase(city as any)).toBe("Phase 3 - Metro Vancouver");
    }
  });
});

describe("categoryToDiscoverFilters", () => {
  it("returns structured filters for Trades & Contractors", () => {
    const filters = categoryToDiscoverFilters("Trades & Contractors", "Surrey");
    expect(filters.keywords?.include).toEqual(
      expect.arrayContaining(["plumbing", "electrical", "HVAC", "construction", "contractor"])
    );
    expect(filters.keywords?.match).toBe("any");
    expect(filters.headquarters_location?.include).toEqual([{ country: "CA", city: "Surrey" }]);
    expect(filters.headcount).toBeUndefined();
  });

  it("returns structured filters for Elementary & Secondary", () => {
    const filters = categoryToDiscoverFilters("Elementary & Secondary", "Langley");
    expect(filters.keywords?.include).toEqual(
      expect.arrayContaining(["school", "elementary", "secondary"])
    );
    expect(filters.headquarters_location?.include).toEqual([{ country: "CA", city: "Langley" }]);
  });

  it("falls back to category name as keyword for unknown categories", () => {
    const filters = categoryToDiscoverFilters("Other" as any, "Vancouver");
    expect(filters.keywords?.include).toEqual(["Other"]);
  });
});

describe("COMPANY_SIZE_HEADCOUNTS", () => {
  it("maps Micro (1-10) to the 1-10 headcount range", () => {
    expect(COMPANY_SIZE_HEADCOUNTS["Micro (1-10)"]).toEqual(["1-10"]);
  });

  it("maps Small (11-50) to the 11-50 headcount range", () => {
    expect(COMPANY_SIZE_HEADCOUNTS["Small (11-50)"]).toEqual(["11-50"]);
  });

  it("maps 1-50 (small+micro) to both small ranges", () => {
    expect(COMPANY_SIZE_HEADCOUNTS["1-50 (small+micro)"]).toEqual(["1-10", "11-50"]);
  });
});

describe("headcountsAreSmall", () => {
  it("is true when every range tops out at 50 or fewer", () => {
    expect(headcountsAreSmall(["1-10"])).toBe(true);
    expect(headcountsAreSmall(["11-50"])).toBe(true);
    expect(headcountsAreSmall(["1-10", "11-50"])).toBe(true);
  });

  it("is false when any range exceeds 50", () => {
    expect(headcountsAreSmall(["1-10", "11-50", "51-200"])).toBe(false);
    expect(headcountsAreSmall(["51-200"])).toBe(false);
    expect(headcountsAreSmall(["10001+"])).toBe(false);
  });

  it("is false for an empty range set", () => {
    expect(headcountsAreSmall([])).toBe(false);
  });
});
