import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHostedWorker } from "../../hosted/worker.ts";

const origin = "http://127.0.0.1:4174";
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync(new URL("../../hosted/migrations/", import.meta.url)).filter(x => x.endsWith(".sql")).sort()) {
  db.exec(readFileSync(new URL("../../hosted/migrations/" + name, import.meta.url), "utf8"));
}
const HOSTED_DB = {
  prepare(query) {
    return { bind(...values) {
      return {
        async first() { return db.prepare(query).get(...values) ?? null; },
        async all() { return { results: db.prepare(query).all(...values) }; },
        async run() { return { meta: db.prepare(query).run(...values) }; },
      };
    } };
  },
  async batch(statements) {
    db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      db.exec("COMMIT");
      return results;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
const rate = { limit: async () => ({ success: true }) };
const env = {
  HOSTED_DB, HOSTED_ORIGIN: origin, GOOGLE_CLIENT_ID: "fictional-client", GOOGLE_CLIENT_SECRET: "fictional",
  HOSTED_AUTH_SECRET: Buffer.alloc(32, 1).toString("base64url"), HOSTED_INVITE_SECRET: Buffer.alloc(32, 2).toString("base64url"),
  TURNSTILE_SITE_KEY: "fictional-site", TURNSTILE_SECRET: "fictional-secret",
  LOGIN_LIMIT: rate, OWNER_LIMIT: rate, RECOVERY_LIMIT: rate, CLIENT_LIMIT: rate, GUEST_LIMIT: rate,
};
const algorithm = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" };
const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const challenges = new Set();
const usedCodes = new Set();
const worker = createHostedWorker(async (url, init) => {
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const value = init.body.get("response");
    const action = value.split(":")[0];
    const success = !challenges.has(value) && /^(login|rsvp):[a-f0-9-]{36}$/.test(value);
    challenges.add(value);
    return Response.json({ success, hostname: "127.0.0.1", action });
  }
  if (url === "https://www.googleapis.com/oauth2/v3/certs") {
    return Response.json({ keys: [{ ...jwk, kid: "fixture", use: "sig" }] });
  }
  if (url === "https://oauth2.googleapis.com/token") {
    const code = init.body.get("code");
    const [subject, nonce] = code.split(":");
    if (!nonce || !["owner-a", "owner-b"].includes(subject) || usedCodes.has(code)) return new Response(null, { status: 400 });
    usedCodes.add(code);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = b64({ alg: "RS256", kid: "fixture" }) + "." + b64({
      iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, sub: subject, exp: now + 60, nonce,
    });
    const signature = await crypto.subtle.sign(algorithm, keys.privateKey, Buffer.from(unsigned));
    return Response.json({ id_token: unsigned + "." + Buffer.from(signature).toString("base64url") });
  }
  throw new Error("Unexpected outbound URL");
});

createServer(async (request, response) => {
  try {
    db.prepare("INSERT OR REPLACE INTO usage_snapshot VALUES (1, ?, 0, 0, 0, 1000, NULL, 1)").run(Date.now());
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const result = await worker.fetch(new Request(origin + request.url, {
      method: request.method, headers: request.headers, body: body.length ? body : undefined,
    }), env);
    for (const [name, value] of result.headers) if (name !== "set-cookie") response.setHeader(name, value);
    if (result.headers.has("set-cookie")) response.setHeader("Set-Cookie", result.headers.getSetCookie());
    response.writeHead(result.status);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    response.writeHead(500).end();
  }
}).listen(4174, "127.0.0.1");
