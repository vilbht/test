// level.mjs — seeded, deterministic level generation for the three zones.
//
// Generation is constrained rather than checked-after-the-fact: gap widths are
// drawn from a range whose maximum is TUNING.maxSafeGap, which is itself derived
// from the jump arc. A gap the fox cannot clear is therefore unrepresentable
// rather than merely unlikely, and the test suite asserts it across many seeds.

import { TUNING } from './physics.mjs';
import { createWind, createSeesaw, createCrate } from './bodies.mjs';
import { createVine } from './verlet.mjs';
import { FACTS } from './facts.mjs';

/** Small, fast, seedable PRNG. Same seed always yields the same world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GROUND_Y = 420;
export const DEPTH = 900; // how far ground rects extend below the surface

/**
 * Largest rise between adjacent slabs. An upward step is a wall the fox must jump,
 * so this is bounded well under the jump peak — and under it even at the far side
 * of a maximum-width gap, which the test suite checks by simulating the worst case.
 */
export const STEP_UP = 40;

/**
 * Minimum width of a slab that a gap may immediately follow, when the fox
 * arrived on that slab by jumping a rise.
 *
 * Jumping a rise at full run speed carries roughly the jump reach (~160px)
 * before touching down. If the slab beyond the rise is shorter than that and
 * ends in a gap, the arc sails clean over the landing spot and into the pit —
 * the fox never gets a frame on the ground to jump again. Every piece is legal
 * on its own; the sequence is the trap.
 *
 * Measured, not assumed: across 40 seeds the bot in test/playable.test.mjs falls
 * once without this rule and never with it.
 */
export const LANDING_RUN = 185;

/**
 * Zone identity and terrain shape only. Colour lives in js/art/scenery.js —
 * core/ stays free of anything that is a rendering decision, so the whole
 * simulation remains testable without a canvas.
 */
export const ZONES = Object.freeze([
  { key: 'meadow', name: 'Sunlit Meadow', start: 0, end: 3000, band: 44, gapChance: 0.42 },
  { key: 'canyon', name: 'Server Canyon', start: 3000, end: 6300, band: 74, gapChance: 0.55 },
  { key: 'grove', name: 'Data Grove', start: 6300, end: 9700, band: 62, gapChance: 0.48 },
]);

export const LEVEL_END = ZONES[ZONES.length - 1].end;

export function zoneAt(x) {
  for (const z of ZONES) if (x < z.end) return z;
  return ZONES[ZONES.length - 1];
}

/**
 * Build the world.
 *
 * Ground is a run of solid slabs separated by gaps. Surface height wanders within
 * each zone's band. Any upward step is a wall to a platformer character, so rises
 * are capped at STEP_UP — comfortably inside the ~90px jump peak — while drops can
 * be larger, since falling is free.
 */
