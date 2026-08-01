// level.mjs — what sits on the mountain: coins, campfires, rocks, rails, trackers.
//
// The platformer generator this replaces had to *build* the ground and then
// guarantee it was traversable. A heightfield is continuous and always
// traversable by construction, so generation here is only ever placement: find
// good spots on a surface that already exists. That is a much smaller problem,
// and it is why the level invariants are now about fairness (is this rock on a
// blind crest?) rather than about survival.

import { mulberry32 } from './rng.mjs';
import {
  createTerrain, addChasms, addKickers, addLipKickers,
  surfaceY, slopeAt, inChasm, meanSlope,
} from './terrain.mjs';
import { clearanceSpeed, speedProfile, approachSpeed, probeDescent } from './ride.mjs';
import { FACTS } from './facts.mjs';

export const LENGTH = 12600;

/** Named stretches of the descent. Purely for signposting — the palette is continuous. */
export const CHAPTERS = Object.freeze([
  { key: 'ridge', name: 'The Ridge', at: 0 },
  { key: 'pines', name: 'The Pines', at: 0.36 },
  { key: 'valley', name: 'The Long Valley', at: 0.7 },
]);

export function chapterAt(progress) {
  let found = CHAPTERS[0];
  for (const c of CHAPTERS) if (progress >= c.at) found = c;
  return found;
}

/** Is this a fair place to put something the player must react to? */
function clearGround(terrain, x, pad = 46) {
  if (inChasm(terrain, x - pad) || inChasm(terrain, x) || inChasm(terrain, x + pad)) return false;
  return Math.abs(slopeAt(terrain, x)) < 0.55;
}

/**
 * Build the mountain itself, fully featured.
 *
 * Order matters. Ramps first, then measure how fast the fox actually rides this
 * mountain, then cut chasms only where that measured speed can carry it across,
 * then put a ramp on each lip. Cutting the holes first would mean measuring a
 * mountain the fox keeps falling through.
 *
 * Exported so tests build the same mountain the game does — a test that assembles
 * the pipeline by hand stops testing the real thing the moment a step is added.
 */
export function buildMountain(seed = 7, length = LENGTH) {
  const terrain = createTerrain({ seed, length });
  addKickers(terrain, { seed });

  const profile = speedProfile(terrain);
  addChasms(terrain, {
    seed,
    canClear: (x, width, drop) => approachSpeed(profile, x) >= clearanceSpeed(width, drop, 1.5),
  });
  addLipKickers(terrain, { seed });
  refineChasms(terrain);
  return terrain;
}

/**
 * Make every chasm provably crossable, by playing the mountain.
 *
 * Two passes of reasoning were tried first and both fell short. A static check
 * against local gradient ignores momentum entirely. A check against a measured
 * passive descent is much better but still optimistic: the played ride scrubs
 * speed on landings the passive ride never makes, and the lip ramps themselves
 * are added after that measurement.
 *
 * So this stops predicting. It rides the finished mountain exactly as the game
 * asks to be played, shrinks whatever the fox actually fell into, and rides
 * again — until a full descent comes back clean. A gap that cannot be narrowed
 * enough is removed, because an uncrossable gap is worse than no gap at all.
 */
export function refineChasms(terrain, { minWidth = 78, passes = 6, shrink = 14 } = {}) {
  for (let pass = 0; pass < passes; pass++) {
    const { fell } = probeDescent(terrain);
    if (fell.size === 0) return terrain;

    terrain.chasms = terrain.chasms.filter((c) => {
      if (!fell.has(c)) return true;
      const width = c.x1 - c.x0 - shrink;
      if (width < minWidth) return false;
      c.x1 = c.x0 + width;
      return true;
    });
  }
  return terrain;
}

