import {
  CLOUDFLARE_ANALYTICS_ENDPOINT,
  HOSTED_USAGE_QUERY,
  HOSTED_USAGE_SCHEMA_QUERY,
  parseUsagePayload,
  usageVariables,
  validateUsageSchema,
} from "../hosted/usage.ts";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

async function query(token, body) {
  const response = await fetch(CLOUDFLARE_ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Cloudflare Analytics returned HTTP " + response.status);
  return response.json();
}

async function run() {
  const account = required("CF_ACCOUNT_ID");
  const token = required("CF_ANALYTICS_TOKEN");
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error("CF_ACCOUNT_ID must be a 32-character account ID");

  const schema = await query(token, { query: HOSTED_USAGE_SCHEMA_QUERY });
  if (!validateUsageSchema(schema)) throw new Error("The token cannot verify the current D1 Analytics filter schema");

  const usage = await query(token, { query: HOSTED_USAGE_QUERY, variables: usageVariables(account, Date.now()) });
  const counts = parseUsagePayload(usage);
  if (!counts) throw new Error("The account did not return one complete Workers and D1 aggregate; admission must remain closed");
  console.log("Cloudflare Analytics preflight passed with complete Workers and D1 aggregates.");
  console.log("Requests: " + counts[0] + "; D1 rows read: " + counts[1] + "; D1 rows written: " + counts[2] + ".");
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : "Cloudflare Analytics preflight failed");
  process.exitCode = 1;
});
