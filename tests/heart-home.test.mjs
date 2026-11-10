import assert from "node:assert/strict";
import test from "node:test";
import { createHeartHomeGeometry, heartHomeFrame, heartHomeLoopTime, LOVE_DURATION, LOVE_LOOP_DURATION, LOVE_PHRASE } from "../lib/heart-home-geometry.ts";

test("the automatic loop holds the house and returns continuously to the heart", () => {
  assert.equal(heartHomeLoopTime(0), 0);
  assert.equal(heartHomeLoopTime(LOVE_DURATION), LOVE_DURATION);
  assert.equal(heartHomeLoopTime(5_799), LOVE_DURATION);
  assert.ok(heartHomeLoopTime(6_500) > 0 && heartHomeLoopTime(6_500) < LOVE_DURATION);
  assert.equal(heartHomeLoopTime(7_200), 0);
  assert.equal(heartHomeLoopTime(LOVE_LOOP_DURATION - 1), 0);
  assert.equal(heartHomeLoopTime(LOVE_LOOP_DURATION), 0);
  for (const time of [0, 900, 2_700, 4_800, 6_500, 7_600]) {
    assert.equal(heartHomeLoopTime(time + LOVE_LOOP_DURATION * 10), heartHomeLoopTime(time));
  }
});

test("heart and house share a finite, closed, outward-facing topology", () => {
  const { heart, house, indices } = createHeartHomeGeometry();
  assert.equal(heart.length, house.length);
  assert.ok(heart.every(Number.isFinite) && house.every(Number.isFinite));
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[i + e], b = indices[i + (e + 1) % 3];
      assert.ok(a >= 0 && a < heart.length / 3);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const entry = edges.get(key) ?? { count: 0, winding: 0 };
      entry.count++;
      entry.winding += a < b ? 1 : -1;
      edges.set(key, entry);
    }
  }
  assert.ok([...edges.values()].every(({ count, winding }) => count === 2 && winding === 0));
  for (const mix of [0, .25, .5, .75, 1]) {
    const points = heart.map((coordinate, i) => coordinate * (1 - mix) + house[i] * mix);
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
      const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      assert.ok(Math.hypot(nx, ny, nz) > 1e-9, "No collapsed triangles during the morph");
      volume += (points[a] * nx + points[a + 1] * ny + points[a + 2] * nz) / 6;
    }
    assert.ok(volume > 0, "The sculpture is consistently outward-facing");
  }
});

test("the heart becomes a house before RTL typing, and motion has a finite end", () => {
  assert.equal(heartHomeFrame(0).morph, 0);
  assert.equal(heartHomeFrame(900).morph, 0);
  assert.equal(heartHomeFrame(2_700).morph, 1);
  assert.equal(heartHomeFrame(2_700).characters, 0);
  let previousMorph = 0, previousCharacters = 0;
  for (let time = 0; time <= LOVE_DURATION; time += 40) {
    const frame = heartHomeFrame(time);
    assert.ok(frame.morph >= previousMorph && frame.morph <= 1);
    assert.ok(frame.characters >= previousCharacters && frame.characters <= LOVE_PHRASE.length);
    previousMorph = frame.morph; previousCharacters = frame.characters;
  }
  assert.equal(heartHomeFrame(LOVE_DURATION).characters, LOVE_PHRASE.length);
  assert.equal(heartHomeFrame(LOVE_DURATION).complete, true);
  assert.deepEqual(heartHomeFrame(LOVE_DURATION + 50_000), heartHomeFrame(LOVE_DURATION));
  assert.equal(Array.from(LOVE_PHRASE).slice(0, 4).join(""), "אהבה");
});
