/** Shared closed topology: the notch becomes a roof peak and the tip a foundation. */
export type Point2 = readonly [number, number];

function roundedHouse(): Point2[] {
  const corners: Point2[] = [[0, 1.04], [.9, .29], [.9, -.86], [-.9, -.86], [-.9, .29]];
  const outline: Point2[] = [];
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i];
    const previous = corners[(i + corners.length - 1) % corners.length];
    const next = corners[(i + 1) % corners.length];
    const radius = i === 0 ? .07 : .10;
    const toward = (q: Point2): Point2 => {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [p[0] + (q[0] - p[0]) * radius / length, p[1] + (q[1] - p[1]) * radius / length];
    };
    const start = toward(previous), end = toward(next);
    for (let step = 0; step <= 12; step++) {
      const t = step / 12, u = 1 - t;
      outline.push([u * u * start[0] + 2 * u * t * p[0] + t * t * end[0], u * u * start[1] + 2 * u * t * p[1] + t * t * end[1]]);
    }
  }
  return outline;
}

function heartOutline(): Point2[] {
  return Array.from({ length: 512 }, (_, i) => {
    const t = i / 512 * Math.PI * 2;
    return [Math.sin(t) ** 3, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) / 16] as const;
  });
}

function radialSample(outline: Point2[], angle: number): Point2 {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const sx = b[0] - a[0], sy = b[1] - a[1];
    const cross = dx * sy - dy * sx;
    if (Math.abs(cross) < 1e-10) continue;
    const distance = (a[0] * sy - a[1] * sx) / cross;
    const edge = (a[0] * dy - a[1] * dx) / cross;
    if (distance > 0 && edge >= -1e-8 && edge <= 1 + 1e-8) nearest = Math.min(nearest, distance);
  }
  if (!Number.isFinite(nearest)) throw new Error("The sculpture outline must surround its origin.");
  return [dx * nearest, dy * nearest];
}

export function createHeartHomeGeometry(segments = 160, rings = 40) {
  if (segments < 16 || rings < 8 || !Number.isInteger(segments) || !Number.isInteger(rings)) throw new Error("Invalid sculpture resolution.");
  const heart = heartOutline(), house = roundedHouse();
  const heartRim: Point2[] = [], houseRim: Point2[] = [];
  for (let j = 0; j < segments; j++) {
    const angle = Math.PI / 2 - j / segments * Math.PI * 2;
    heartRim.push(radialSample(heart, angle));
    houseRim.push(radialSample(house, angle));
  }
  const heartPositions: number[] = [0, 0, .48];
  const housePositions: number[] = [0, 0, .36];
  for (let ring = 1; ring < rings; ring++) {
    const v = ring / rings * Math.PI;
    const radial = Math.sin(v), depth = Math.cos(v);
    // A domed heart turns into a flat-faced, softly bevelled architectural solid.
    const houseRadial = radial ** .28;
    const houseDepth = Math.sign(depth) * Math.abs(depth) ** .28;
    for (let j = 0; j < segments; j++) {
      heartPositions.push(heartRim[j][0] * radial, heartRim[j][1] * radial, .48 * depth);
      housePositions.push(houseRim[j][0] * houseRadial, houseRim[j][1] * houseRadial, .36 * houseDepth);
    }
  }
  const back = heartPositions.length / 3;
  heartPositions.push(0, 0, -.48);
  housePositions.push(0, 0, -.36);
  const indices: number[] = [];
  for (let j = 0; j < segments; j++) indices.push(0, 1 + (j + 1) % segments, 1 + j);
  for (let ring = 0; ring < rings - 2; ring++) {
    for (let j = 0; j < segments; j++) {
      const a = 1 + ring * segments + j;
      const b = 1 + ring * segments + (j + 1) % segments;
      const c = a + segments, d = b + segments;
      indices.push(a, b, c, b, d, c);
    }
  }
  const lastRing = 1 + (rings - 2) * segments;
  for (let j = 0; j < segments; j++) indices.push(back, lastRing + j, lastRing + (j + 1) % segments);
  return { heart: new Float32Array(heartPositions), house: new Float32Array(housePositions), indices };
}

export const LOVE_PHRASE = "אהבה שהופכת לבית";
export const LOVE_DURATION = 4_800;
export const LOVE_LOOP_DURATION = 8_000;

/** Hold the finished home, then gently rewind to the heart without a jump cut. */
export function heartHomeLoopTime(milliseconds: number) {
  const cycle = Math.max(0, milliseconds) % LOVE_LOOP_DURATION;
  if (cycle <= LOVE_DURATION) return cycle;
  if (cycle < 5_800) return LOVE_DURATION;
  return LOVE_DURATION * (1 - smoothProgress(cycle, 5_800, 7_200));
}

export function smoothProgress(time: number, start: number, end: number) {
  const t = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function heartHomeFrame(milliseconds: number) {
  const time = Math.min(LOVE_DURATION, Math.max(0, milliseconds));
  return {
    time,
    morph: smoothProgress(time, 900, 2_700),
    details: smoothProgress(time, 2_450, 2_900),
    characters: Math.min(Array.from(LOVE_PHRASE).length, Math.max(0, Math.floor((time - 2_900) / 75))),
    complete: time >= LOVE_DURATION,
  };
}
