import { describe, it, expect } from "vitest";
import { scoreLead } from "../src/scoring.js";

describe("scoreLead", () => {
  it("gives base score 3 for a minimal lead", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(3);
  });

  it("scores 5 for ideal lead: high confidence, Owner title, 11-50 headcount, has domain", () => {
    const result = scoreLead({
      emailConfidence: 92,
      contactTitle: "Owner",
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
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.score).toBe(4);
  });

  it("-1 for confidence < 50", () => {
    const result = scoreLead({
      emailConfidence: 45,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(2);
  });

  it("null title is neutral (no +1, no -1)", () => {
    const result = scoreLead({
      emailConfidence: 70,
      contactTitle: null,
      headcount: null,
      hasDomain: true,
    });
    expect(result.score).toBe(3);
  });

  it("-1 for headcount unknown or 1-10", () => {
    const r1 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      headcount: "1-10",
      hasDomain: true,
    });
    expect(r1.score).toBe(2);

    const r2 = scoreLead({
      emailConfidence: 70,
      contactTitle: "Manager",
      headcount: null,
      hasDomain: true,
    });
    expect(r2.score).toBe(2);
  });

  it("clamps to minimum 1", () => {
    const result = scoreLead({
      emailConfidence: 30,
      contactTitle: null,
      headcount: "1-10",
      hasDomain: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it("clamps to maximum 5", () => {
    const result = scoreLead({
      emailConfidence: 99,
      contactTitle: "CEO",
      headcount: "51-200",
      hasDomain: true,
    });
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it("includes rationale string", () => {
    const result = scoreLead({
      emailConfidence: 91,
      contactTitle: "Owner",
      headcount: "11-50",
      hasDomain: true,
    });
    expect(result.rationale).toMatch(/Auto-scored:/);
    expect(result.rationale).toContain("-> 5");
  });
});
