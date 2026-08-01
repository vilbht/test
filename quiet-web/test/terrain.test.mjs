// The mountain. Its gradient is what the whole ride is computed from, so most
// of these assert properties of the derivative rather than of the height.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTerrain, surfaceY, slopeAt, angleAt, curvatureAt, groundY, inChasm,
  meanSlope, lowestBetween, RUN_UP, DRIFT,
} from '../core/terrain.mjs';
import { buildMountain } from '../core/level.mjs';

// The real pipeline, so these test the mountain the game actually builds.
const build = (seed = 7) => buildMountain(seed, 12000);

test('the same seed builds the same mountain', () => {
  const a = createTerrain({ seed: 42 });
  const b = createTerrain({ seed: 42 });
  for (let x = 0; x < 6000; x += 137) {
    assert.equal(surfaceY(a, x), surfaceY(b, x));
  }
});

test('different seeds build different mountains', () => {
  const a = createTerrain({ seed: 1 });
  const b = createTerrain({ seed: 2 });
  let differs = false;
  for (let x = 0; x < 6000; x += 137) {
    if (Math.abs(surfaceY(a, x) - surfaceY(b, x)) > 1) differs = true;
  }
  assert.ok(differs);
});

test('the analytic gradient matches a numeric one', () => {
  // The rider reads slopeAt every step; if it ever disagreed with the surface it
  // is supposed to describe, the fox would accelerate along a hill that is not
  // the hill it is standing on.
  const t = createTerrain({ seed: 9 });
  const h = 0.01;
  for (let x = 50; x < 9000; x += 311) {
    const numeric = (surfaceY(t, x + h) - surfaceY(t, x - h)) / (2 * h);
    assert.ok(Math.abs(numeric - slopeAt(t, x)) < 1e-4,
      `x=${x}: analytic ${slopeAt(t, x)} vs numeric ${numeric}`);
  }
});

test('slopes stay in the gentle range a ride game needs', () => {
  // Budgeting amplitude instead of gradient once produced a 65° mountainside
  // built out of ripples too small to see. This is the guard against that.
  for (const seed of [1, 5, 12, 30]) {
    const t = createTerrain({ seed });
    const angles = [];
    for (let x = 0; x < 12000; x += 7) angles.push(Math.abs(angleAt(t, x)));
    angles.sort((a, b) => a - b);
    const deg = (p) => (angles[Math.floor(p * angles.length)] * 180) / Math.PI;

    assert.ok(deg(0.5) < 18, `seed ${seed}: median slope ${deg(0.5).toFixed(1)}° is too steep`);
    assert.ok(deg(0.5) > 4, `seed ${seed}: median slope ${deg(0.5).toFixed(1)}° is too flat to ride`);
    assert.ok(angles[angles.length - 1] * 57.3 < 42,
      `seed ${seed}: peak slope ${(angles[angles.length - 1] * 57.3).toFixed(1)}° is a cliff`);
  }
});

test('the mountain descends overall', () => {
  const t = createTerrain({ seed: 3 });
  assert.ok(surfaceY(t, 11000) > surfaceY(t, 500) + 300, 'should lose real height');
  assert.equal(DRIFT > 0, true);
});

test('chasms open a hole in the ground and close it again', () => {
  const t = build(7);
  assert.ok(t.chasms.length >= 4, `only ${t.chasms.length} chasms`);
  for (const c of t.chasms) {
    const mid = (c.x0 + c.x1) / 2;
    assert.equal(groundY(t, mid), null, 'no ground inside a chasm');
    assert.notEqual(groundY(t, c.x0 - 5), null, 'ground before the near lip');
    assert.notEqual(groundY(t, c.x1 + 5), null, 'ground after the far lip');
    assert.ok(inChasm(t, mid));
    assert.equal(inChasm(t, c.x0 - 5), null);
  }
});

test('every chasm has a run-up and a far lip that is not uphill', () => {
  // Both are fairness rules, and both were added because the first generator
  // placed chasms just past climbs — the fox crested them at minimum speed and
  // dropped straight in with no jump that could have saved it.
  for (const seed of [1, 4, 7, 11, 19]) {
    const t = build(seed);
    for (const c of t.chasms) {
      assert.ok(meanSlope(t, c.x0 - RUN_UP, c.x0 - 80) > 0.06,
        `seed ${seed}: chasm at ${c.x0.toFixed(0)} has no descent behind it`);
      assert.ok(surfaceY(t, c.x1) > surfaceY(t, c.x0) - 8,
        `seed ${seed}: chasm at ${c.x0.toFixed(0)} lands uphill`);
    }
  }
});

test('chasms never overlap each other', () => {
  for (const seed of [1, 7, 21]) {
    const t = build(seed);
    const sorted = [...t.chasms].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i].x0 > sorted[i - 1].x1 + 200,
        `seed ${seed}: chasms at ${sorted[i - 1].x1.toFixed(0)} and ${sorted[i].x0.toFixed(0)} are too close`);
    }
  }
});

test('the analytic curvature matches a numeric one', () => {
  // Curvature decides when the fox leaves the ground, and a second derivative is
  // exactly where a numerical estimate would amplify noise into false launches.
  const t = build(4);
  const h = 0.05;
  for (let x = 200; x < 9000; x += 373) {
    const numeric = (surfaceY(t, x + h) - 2 * surfaceY(t, x) + surfaceY(t, x - h)) / (h * h);
    assert.ok(Math.abs(numeric - curvatureAt(t, x)) < 1e-3,
      `x=${x}: analytic ${curvatureAt(t, x)} vs numeric ${numeric}`);
  }
});

test('kickers exist and are sharp enough to launch from', () => {
  const t = build(7);
  assert.ok(t.kickers.length > 12, `only ${t.kickers.length} ramps on a whole mountain`);
  const launchable = t.kickers.filter((k) => curvatureAt(t, k.x) > 0.02);
  assert.ok(launchable.length > t.kickers.length * 0.6,
    `only ${launchable.length}/${t.kickers.length} ramps have real curvature`);
});

test('lowestBetween finds the deepest point of a span', () => {
  const t = createTerrain({ seed: 2 });
  const low = lowestBetween(t, 1000, 2000, 5);
  for (let x = 1000; x <= 2000; x += 5) {
    assert.ok(surfaceY(t, x) <= low + 1e-9);
  }
});
