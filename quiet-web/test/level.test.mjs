// Level generation: the invariants that keep a no-fail game actually no-fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, groundYAt, safeSpotNear, ZONES, STEP_UP, mulberry32 } from '../core/level.mjs';
import { TUNING } from '../core/physics.mjs';
import { FACTS } from '../core/facts.mjs';

test('the same seed always builds the same world', () => {
  const a = generateLevel(42);
  const b = generateLevel(42);
  assert.deepEqual(a.rects, b.rects);
  assert.equal(a.sparkles.length, b.sparkles.length);
  assert.equal(a.beacons.length, b.beacons.length);
});

test('different seeds build different worlds', () => {
  const a = generateLevel(1);
  const b = generateLevel(2);
  assert.notDeepEqual(a.rects, b.rects);
});

test('no gap anywhere exceeds the jump reach, across many seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const level = generateLevel(seed);
    for (const g of level.gaps) {
      assert.ok(g.w <= TUNING.maxSafeGap,
        `seed ${seed}: ${g.w.toFixed(1)}px gap exceeds ${TUNING.maxSafeGap}`);
      assert.ok(g.w >= 58, `seed ${seed}: ${g.w.toFixed(1)}px gap is too small to read`);
    }
  }
});

test('no upward step exceeds what the jump clears, across many seeds', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const level = generateLevel(seed);
    const byZone = new Map();
    for (const s of level.solids) {
      if (!byZone.has(s.zone)) byZone.set(s.zone, []);
      byZone.get(s.zone).push(s);
    }
    for (const slabs of byZone.values()) {
      slabs.sort((p, q) => p.x - q.x);
      for (let i = 1; i < slabs.length; i++) {
        const rise = slabs[i - 1].y - slabs[i].y;   // y grows downward
        assert.ok(rise <= STEP_UP + 0.5,
          `seed ${seed}: ${rise.toFixed(1)}px rise exceeds STEP_UP`);
      }
    }
  }
});

test('every beacon sits on solid ground and carries a distinct fact', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const level = generateLevel(seed);
    assert.equal(level.beacons.length, 9, `seed ${seed}: expected one beacon per fact`);
    const seen = new Set();
    for (const b of level.beacons) {
      const g = groundYAt(level, b.x);
      assert.notEqual(g, null, `seed ${seed}: beacon at ${b.x} floats over a gap`);
      assert.equal(b.y, g, `seed ${seed}: beacon not resting on the surface`);
      assert.ok(b.fact && b.fact.body, 'beacon missing its fact');
      assert.equal(seen.has(b.fact.title), false, 'facts must not repeat');
      seen.add(b.fact.title);
    }
  }
});

test('the fact list is the length the beacon layout assumes', () => {
  assert.equal(FACTS.length, 9);
  for (const f of FACTS) {
    assert.ok(f.title.length > 0 && f.body.length > 40, `thin fact: ${f.title}`);
  }
});

test('zones tile the level with no overlap or hole', () => {
  for (let i = 1; i < ZONES.length; i++) {
    assert.equal(ZONES[i].start, ZONES[i - 1].end, 'zones must abut exactly');
  }
});

test('a fallen fox is always lifted onto real ground', () => {
  const level = generateLevel(11);
  for (let x = 0; x < level.width; x += 137) {
    const spot = safeSpotNear(level, x);
    assert.notEqual(groundYAt(level, spot.x), null, `no safe ground found near ${x}`);
    assert.equal(spot.y, groundYAt(level, spot.x));
  }
});

test('set-pieces land in the zone that is meant to teach them', () => {
  const level = generateLevel(5);
  const canyon = ZONES.find((z) => z.key === 'canyon');
  const grove = ZONES.find((z) => z.key === 'grove');
  assert.ok(level.seesaws.length > 0, 'canyon should have see-saws');
  for (const s of level.seesaws) {
    assert.ok(s.x >= canyon.start && s.x < canyon.end, 'see-saw outside the canyon');
  }
  assert.ok(level.vines.length > 0, 'grove should have vines');
  for (const v of level.vines) {
    assert.ok(v.x >= grove.start && v.x < grove.end, 'vine outside the grove');
  }
  assert.ok(level.crates.length > 0, 'canyon should have crates');
});

test('the seeded rng is stable and stays in range', () => {
  const rng = mulberry32(1234);
  const first = [rng(), rng(), rng()];
  const again = mulberry32(1234);
  assert.deepEqual([again(), again(), again()], first);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});
