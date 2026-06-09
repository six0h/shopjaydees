import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs structured JSON with severity and component", () => {
    const log = createLogger("discovery-agent");
    log.info("Processing started", { requestCount: 3 });

    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.severity).toBe("INFO");
    expect(output.component).toBe("discovery-agent");
    expect(output.message).toBe("Processing started");
    expect(output.requestCount).toBe(3);
    expect(output.timestamp).toBeDefined();
  });

  it("logs at different severity levels", () => {
    const log = createLogger("test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    log.critical("c");

    expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    const severities = consoleLogSpy.mock.calls.map(
      (call) => JSON.parse(call[0] as string).severity
    );
    expect(severities).toEqual([
      "DEBUG",
      "INFO",
      "WARNING",
      "ERROR",
      "CRITICAL",
    ]);
  });

  it("includes run_id when set", () => {
    const log = createLogger("test");
    log.setRunId("discover-2026-06-08-040000");
    log.info("test");

    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(output.run_id).toBe("discover-2026-06-08-040000");
  });
});
