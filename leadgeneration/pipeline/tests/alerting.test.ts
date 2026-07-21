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

  it("publishes to the ntfy topic in ntfy format", async () => {
    await alerter.send(
      "ClickUp auth failure — pipeline halted",
      "Discovery agent got 401 from ClickUp API."
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    // ntfy: the topic is the URL path, the message is the raw body.
    expect(url).toBe("https://hooks.example.com/alert");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Title).toBe(
      "[ShopJaydees Pipeline] ClickUp auth failure — pipeline halted"
    );
    expect(opts.headers.Priority).toBe("high");
    // Details go in the plain-text body, not a JSON envelope.
    expect(opts.body).toBe("Discovery agent got 401 from ClickUp API.");
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
