import { describe, it, expect } from "vitest";
import { monthWindow } from "../src/report.js";

describe("monthWindow", () => {
  it("returns inclusive date strings and a half-open ms range for a 31-day month", () => {
    const w = monthWindow("2026-07");
    expect(w.startDate).toBe("2026-07-01");
    expect(w.endDate).toBe("2026-07-31");
    expect(w.startMs).toBe(Date.UTC(2026, 6, 1));
    expect(w.endMs).toBe(Date.UTC(2026, 7, 1));
  });

  it("handles February and December rollover", () => {
    expect(monthWindow("2026-02").endDate).toBe("2026-02-28");
    const dec = monthWindow("2026-12");
    expect(dec.endDate).toBe("2026-12-31");
    expect(dec.endMs).toBe(Date.UTC(2027, 0, 1));
  });
});
