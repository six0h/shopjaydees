import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAlerter, type Alerter } from "../src/alerting.js";

describe("createAlerter", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let alerter: Alerter;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    alerter = createAlerter({
      alertEmail: "cody@sixohquad.com",
      alertWebhookUrl: "https://hooks.example.com/alert",
      fetchFn: mockFetch,
    });
  });

  it("sends alert via webhook POST", async () => {
    await alerter.send(
      "ClickUp auth failure — pipeline halted",
      "Discovery agent got 401 from ClickUp API."
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/alert");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.subject).toContain("ClickUp auth failure");
    expect(body.details).toContain("401");
    expect(body.to).toBe("cody@sixohquad.com");
  });

  it("does not throw when webhook URL is empty", async () => {
    const quietAlerter = createAlerter({
      alertEmail: "cody@sixohquad.com",
      alertWebhookUrl: "",
      fetchFn: mockFetch,
    });
    await expect(
      quietAlerter.send("test", "details")
    ).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not throw when webhook fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    await expect(
      alerter.send("test", "details")
    ).resolves.toBeUndefined();
  });
});
