export interface MonthWindow {
  startDate: string;
  endDate: string;
  startMs: number;
  endMs: number;
}

/** Parse "YYYY-MM" into an inclusive date-string range and a half-open [startMs, endMs) UTC range. */
export function monthWindow(month: string): MonthWindow {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const startMs = Date.UTC(y, m - 1, 1);
  const endMs = Date.UTC(y, m, 1); // first instant of next month (exclusive)
  const lastDay = new Date(endMs - 1).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${y}-${pad(m)}-01`,
    endDate: `${y}-${pad(m)}-${pad(lastDay)}`,
    startMs,
    endMs,
  };
}
