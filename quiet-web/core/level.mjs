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
 * Ground a one-way ledge must have beneath and beyond it before its host slab
 * ends.
 *
 * Walking off the end of a ledge is a fall, and a fall at run speed travels.
 * From the top tier — about 240px up — the fox is back on the ground roughly
 * 100px further east with no chance to jump on the way down. If the slab runs
 * out inside that distance, the drop lands in whatever follows, and if what
 * follows is a gap the route is impassable no matter how legal the ledge and
 * the gap each are on their own.
 *
 * Found by the bot in test/playable.test.mjs, which fell twice in forty seeds
 * the first time the grove was given three tiers of ledges instead of one.
 */
export const LEDGE_RUNOUT = 120;

/**
 * Zone identity and terrain shape only. Colour lives in js/art/scenery.js —
 * core/ stays free of anything that is a rendering decision, so the whole
 * simulation remains testable without a canvas.
 */
/**
 * Each zone builds its ground by its own rules, not by the same rule with
 * different numbers. They are meant to be three places, and three places that
 * only differ in how wobbly the floor is read as one place with three palettes.
 *
 *   rolling   the meadow. Wide, gentle, forgiving — the zone that teaches you
 *             the jump. Long slabs, few gaps, small smooth height changes.
 *   terraced  the canyon. Machine-made: heights snap to a fixed rack unit and
 *             the surface climbs in runs of equal steps before dropping away.
 *             Narrower slabs, more gaps, a deliberate rhythm.
 *   tiered    the grove. The floor barely moves; the interest is overhead. Wide
 *             gaps, and stacked one-way ledges to climb through.
 *
 * All three still obey the same safety invariants — maxSafeGap, STEP_UP,
 * LANDING_RUN — because those come from the jump arc, not from the zone.
 */
export const ZONES = Object.freeze([
  {
    key: 'meadow', name: 'Sunlit Meadow', start: 0, end: 3000,
    terrain: 'rolling', band: 44, gapChance: 0.30,
    slab: [230, 420], ledges: [4, 2], ledgeTiers: 1,
  },
  {
    key: 'canyon', name: 'Server Canyon', start: 3000, end: 6300,
    terrain: 'terraced', band: 78, gapChance: 0.58,
    slab: [150, 260], ledges: [5, 3], ledgeTiers: 2,
    rack: 26,          // heights snap to this, so the zone reads as built
    runLength: 3,      // terraces per staircase before it turns around
  },
  {
    key: 'grove', name: 'Data Grove', start: 6300, end: 9700,
    terrain: 'tiered', band: 26, gapChance: 0.52,
    slab: [190, 330], ledges: [8, 4], ledgeTiers: 3,
  },
]);

export const LEVEL_END = ZONES[ZONES.length - 1].end;

export function zoneAt(x) {
  for (const z of ZONES) if (x < z.end) return z;
  return ZONES[ZONES.length - 1];
}

/**
 * The next surface height for a zone, given where it is now.
 *
 * Returns the new y and nothing else; the caller owns the clamping to the
 * zone's band, because that is the same for every terrain. A rise is a *negative*
 * step in screen coordinates and is a wall the fox has to jump, so every branch
 * that can go up is capped at STEP_UP — the direction is easy to get backwards
 * and it was, once: the cap ended up limiting descents, which need no limit at
 * all because falling is free.
 */
function stepSurface(zone, y, rng, state) {
  if (zone.terrain === 'terraced') {
    // Everything in this zone is measured from the height it opened at, so the
    // grid survives the surface being inherited from the zone before rather
    // than starting at a round number.
    if (state.base === undefined) state.base = y;

    // A staircase of equal rack-height steps, then a turn. The equal steps are
    // the whole point: a random walk quantised to a grid still reads as random,
    // and what makes this zone feel built is repetition.
    if (state.left <= 0) {
      state.left = 1 + Math.floor(rng() * zone.runLength);
      state.dir = rng() < 0.52 ? -1 : 1;
      state.units = state.dir < 0
        ? 1 + Math.floor(rng() * Math.floor(STEP_UP / zone.rack))   // a rise: capped
        : 1 + Math.floor(rng() * 3);                                // a drop: free
    }
    state.left--;
    return y + state.dir * state.units * zone.rack;
  }

  if (zone.terrain === 'tiered') {
    // Nearly level ground — the grove's height is in its canopy of ledges, and
    // a bumpy floor underneath them makes the stack unreadable.
    const r = rng() - 0.5;
    return y + (r < 0 ? r * 2 * (STEP_UP * 0.45) : r * 2 * 30);
  }

  const r = rng() - 0.5;
  return y + (r < 0 ? r * 2 * STEP_UP : r * 2 * Math.min(64, zone.band));
}

