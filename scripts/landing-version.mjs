// Computes LANDING_VERSION: first 12 hex of sha256 over hosted/public/assets/landing/* (sorted, og.png excluded).
// Usage: node scripts/landing-version.mjs [--check]
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = new URL("../hosted/public/assets/landing/", import.meta.url);
const target = new URL("../hosted/landing/version.ts", import.meta.url);

export function landingVersion() {
  const hash = createHash("sha256");
  for (const name of readdirSync(dir).filter(n => n !== "og.png").sort()) {
    hash.update(name + "\0");
    hash.update(readFileSync(new URL(name, dir)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = landingVersion();
  const content = `export const LANDING_VERSION = "${version}";\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== content) {
      console.error("LANDING_VERSION is stale, run node scripts/landing-version.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(target, content);
  }
  console.log(version);
}