export function generateLevel(seed = 7) {
  const rng = mulberry32(seed);
  const terrain = buildMountain(seed);

  const coins = [];
  const beacons = [];
  const rocks = [];
  const rails = [];
  const trackers = [];
  const winds = [];

  // ---- Coins come in two kinds, and the split matters.
  //
  // Ground chains hug the contour a few pixels above the snow, so simply riding
  // well sweeps them up. Air arcs hang over kickers along the parabola a launch
  // actually follows, so they reward committing to the jump.
  //
  // The first pass hung every coin 44-90px overhead, which reads fine in a
  // screenshot and is unreachable in play: a grounded fox rides at surface
  // height and can never touch them.
  const drop = (cx) => surfaceY(terrain, cx);

  for (let x = 420; x < LENGTH - 500; x += 330 + rng() * 340) {
    if (!clearGround(terrain, x, 80)) continue;
    const n = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const cx = x + i * 34;
      if (inChasm(terrain, cx)) continue;
      coins.push({ x: cx, y: drop(cx) - 20, got: false, phase: rng() * Math.PI * 2 });
    }
  }

  for (const k of terrain.kickers) {
    if (rng() < 0.4) continue;
    const n = 5;
    const reach = 150;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const cx = k.x + 40 + t * reach;
      if (cx > LENGTH - 200 || inChasm(terrain, cx)) continue;
      // a shallow arc over the ramp, peaking around the middle of the flight
      coins.push({
        x: cx,
        y: drop(cx) - 34 - Math.sin(t * Math.PI) * 62,
        got: false,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // ---- campfires: one per fact, evenly spread, always on calm open ground
  for (let i = 0; i < FACTS.length; i++) {
    const target = (i + 0.5) * (LENGTH / FACTS.length);
    let x = target;
    let guard = 0;
    while (!clearGround(terrain, x, 70) && guard++ < 300) x += 18;
    beacons.push({
      x,
      y: surfaceY(terrain, x),
      fact: FACTS[i],
      charge: 0,
      lit: false,
    });
  }

  // ---- rocks: only on ground the player can see coming. A rock just over a
  // crest is not difficulty, it is an ambush, and this game is not that.
  for (let x = 900; x < LENGTH - 400; x += 340 + rng() * 420) {
    let px = x;
    let guard = 0;
    while (guard++ < 200) {
      const visible = meanSlope(terrain, px - 220, px) > -0.05;   // not hidden behind a rise
      if (clearGround(terrain, px, 60) && visible && !nearAny(beacons, px, 150)) break;
      px += 16;
    }
    if (guard >= 200) continue;
    rocks.push({ x: px, y: surfaceY(terrain, px), r: 9 + rng() * 7, hit: false });
  }

  // ---- grind rails: a straight line pinned above a dip, so the chord clears
  // the surface in the middle and there is something to grind across
  for (let x = 1700; x < LENGTH - 800; x += 1100 + rng() * 900) {
    let px = x;
    let guard = 0;
    let len = 0;
    while (guard++ < 300) {
      len = 230 + rng() * 110;
      const y0 = surfaceY(terrain, px);
      const y1 = surfaceY(terrain, px + len);
      const mid = surfaceY(terrain, px + len / 2);
      const chord = (y0 + y1) / 2;
      const spansDip = mid - chord > 26;
      const clear = !inChasm(terrain, px) && !inChasm(terrain, px + len);
      if (spansDip && clear) break;
      px += 22;
    }
    if (guard >= 300) continue;
    rails.push({
      x0: px, y0: surfaceY(terrain, px) - 16,
      x1: px + len, y1: surfaceY(terrain, px + len) - 16,
    });
  }

  // ---- trackers: drift just above the snow, cling on contact, shaken off by
  // landing a flip. They thin out as the light goes, so the night run is calm.
  for (let x = 1300; x < LENGTH - 400; x += 260 + rng() * 340) {
    if (!clearGround(terrain, x, 40)) continue;
    if (rng() < 0.35 * (x / LENGTH)) continue;
    trackers.push({
      x,
      y: surfaceY(terrain, x) - (34 + rng() * 40),
      home: 0,
      origin: x,
      range: 40 + rng() * 70,
      vx: (rng() < 0.5 ? -1 : 1) * (14 + rng() * 22),
      phase: rng() * Math.PI * 2,
      clinging: false,
      dispersed: false,
    });
  }
  for (const t of trackers) t.home = t.y;

  // ---- wind bands, for the snow drift and the tail
  for (let i = 0; i < 5; i++) {
    const x = 800 + i * (LENGTH / 5.4);
    winds.push({
      x, y: surfaceY(terrain, x) - 320, w: 620, h: 420,
      fx: 46 + rng() * 54, fy: -8, gust: 0.4, phase: rng() * 6.28,
    });
  }

  return {
    seed, terrain, coins, beacons, rocks, rails, trackers, winds,
    length: LENGTH,
    start: { x: 60, y: surfaceY(terrain, 60) },
  };
}

function nearAny(list, x, dist) {
  return list.some((item) => Math.abs(item.x - x) < dist);
}

/** How far down the mountain, 0..1. Drives the day/night cycle. */
export function progressAt(level, x) {
  return Math.max(0, Math.min(1, x / level.length));
}