/**
 * Build the world.
 *
 * Ground is a run of solid slabs separated by gaps, laid down by whichever
 * terrain grammar the zone declares. Any upward step is a wall to a platformer
 * character, so rises are capped at STEP_UP — comfortably inside the ~90px jump
 * peak — while drops can be larger, since falling is free.
 */
export function generateLevel(seed = 7) {
  const rng = mulberry32(seed);
  const rects = [];
  const solids = [];      // just the walkable slabs, for placing things on
  const gaps = [];

  // Carried across zones so each one opens at the height the last one ended.
  // Resetting to GROUND_Y at every boundary put a step of up to the previous
  // zone's whole band at the seam — twice STEP_UP in the canyon's case, a wall
  // the generator would never have allowed anywhere else.
  let y = GROUND_Y;

  for (const zone of ZONES) {
    let x = zone.start;

    // every zone opens with a wide, flat, safe slab to land in
    const openW = 300;
    const opener = { x, y, w: openW, h: DEPTH, zone: zone.key };
    rects.push(opener); solids.push(opener);
    x += openW;

    let enteredByRise = false;
    let prevSlabW = openW;
    const surface = { left: 0, dir: 1, units: 1 };   // terraced staircase state

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
      const before = y;
      y = stepSurface(zone, y, rng, surface);
      y = Math.max(GROUND_Y - zone.band, Math.min(GROUND_Y + zone.band * 0.5, y));
      // Re-snap after the clamp, not before: clamping to the band is what
      // knocks a terrace off its grid, and a rack that is right until the zone
      // reaches its ceiling is not a rack.
      if (zone.terrain === 'terraced') {
        y = surface.base + Math.round((y - surface.base) / zone.rack) * zone.rack;
      }
      y = Math.round(y);

      enteredByRise = y < before - 0.5;   // y grows downward, so this is a rise

      const w = zone.slab[0] + rng() * (zone.slab[1] - zone.slab[0]);
      const slab = { x, y, w: Math.min(w, zone.end - x), h: DEPTH, zone: zone.key };
      rects.push(slab); solids.push(slab);
      x += slab.w;
      prevSlabW = slab.w;
    }

    // Closing slab, so a zone never ends on a cliff edge — but never wider than
    // the zone has left. The old Math.max(120, ...) floor overran the boundary
    // and left two ground rects overlapping at different heights across the
    // seam, which is a legal thing for a world to contain and was not a legal
    // thing for the collision solver to be handed.
    const tail = zone.end - x;
    if (tail > 0) {
      const closer = { x, y, w: tail, h: DEPTH, zone: zone.key };
      rects.push(closer); solids.push(closer);
    }
  }

  // ---- floating one-way ledges.
  //
  // The meadow gets a handful at one height, as optional detours. The grove
  // gets three tiers of them, stacked so each is a jump above the last — that
  // stack is the zone's whole identity, and it is why its floor is kept flat.
  const ledges = [];
  for (const zone of ZONES) {
    const [base, spread] = zone.ledges;
    const n = base + Math.floor(rng() * (spread + 1));
    for (let i = 0; i < n; i++) {
      const host = pickSolid(solids, zone.key, rng);
      if (!host || host.w < 150) continue;

      // Every tier of this stack has to live inside the window where stepping
      // off it lands back on the host slab with room to spare. See LEDGE_RUNOUT.
      const lo = host.x + 24;
      const hi = host.x + host.w - LEDGE_RUNOUT;
      const maxW = Math.min(140, hi - lo);
      if (maxW < 70) continue;                 // no room on this slab

      // Tiers are 78px apart: under the 90px jump peak, so each one is
      // reachable from the one below rather than merely visible from it.
      const tiers = 1 + Math.floor(rng() * zone.ledgeTiers);
      let lx = lo + rng() * Math.max(0, hi - lo - maxW);
      for (let tier = 0; tier < tiers; tier++) {
        const lw = 70 + rng() * (maxW - 70);
        lx = Math.max(lo, Math.min(hi - lw, lx));
        const ly = host.y - (86 + rng() * 40) - tier * 78;
        rects.push({ x: lx, y: ly, w: lw, h: 12, oneWay: true, zone: zone.key });
        ledges.push(rects[rects.length - 1]);
        // stagger each tier sideways so the stack is climbable, not a chimney
        lx += (rng() < 0.5 ? -1 : 1) * (40 + rng() * 40);
      }
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
