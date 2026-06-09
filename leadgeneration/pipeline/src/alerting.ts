export interface Alerter {
  send(subject: string, details: string): Promise<void>;
}

export interface AlerterOptions {
  alertEmail: string;
  alertWebhookUrl: string;
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
        await fetchFn(options.alertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: `[ShopJaydees Pipeline] ${subject}`,
            details,
            to: options.alertEmail,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch {
        // Alert delivery failure must never crash the pipeline
      }
    },
  };
}
