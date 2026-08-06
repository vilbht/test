// Level generation: the invariants that keep a no-fail game actually no-fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLevel, groundYAt, safeSpotNear, ZONES, STEP_UP, LEDGE_RUNOUT, mulberry32,
} from '../core/level.mjs';
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

// ---- one-way ledges must not be traps

test('no ledge drops you off the end of its host slab', () => {
  // A ledge is a route, and stepping off the end of one is a fall that travels.
  // If the ground beneath runs out inside that distance the drop lands in
  // whatever comes next — and when that is a gap, the level is impassable even
  // though the ledge and the gap are each perfectly legal. The bot found this
  // twice in forty seeds the first time the grove got three tiers of ledges.
  for (let seed = 1; seed <= 40; seed++) {
    const level = generateLevel(seed);
    const solids = level.rects.filter((r) => !r.oneWay);

    for (const ledge of level.rects.filter((r) => r.oneWay)) {
      const under = solids.filter((s) => s.x < ledge.x + ledge.w && s.x + s.w > ledge.x);
      assert.ok(under.length > 0, `seed ${seed}: a ledge at x=${ledge.x.toFixed(0)} floats over nothing`);

      const runout = Math.max(...under.map((s) => s.x + s.w)) - (ledge.x + ledge.w);
      assert.ok(runout >= LEDGE_RUNOUT - 1,
        `seed ${seed}: ledge at x=${ledge.x.toFixed(0)} ends ${runout.toFixed(0)}px ` +
        `before its ground runs out, needs ${LEDGE_RUNOUT}`);
    }
  }
});

test('each zone builds its ground by its own grammar', () => {
  // The zones are meant to be three places. Three places that differ only in
  // how wobbly the floor is read as one place with three palettes.
  const kinds = new Set(ZONES.map((z) => z.terrain));
  assert.equal(kinds.size, ZONES.length, 'two zones share a terrain grammar');

  const level = generateLevel(7);
  const heights = {};
  for (const zone of ZONES) {
    heights[zone.key] = [...new Set(
      level.rects.filter((r) => !r.oneWay && r.zone === zone.key).map((r) => r.y),
    )];
  }

  // the canyon snaps to a rack unit; the others do not
  const canyon = ZONES.find((z) => z.key === 'canyon');
  const spans = heights.canyon.map((y) => Math.abs(y - Math.min(...heights.canyon)));
  const offGrid = spans.filter((d) => d % canyon.rack > 1 && d % canyon.rack < canyon.rack - 1);
  assert.equal(offGrid.length, 0,
    `canyon heights should sit on the ${canyon.rack}px rack, ${offGrid.length} do not`);

  // the grove's floor is nearly level — its height is overhead, in the ledges
  const groveSpread = Math.max(...heights.grove) - Math.min(...heights.grove);
  const meadowSpread = Math.max(...heights.meadow) - Math.min(...heights.meadow);
  assert.ok(groveSpread < meadowSpread,
    `grove floor spread ${groveSpread} should be flatter than the meadow's ${meadowSpread}`);

  const ledgesIn = (key) => level.rects.filter((r) => r.oneWay && r.zone === key).length;
  assert.ok(ledgesIn('grove') > ledgesIn('meadow') * 1.5,
    `grove has ${ledgesIn('grove')} ledges against the meadow's ${ledgesIn('meadow')}`);
});

test('zones join at a level seam, not a cliff', () => {
  // Each zone used to reset its surface to GROUND_Y, which put a step of up to
  // the previous zone's whole band at the boundary — twice STEP_UP in the
  // canyon's case, a wall the generator would never allow anywhere else.
  for (let seed = 1; seed <= 20; seed++) {
    const level = generateLevel(seed);
    for (const zone of ZONES.slice(1)) {
      const before = groundYAt(level, zone.start - 8);
      const after = groundYAt(level, zone.start + 8);
      assert.ok(before !== null && after !== null,
        `seed ${seed}: no ground across the ${zone.key} seam`);
      assert.ok(before - after <= STEP_UP,
        `seed ${seed}: ${zone.key} opens ${(before - after).toFixed(0)}px above the zone before it`);
    }
  }
});
