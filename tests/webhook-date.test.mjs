import assert from "node:assert/strict";
import test from "node:test";
import { formatWebhookDateTime } from "../lib/webhook-date.ts";

test("formats a summer timestamp in Israel time on two lines", () => {
  assert.equal(
    formatWebhookDateTime("2026-08-17T11:50:00.000Z"),
    "17/08/2026\n14:50",
  );
});

test("formats a winter timestamp in Israel time on two lines", () => {
  assert.equal(
    formatWebhookDateTime("2026-12-17T12:50:00.000Z"),
    "17/12/2026\n14:50",
  );
});
