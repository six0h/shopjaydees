export interface Alerter {
  send(subject: string, details: string): Promise<void>;
}

export interface AlerterOptions {
  /**
   * ntfy topic URL, e.g. https://ntfy.pixelstatic.net/jaydees-agent-alerts.
   * Empty string disables alerting (the send() call becomes a no-op).
   */
  alertWebhookUrl: string;
  /** Retained for config compatibility; ntfy delivery does not use an email address. */
  alertEmail?: string;
  fetchFn?: typeof fetch;
}

export function createAlerter(options: AlerterOptions): Alerter {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async send(subject: string, details: string): Promise<void> {
      if (!options.alertWebhookUrl) {
        return;
      }
      try {
        // ntfy protocol: the topic is the URL path, the notification message is
        // the raw request body, and the title/priority/tags ride in headers.
        await fetchFn(options.alertWebhookUrl, {
          method: "POST",
          headers: {
            Title: `[ShopJaydees Pipeline] ${subject}`,
            Priority: "high",
            Tags: "rotating_light",
          },
          body: details,
        });
      } catch {
        // Alert delivery failure must never crash the pipeline
      }
    },
  };
}
