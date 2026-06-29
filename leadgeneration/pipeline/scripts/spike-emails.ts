/**
 * One-off: dump a page of GET /emails for a campaign so we can confirm the raw
 * field names normalizeEmail relies on. Run only after real campaign traffic exists.
 *   INSTANTLY_API_KEY=... CAMPAIGN_ID=... npx tsx scripts/spike-emails.ts
 */
const apiKey = process.env.INSTANTLY_API_KEY;
const campaignId = process.env.CAMPAIGN_ID;
if (!apiKey || !campaignId) {
  console.error("Set INSTANTLY_API_KEY and CAMPAIGN_ID");
  process.exit(1);
}
const url = `https://api.instantly.ai/api/v2/emails?campaign_id=${campaignId}&limit=20`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
console.log("status", res.status);
console.log(JSON.stringify(await res.json(), null, 2));
