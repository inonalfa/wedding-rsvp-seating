import assert from "node:assert/strict";
import test from "node:test";
import { authRoute, verifyGoogleIdToken } from "../hosted/auth.ts";

const env = {
  TURNSTILE_SITE_KEY: "fixture-site",
  TURNSTILE_SECRET: "fixture-only",
  HOSTED_ORIGIN: "https://weddings.example.test",
  GOOGLE_CLIENT_ID: "fictional-client",
  GOOGLE_CLIENT_SECRET: "fictional-secret",
  HOSTED_AUTH_SECRET: Buffer.alloc(32, 1).toString("base64url"),
};

test("hosted OAuth requests use PKCE and reject callbacks before exchange when state is wrong or expired", async () => {
  const origin = env.HOSTED_ORIGIN;
  const login = () => new Request(origin + "/auth/login", { method: "POST",
    headers: { origin }, body: new URLSearchParams({ "cf-turnstile-response": "fictional" }) });
  const invalid = await authRoute(login(), env, 1000, async () => Response.json({ success: true, hostname: "wrong.example.test", action: "login" }));
  assert.equal(invalid.status, 403);
  const start = await authRoute(login(), env, 1000, async () => Response.json({ success: true, hostname: "weddings.example.test", action: "login" }));
  const url = new URL(start.headers.get("location"));
  const cookie = start.headers.get("set-cookie");
  assert.match(cookie, /^__Host-hosted_login=.+; Secure; HttpOnly; SameSite=Lax$/);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), origin + "/auth/callback");
  let exchanges = 0;
  const fetcher = async () => { exchanges++; throw new Error("unexpected exchange"); };
  for (const [state, now] of [["wrong", 1000], [url.searchParams.get("state"), 301_000]]) {
    const cb = await authRoute(new Request(origin + "/auth/callback?code=test&state=" + state, {
      headers: { cookie: cookie.split(";")[0] },
    }), env, now, fetcher);
    assert.equal(cb.headers.get("location"), "/?signin=failed");
  }
  assert.equal(exchanges, 0);
  const logout = await authRoute(new Request(origin + "/auth/logout", {
    method: "POST", headers: { origin: "https://untrusted.example.test" },
  }), env);
  assert.equal(logout.status, 404);
});

test("Google identity requires a verified signature and matching audience, expiry and nonce", async () => {
  const algo = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" };
  const key = await crypto.subtle.generateKey(algo, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
  const fetcher = async () => Response.json({ keys: [{ ...jwk, kid: "test", use: "sig" }] });
  const b64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = b64({ alg: "RS256", kid: "test" });
  const claims = { sub: "fictional", iss: "https://accounts.google.com", aud: "client", nonce: "nonce", exp: 2 };
  const token = async overrides => {
    const body = header + "." + b64({ ...claims, ...overrides });
    const mac = await crypto.subtle.sign(algo, key.privateKey, Buffer.from(body));
    return body + "." + Buffer.from(mac).toString("base64url");
  };
  const valid = await token({});
  assert.equal(await verifyGoogleIdToken(valid, "client", "nonce", 1000, fetcher), "fictional");
  for (const bad of [{ aud: "other" }, { exp: 1 }, { nonce: "other" }, { iss: "https://untrusted.example.test" }]) {
    await assert.rejects(verifyGoogleIdToken(await token(bad), "client", "nonce", 1000, fetcher), /Invalid Google claims/);
  }
  await assert.rejects(verifyGoogleIdToken(valid.replace(/\.[^.]+$/, ".YWJj"), "client", "nonce", 1000, fetcher), /Invalid Google signature/);
});
