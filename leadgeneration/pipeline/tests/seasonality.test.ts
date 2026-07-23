import { describe, it, expect } from "vitest";
import {
  resolveSeasonalContext,
  findForbiddenSeasonMentions,
  crossRunAttemptCount,
} from "../src/seasonality.js";

describe("resolveSeasonalContext", () => {
  it("July sells fall", () => {
    const s = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z"));
    expect(s.sellingSeason).toBe("fall");
    expect(s.period).toBe("June to August");
    expect(s.forbiddenSeasons).toEqual(["spring", "summer", "winter"]);
  });

  it("June and August both sell fall (quarter boundaries)", () => {
    expect(resolveSeasonalContext(new Date("2026-06-01T12:00:00Z")).sellingSeason).toBe("fall");
    expect(resolveSeasonalContext(new Date("2026-08-31T12:00:00Z")).sellingSeason).toBe("fall");
  });

  it("September pivots to winter (the corrected boundary)", () => {
    const s = resolveSeasonalContext(new Date("2026-09-01T12:00:00Z"));
    expect(s.sellingSeason).toBe("winter");
    expect(s.forbiddenSeasons).toContain("fall");
    expect(s.forbiddenSeasons).toContain("autumn");
  });

  it("December through February sells spring", () => {
    expect(resolveSeasonalContext(new Date("2026-12-15T12:00:00Z")).sellingSeason).toBe("spring");
    expect(resolveSeasonalContext(new Date("2026-01-15T12:00:00Z")).sellingSeason).toBe("spring");
    expect(resolveSeasonalContext(new Date("2026-02-28T12:00:00Z")).sellingSeason).toBe("spring");
  });

  it("March through May sells summer", () => {
    expect(resolveSeasonalContext(new Date("2026-03-15T12:00:00Z")).sellingSeason).toBe("summer");
    expect(resolveSeasonalContext(new Date("2026-05-31T12:00:00Z")).sellingSeason).toBe("summer");
  });
});

describe("findForbiddenSeasonMentions", () => {
  const july = resolveSeasonalContext(new Date("2026-07-22T12:00:00Z")); // fall; forbids spring/summer/winter

  it("flags a forbidden season word", () => {
    const errors = findForbiddenSeasonMentions(["Ready for the spring season?"], july);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("spring");
  });

  it("allows the selling-season word itself", () => {
    expect(findForbiddenSeasonMentions(["Get your fall order in early."], july)).toEqual([]);
  });

  it("is case-insensitive and word-bounded", () => {
    expect(findForbiddenSeasonMentions(["SUMMER is here"], july).length).toBe(1);
    // 'summertime' substring should still trip a word-boundary match on 'summer'? No — \b requires boundary.
    expect(findForbiddenSeasonMentions(["summertime fun"], july)).toEqual([]);
  });

  it("flags autumn when fall is forbidden", () => {
    const sept = resolveSeasonalContext(new Date("2026-09-15T12:00:00Z")); // winter; forbids fall/autumn
    expect(findForbiddenSeasonMentions(["ready for autumn?"], sept).length).toBe(1);
  });

  it("dedupes: one error per forbidden word even across multiple fields", () => {
    const errors = findForbiddenSeasonMentions(["spring cleaning", "spring sale"], july);
    expect(errors.length).toBe(1);
  });
});

describe("crossRunAttemptCount", () => {
  it("returns 1 when no attempt tags present", () => {
    expect(crossRunAttemptCount([{ name: "no-scrape" }])).toBe(1);
  });

  it("reads the highest personalize-attempt-N tag", () => {
    expect(crossRunAttemptCount([{ name: "personalize-attempt-2" }])).toBe(2);
    expect(crossRunAttemptCount([{ name: "personalize-attempt-2" }, { name: "personalize-attempt-3" }])).toBe(3);
  });
});
