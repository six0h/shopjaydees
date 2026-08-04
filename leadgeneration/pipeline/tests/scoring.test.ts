import { describe, it, expect } from "vitest";
import { scoreLead } from "../src/scoring.js";

describe("scoreLead", () => {
  it("gives base score 3 for a minimal lead", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      seniority: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(3);
  });

  it("scores 5 for ideal lead: high confidence, Owner title, 11-50 headcount, has domain", () => {
    const result = scoreLead({
      emailConfidence: 92,
      contactTitle: "Owner",
      seniority: null,
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(5);
    expect(result.rationale).toContain("confidence 92%");
    expect(result.rationale).toContain("Owner");
  });

  it("+1 for confidence >= 90", () => {
    const result = scoreLead({
      emailConfidence: 95,
      contactTitle: null,
      seniority: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(4);
  });

  it("+1 for decision-maker title (Owner, President, CEO, Principal, Director)", () => {
    for (const title of ["Owner", "President", "CEO", "Principal", "Director"]) {
      const result = scoreLead({
        emailConfidence: 70,
        contactTitle: title,
        seniority: null,
        headcount: null,
        hasDomain: true,
      });
      expect(result.score).toBeGreaterThanOrEqual(4);
    }
  });

  it("+1 for headcount >= 11", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      seniority: null,
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(4);
  });

  it("-1 for confidence < 50", () => {
    const result = scoreLead({
      emailConfidence: 45,
      contactTitle: null,
      seniority: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(2);
  });

  it("null title is neutral (no +1, no -1)", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      seniority: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(3);
  });

  it("-1 for headcount unknown or 1-10", () => {
    const r1 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      seniority: null,
      headcount: "1-10",
      hasDomain: true,
    });
    expect(r1.score).toBe(2);

    const r2 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      seniority: null,
      headcount: null,
      hasDomain: true,
    });
    expect(r2.score).toBe(2);
  });

  it("clamps to minimum 1", () => {
    const result = scoreLead({
      emailConfidence: 30,
      contactTitle: null,
      seniority: null,
      headcount: "1-10",
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it("clamps to maximum 5", () => {
    const result = scoreLead({
      emailConfidence: 99,
      contactTitle: "CEO",
      seniority: null,
      headcount: "51-200",
      hasDomain: true,
    });
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("includes rationale string", () => {
    const result = scoreLead({
      emailConfidence: 91,
      contactTitle: "Owner",
      seniority: null,
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.rationale).toMatch(/Auto-scored:/);
    expect(result.rationale).toContain("-> 5");
  });
});

describe("seniority-based scoring", () => {
  it("+1 for executive seniority with DM title", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "CEO",
      seniority: "executive",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(5);
  });

  it("seniority 'senior' still gets DM bonus if title matches", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "Director of Operations",
      seniority: "senior",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("no penalty for unknown headcount when seniority is executive", () => {
    const result = scoreLead({
      emailConfidence: 80,
      contactTitle: "Founder",
      seniority: "executive",
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("small-targeting scoring", () => {
  it("suppresses the -1 small-headcount penalty when smallTargeting is set", () => {
    // Non-owner contact at a 1-10 company would score 2 by default (base 3 - 1).
    const withoutFlag = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      seniority: null,
      headcount: "1-10",
      hasDomain: true,
    });
    expect(withoutFlag.score).toBe(2);

    const withFlag = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      seniority: null,
      headcount: "1-10",
      hasDomain: true,
      smallTargeting: true,
    });
    expect(withFlag.score).toBe(3);
  });

  it("suppresses the +1 large-headcount bonus when smallTargeting is set", () => {
    const withFlag = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      seniority: null,
      headcount: "11-50",
      hasDomain: true,
      smallTargeting: true,
    });
    expect(withFlag.score).toBe(3);
  });

  it("still rewards a decision-maker title under smallTargeting", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: "Owner",
      seniority: null,
      headcount: "1-10",
      hasDomain: true,
      smallTargeting: true,
    });
    expect(result.score).toBe(4);
  });
});
