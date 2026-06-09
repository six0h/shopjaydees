import { describe, it, expect } from "vitest";
import { categoryToSearchQuery, cityToPhase } from "../src/mapping.js";

describe("categoryToSearchQuery", () => {
  it("maps Trades & Contractors to plumbing/electrical/HVAC terms", () => {
    const query = categoryToSearchQuery("Trades & Contractors");
    expect(query).toContain("plumbing");
  });

  it("maps Elementary & Secondary to education terms", () => {
    const query = categoryToSearchQuery("Elementary & Secondary");
    expect(query).toContain("school");
  });

  it("maps Youth Sports Leagues to sports terms", () => {
    const query = categoryToSearchQuery("Youth Sports Leagues");
    expect(query).toContain("sports");
  });

  it("maps every defined category without throwing", () => {
    const categories = [
      "Trades & Contractors",
      "Restaurants & Hospitality",
      "Fitness & Wellness",
      "Real Estate & Property Mgmt",
      "Auto & Trades Shops",
      "Elementary & Secondary",
      "Independent & Private Schools",
      "Daycares & Preschools",
      "Post-Secondary Clubs",
      "Youth Sports Leagues",
      "Adult Rec Leagues",
      "Dance & Performance",
      "Community Sport Orgs",
    ];
    for (const cat of categories) {
      expect(() => categoryToSearchQuery(cat as any)).not.toThrow();
      expect(categoryToSearchQuery(cat as any).length).toBeGreaterThan(0);
    }
  });

  it("returns the input for Other", () => {
    const query = categoryToSearchQuery("Other");
    expect(query).toBe("Other");
  });
});

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
