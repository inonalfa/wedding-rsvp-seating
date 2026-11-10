import test from "node:test";
import assert from "node:assert/strict";
import { validateRsvp, rsvpPayload } from "../lib/rsvp-form.ts";

const fields = { fullName: "דנה לוי", attendance: "yes", guestCount: "2", message: "" };

test("general RSVP accepts positive guest counts up to the global limit", () => {
  for (const count of ["1", "2", "50", "1000"]) {
    assert.deepEqual(validateRsvp({ ...fields, guestCount: count }), {});
    assert.equal(rsvpPayload({ ...fields, guestCount: count }, "old-signed-invite", "").guestCount, Number(count));
  }
});

test("rejects blank, negative, fractional and unsafe guest counts instead of silently replacing them", () => {
  for (const guestCount of ["", "0", "-1", "2.5", "not a number", "Infinity", "9007199254740992"]) {
    assert.ok(validateRsvp({ ...fields, guestCount }).guestCount, guestCount);
  }
});

test("a decline is valid without a guest count and sends zero participants", () => {
  const decline = { ...fields, attendance: "no", guestCount: "" };
  assert.deepEqual(validateRsvp(decline), {});
  assert.equal(rsvpPayload(decline, "personal-invite", "").guestCount, 0);
});

test("names cannot be whitespace or a single character", () => {
  for (const fullName of ["", "  ", " א "]) assert.ok(validateRsvp({ ...fields, fullName }).fullName);
});

test("preserves the signed invite and message when an answer is sent or updated", () => {
  assert.deepEqual(rsvpPayload({ ...fields, fullName: "  דנה ויואב  ", message: "  רגישות לאגוזים  " }, "signed-personal-token", ""), {
    fullName: "דנה ויואב", attendance: "yes", guestCount: 2, message: "רגישות לאגוזים", website: "", inviteToken: "signed-personal-token",
  });
});

test("personal RSVP respects the signed invite limit", () => {
  assert.deepEqual(validateRsvp(fields, 2), {});
  assert.ok(validateRsvp({ ...fields, guestCount: "3" }, 2).guestCount);
  assert.deepEqual(validateRsvp({ ...fields, guestCount: "50" }, 0), {});
});
