// Placement. On a heightfield the ground is traversable by construction, so
// these are fairness rules rather than survival ones: is this thing reachable,
// is it visible in time, is it standing over a hole.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, progressAt, chapterAt, CHAPTERS, LENGTH } from '../core/level.mjs';
import { surfaceY, inChasm, meanSlope } from '../core/terrain.mjs';
import { FACTS } from '../core/facts.mjs';

test('the same seed builds the same mountain and the same things on it', () => {
  const a = generateLevel(11);
  const b = generateLevel(11);
  assert.equal(a.coins.length, b.coins.length);
  assert.equal(a.rocks.length, b.rocks.length);
  assert.deepEqual(a.beacons.map((x) => Math.round(x.x)), b.beacons.map((x) => Math.round(x.x)));
});

test('different seeds differ', () => {
  const a = generateLevel(1);
  const b = generateLevel(2);
  assert.notDeepEqual(
    a.rocks.map((r) => Math.round(r.x)),
    b.rocks.map((r) => Math.round(r.x)),
  );
});

test('nothing is placed over a chasm', () => {
  // A coin hanging over a hole is a trap: it asks the player to steer into the
  // one place the mountain does not exist.
  for (let seed = 1; seed <= 25; seed++) {
    const level = generateLevel(seed);
    for (const c of level.coins) {
      assert.equal(inChasm(level.terrain, c.x), null, `seed ${seed}: coin over a chasm`);
    }
    for (const r of level.rocks) {
      assert.equal(inChasm(level.terrain, r.x), null, `seed ${seed}: rock over a chasm`);
    }
    for (const b of level.beacons) {
      assert.equal(inChasm(level.terrain, b.x), null, `seed ${seed}: campfire over a chasm`);
    }
  }
});

test('every fact gets exactly one campfire, sitting on the snow', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const level = generateLevel(seed);
    assert.equal(level.beacons.length, FACTS.length);
    const seen = new Set();
    for (const b of level.beacons) {
      assert.ok(Math.abs(b.y - surfaceY(level.terrain, b.x)) < 0.001, 'campfire floats');
      assert.equal(seen.has(b.fact.title), false, 'facts must not repeat');
      seen.add(b.fact.title);
    }
  }
});

test('campfires are spread across the whole descent', () => {
  const level = generateLevel(7);
  const xs = level.beacons.map((b) => b.x).sort((a, b) => a - b);
  assert.ok(xs[0] < LENGTH * 0.2, 'the first should come early');
  assert.ok(xs[xs.length - 1] > LENGTH * 0.8, 'the last should come late');
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] - xs[i - 1] > 400, 'campfires should not bunch up');
  }
});

test('rocks are never hidden behind a rise', () => {
  // The one rule that keeps this a calm game rather than a memorisation test.
  for (let seed = 1; seed <= 25; seed++) {
    const level = generateLevel(seed);
    for (const r of level.rocks) {
      assert.ok(meanSlope(level.terrain, r.x - 220, r.x) > -0.05,
        `seed ${seed}: rock at ${r.x.toFixed(0)} sits behind a blind rise`);
    }
  }
});

test('rocks never sit on top of a campfire', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const level = generateLevel(seed);
    for (const r of level.rocks) {
      for (const b of level.beacons) {
        assert.ok(Math.abs(r.x - b.x) > 100,
          `seed ${seed}: rock and campfire overlap at ${r.x.toFixed(0)}`);
      }
    }
  }
});

test('coins hang above the snow, never buried in it', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const level = generateLevel(seed);
    for (const c of level.coins) {
      const above = surfaceY(level.terrain, c.x) - c.y;
      assert.ok(above > 12, `seed ${seed}: coin only ${above.toFixed(0)}px above the snow`);
      assert.ok(above < 210, `seed ${seed}: coin ${above.toFixed(0)}px up is out of reach`);
    }
  }
});

test('every rail spans a dip, so there is something to grind over', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const level = generateLevel(seed);
    assert.ok(level.rails.length > 0, `seed ${seed}: no rails at all`);
    for (const rail of level.rails) {
      const mid = (rail.x0 + rail.x1) / 2;
      const chordY = (rail.y0 + rail.y1) / 2;
      assert.ok(surfaceY(level.terrain, mid) - chordY > 20,
        `seed ${seed}: rail at ${rail.x0.toFixed(0)} lies flat on the ground`);
      assert.ok(rail.x1 > rail.x0, 'rails must run forward');
    }
  }
});

test('progress runs 0 to 1 and chapters follow it', () => {
  const level = generateLevel(7);
  assert.equal(progressAt(level, -500), 0);
  assert.equal(progressAt(level, level.length * 2), 1);
  assert.ok(Math.abs(progressAt(level, level.length / 2) - 0.5) < 1e-9);

  assert.equal(chapterAt(0).key, CHAPTERS[0].key);
  assert.equal(chapterAt(1).key, CHAPTERS[CHAPTERS.length - 1].key);
  for (let i = 1; i < CHAPTERS.length; i++) {
    assert.ok(CHAPTERS[i].at > CHAPTERS[i - 1].at, 'chapters must ascend');
  }
});
