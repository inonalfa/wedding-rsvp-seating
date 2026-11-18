import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = JSON.parse(readFileSync(new URL("../hosted/wrangler.jsonc", import.meta.url), "utf8"));
const existing = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const dry = process.argv.includes("--dry-run");
const secretNames = ["GOOGLE_CLIENT_SECRET", "HOSTED_AUTH_SECRET", "HOSTED_INVITE_SECRET", "TURNSTILE_SECRET", "CF_ANALYTICS_TOKEN"];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}
function wrangler(...args) {
  const bin = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const result = spawnSync(join(root, "node_modules", ".bin", bin), args, {
    cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", ...(process.env.CF_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: process.env.CF_ACCOUNT_ID } : {}) },
  });
  if (result.error || result.status !== 0) throw new Error("Wrangler command failed: " + args.slice(0, 2).join(" "));
}
async function api(path, token) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Cloudflare preflight failed (HTTP " + response.status + ")");
  const data = await response.json();
  if (!data.success || !data.result) throw new Error("Cloudflare preflight returned no result");
  return data.result;
}

async function run() {
  if (dry) {
    const output = mkdtempSync(join(tmpdir(), "wedding-hosted-build-"));
    try { wrangler("deploy", "--config", "hosted/wrangler.jsonc", "--dry-run", "--outdir", output); }
    finally { rmSync(output, { recursive: true, force: true }); }
    return;
  }
  if (required("HOSTED_FREE_CONFIRMED") !== "1") throw new Error("Confirm Workers Free in Cloudflare Dashboard and set HOSTED_FREE_CONFIRMED=1");
  const account = required("CF_ACCOUNT_ID");
  const database = required("HOSTED_DB_ID");
  const origin = required("HOSTED_ORIGIN");
  const token = required("CLOUDFLARE_API_TOKEN");
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(database) || !/[1-9a-f]/i.test(database)) {
    throw new Error("Invalid hosted account or database ID");
  }
  if (!/^https:\/\/wedding-rsvp-seating-hosted\.[a-z0-9-]+\.workers\.dev$/.test(origin)) throw new Error("Use the exact hosted workers.dev origin");
  if (base.name === existing.name || existing.d1_databases.some(binding => binding.database_id === database)) {
    throw new Error("Hosted configuration must not target the existing deployment");
  }

  const secrets = Object.fromEntries(secretNames.map(name => [name, required(name)]));
  for (const name of ["HOSTED_AUTH_SECRET", "HOSTED_INVITE_SECRET"]) {
    if (!/^[\w-]{43}$/.test(secrets[name]) || Buffer.from(secrets[name], "base64url").length !== 32) {
      throw new Error(name + " must be 32 random bytes encoded as Base64URL");
    }
  }
  if (secrets.HOSTED_AUTH_SECRET === secrets.HOSTED_INVITE_SECRET) throw new Error("Use separate signing keys");
  const vars = Object.fromEntries(["HOSTED_ORIGIN", "GOOGLE_CLIENT_ID", "TURNSTILE_SITE_KEY", "HOSTED_OPERATOR_SUB", "CF_ACCOUNT_ID"]
    .map(name => [name, required(name)]));
  const [subscriptions, remoteDb] = await Promise.all([
    api("/accounts/" + account + "/subscriptions", token),
    api("/accounts/" + account + "/d1/database/" + database, token),
  ]);
  if (!Array.isArray(subscriptions) || subscriptions.some(plan => !["Cancelled", "Expired", "Failed"].includes(plan.state) &&
    (plan.price !== 0 || /paid|pro|business|enterprise|unbound/i.test(plan.rate_plan?.id ?? "")))) {
    throw new Error("Account has an active or ambiguous paid subscription; use a dedicated Workers Free account");
  }
  const binding = base.d1_databases[0];
  if (remoteDb.name !== binding.database_name || remoteDb.uuid !== database) throw new Error("D1 is not the dedicated hosted database");

  const work = mkdtempSync(join(root, "hosted", ".deploy-"));
  try {
    const config = join(work, "wrangler.jsonc");
    const secretFile = join(work, "secrets.json");
    writeFileSync(config, JSON.stringify({ ...base, account_id: account, main: "../worker.ts", vars,
      d1_databases: [{ ...binding, database_id: database, migrations_dir: "../migrations" }] }), { mode: 0o600 });
    writeFileSync(secretFile, JSON.stringify(secrets), { mode: 0o600 });
    wrangler("d1", "migrations", "apply", binding.database_name, "--remote", "--config", relative(root, config));
    wrangler("deploy", "--config", relative(root, config), "--secrets-file", secretFile);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : "Hosted deploy failed");
  process.exitCode = 1;
});
