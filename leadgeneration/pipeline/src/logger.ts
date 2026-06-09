type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  critical(message: string, data?: Record<string, unknown>): void;
  setRunId(runId: string): void;
}

export function createLogger(component: string): Logger {
  let runId: string | undefined;

  function log(
    severity: Severity,
    message: string,
    data?: Record<string, unknown>
  ) {
    const entry: Record<string, unknown> = {
      severity,
      component,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };
    if (runId) {
      entry.run_id = runId;
    }
    console.log(JSON.stringify(entry));
  }

  return {
    debug: (msg, data) => log("DEBUG", msg, data),
    info: (msg, data) => log("INFO", msg, data),
    warn: (msg, data) => log("WARNING", msg, data),
    error: (msg, data) => log("ERROR", msg, data),
    critical: (msg, data) => log("CRITICAL", msg, data),
    setRunId: (id) => {
      runId = id;
    },
  };
}