export function generateLevel(seed = 7) {
  const rng = mulberry32(seed);
  const rects = [];
  const solids = [];      // just the walkable slabs, for placing things on
  const gaps = [];

  for (const zone of ZONES) {
    let x = zone.start;
    let y = GROUND_Y;

    // every zone opens with a wide, flat, safe slab to land in
    const openW = 300;
    const opener = { x, y, w: openW, h: DEPTH, zone: zone.key };
    rects.push(opener); solids.push(opener);
    x += openW;

    let enteredByRise = false;
    let prevSlabW = openW;

    while (x < zone.end - 260) {
      // Do not let a gap follow a short slab that was reached by jumping a rise:
      // the landing arc would overshoot the slab entirely. See LANDING_RUN.
      const roomToLand = !enteredByRise || prevSlabW >= LANDING_RUN;

      if (roomToLand && rng() < zone.gapChance) {
        // Minimum 58 keeps a gap readable as a gap; maximum is the derived
        // jump reach, so every gap in the game is clearable by design.
        const gap = 58 + rng() * (TUNING.maxSafeGap - 58);
        gaps.push({ x, w: gap, zone: zone.key });
        x += gap;
      }
      // Step the surface up or down within the zone's band. y grows downward, so
      // a negative step is a rise — that is the direction STEP_UP has to cap.
      const r = rng() - 0.5;
      const step = r < 0 ? r * 2 * STEP_UP : r * 2 * Math.min(64, zone.band);
      y = Math.max(GROUND_Y - zone.band, Math.min(GROUND_Y + zone.band * 0.5, y + step));
      y = Math.round(y);

      enteredByRise = step < -0.5;   // negative step = the surface rose

      const w = 170 + rng() * 230;
      const slab = { x, y, w: Math.min(w, zone.end - x), h: DEPTH, zone: zone.key };
      rects.push(slab); solids.push(slab);
      x += slab.w;
      prevSlabW = slab.w;
    }

    // closing slab so a zone never ends on a cliff edge
    const closer = { x, y, w: Math.max(120, zone.end - x), h: DEPTH, zone: zone.key };
    rects.push(closer); solids.push(closer);
  }

  // ---- floating one-way ledges, for optional height
  const ledges = [];
  for (const zone of ZONES) {
    const n = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const host = pickSolid(solids, zone.key, rng);
      if (!host || host.w < 150) continue;
      const lx = host.x + 30 + rng() * (host.w - 120);
      const ly = host.y - (86 + rng() * 54);
      const ledge = { x: lx, y: ly, w: 78 + rng() * 62, h: 12, oneWay: true, zone: zone.key };
      rects.push(ledge); ledges.push(ledge);
    }
  }

  // ---- beacons: three per zone, evenly spread, always on a solid surface
  const beacons = [];
  ZONES.forEach((zone, zi) => {
    const zoneSolids = solids.filter((s) => s.zone === zone.key && s.w > 150);
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const host = zoneSolids[Math.min(zoneSolids.length - 1, Math.floor(t * zoneSolids.length))];
      if (!host) continue;
      beacons.push({
        x: Math.round(host.x + host.w / 2),
        y: host.y,
        zone: zone.key,
        fact: FACTS[zi * 3 + i],
        charge: 0,
        lit: false,
      });
    }
  });

  // ---- sparkles: the collectible. Purple four-point stars from the reference.
  const sparkles = [];
  for (const s of solids) {
    const n = Math.floor(s.w / 120);
    for (let i = 0; i < n; i++) {
      sparkles.push({
        x: s.x + (i + 0.7) * (s.w / (n + 0.4)),
        y: s.y - (26 + rng() * 66),
        got: false,
        phase: rng() * Math.PI * 2,
      });
    }
  }
  for (const l of ledges) {
    sparkles.push({ x: l.x + l.w / 2, y: l.y - 26, got: false, phase: rng() * Math.PI * 2 });
  }

  // ---- trackers: drift horizontally, cling to the fox, dispersed by a pulse
  const trackers = [];
  for (const s of solids) {
    if (s.zone === 'meadow' && rng() < 0.62) continue;   // meadow stays gentle
    if (rng() < 0.34) continue;
    trackers.push({
      x: s.x + s.w * (0.25 + rng() * 0.5),
      y: s.y - (40 + rng() * 70),
      home: s.y - (40 + rng() * 70),
      vx: (rng() < 0.5 ? -1 : 1) * (16 + rng() * 26),
      range: 60 + rng() * 90,
      origin: 0,
      clinging: false,
      dispersed: false,
      phase: rng() * Math.PI * 2,
    });
  }
  for (const t of trackers) t.origin = t.x;

  // ---- crumbs: ground-skittering obstacles, canyon and grove only
  const crumbs = [];
  for (const s of solids) {
    if (s.zone === 'meadow') continue;
    if (rng() < 0.6) continue;
    crumbs.push({
      x: s.x + s.w * (0.2 + rng() * 0.6),
      y: s.y,
      vx: (rng() < 0.5 ? -1 : 1) * (34 + rng() * 30),
      min: s.x + 8,
      max: s.x + s.w - 8,
      dispersed: false,
    });
  }

  // ---- set-pieces, one signature per zone
  const winds = [];
  for (let i = 0; i < 3; i++) {
    const zx = 420 + i * 820;
    winds.push(createWind({
      x: zx, y: GROUND_Y - 300, w: 380, h: 340,
      fx: 70 + rng() * 60, fy: -14, phase: rng() * 6.28,
    }));
  }

  const seesaws = [];
  const canyonSolids = solids.filter((s) => s.zone === 'canyon' && s.w > 260);
  for (let i = 0; i < Math.min(3, canyonSolids.length); i++) {
    const host = canyonSolids[Math.floor((i + 0.5) * canyonSolids.length / 3)];
    if (!host) continue;
    seesaws.push(createSeesaw({ x: host.x + host.w / 2, y: host.y - 62, len: 168 }));
  }

  const crates = [];
  for (const host of canyonSolids.slice(0, 4)) {
    crates.push(createCrate({ x: host.x + host.w * 0.66, y: host.y - 34, size: 30 }));
  }

  const vines = [];
  const groveSolids = solids.filter((s) => s.zone === 'grove' && s.w > 200);
  for (let i = 0; i < Math.min(4, groveSolids.length); i++) {
    const host = groveSolids[Math.floor((i + 0.5) * groveSolids.length / 4)];
    if (!host) continue;
    vines.push(createVine({ x: host.x + host.w / 2, y: host.y - 250, count: 13, segment: 9 }));
  }

  return {
    seed, rects, solids, ledges, gaps, beacons, sparkles, trackers, crumbs,
    winds, seesaws, crates, vines,
    width: LEVEL_END,
    start: { x: 90, y: GROUND_Y },
  };
}

function pickSolid(solids, zoneKey, rng) {
  const pool = solids.filter((s) => s.zone === zoneKey);
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/** Surface y at a world x, or null over a gap. Used to place things and to respawn. */
export function groundYAt(level, x) {
  let best = null;
  for (const s of level.solids) {
    if (x >= s.x && x <= s.x + s.w) {
      if (best === null || s.y < best) best = s.y;
    }
  }
  return best;
}

/** Nearest solid ground to the left — where a fallen fox is lifted back to. */
export function safeSpotNear(level, x) {
  for (let probe = x; probe > 0; probe -= 24) {
    const y = groundYAt(level, probe);
    if (y !== null) return { x: probe, y };
  }
  return { ...level.start };
}
