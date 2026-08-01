// terrain.mjs — the continuous rolling heightfield the fox rides down.
//
// This replaces the rectangular slabs of the platformer build. A slope game
// needs a surface with a defined gradient at every point, not a staircase of
// axis-aligned boxes: the whole feel comes from gravity resolved along a
// tangent, and a stack of rectangles has no tangent to resolve it along.
//
// The surface is a sum of sine octaves over a descending baseline, which buys
// two things a noise lattice would not. It is sampled analytically — no stored
// samples, no interpolation, exact at any x — and its derivative is exact too,
// because the derivative of a sine sum is another sine sum. That matters more
// than it sounds: the rider's acceleration, its launch condition and its
// landing alignment all read the gradient every step, and a finite-difference
// gradient off an interpolated lattice would make all three jitter.

import { mulberry32 } from './rng.mjs';

/** Descent of the baseline per pixel travelled. The mountain always goes down. */
export const DRIFT = 0.055;

export const BASE_Y = 360;

/**
 * The drop-in: extra descent over the opening stretch.
 *
 * Without it the run begins wherever the octaves happen to put it, which on some
 * seeds is a flat or rising shoulder — the fox spends the first few seconds
 * pinned at minimum speed, and a momentum game that opens slowly has already
 * lost the argument. A smoothstep adds height early and flattens out, so the
 * mountain hands over to its own terrain with no visible join.
 */
export const DROP_IN_LENGTH = 900;

/** Floor for the drop-in, and the average opening gradient it must guarantee. */
export const DROP_IN_DEPTH = 165;
export const OPENING_SLOPE = 0.17;

/** 3u² − 2u³ on [0,1], clamped outside it. */
function smoothstep(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

function dropIn(terrain, x) {
  return terrain.dropDepth * smoothstep(x / DROP_IN_LENGTH);
}

function dropInSlope(terrain, x) {
  const u = x / DROP_IN_LENGTH;
  if (u <= 0 || u >= 1) return 0;
  return (terrain.dropDepth * 6 * u * (1 - u)) / DROP_IN_LENGTH;
}

function dropInCurvature(terrain, x) {
  const u = x / DROP_IN_LENGTH;
  if (u <= 0 || u >= 1) return 0;
  return (terrain.dropDepth * 6 * (1 - 2 * u)) / (DROP_IN_LENGTH * DROP_IN_LENGTH);
}

/**
 * How deep this seed's drop-in has to be.
 *
 * A fixed depth is not enough: on some seeds the octaves put a rising shoulder
 * exactly where the run begins, and a constant ramp merely reduces the climb
 * instead of removing it. So the opening gradient is *solved for* — measure what
 * the octaves do over the first stretch, then size the ramp to bring the average
 * up to OPENING_SLOPE. Every seed then starts on a real descent by construction.
 */
function solveDropDepth(octaves, drift) {
  const x0 = 60;
  const x1 = DROP_IN_LENGTH * 0.75;
  let octaveMean = 0;
  let shapeMean = 0;
  let n = 0;

  for (let x = x0; x <= x1; x += 10) {
    let s = 0;
    for (const o of octaves) s += o.amp * o.freq * Math.cos(x * o.freq + o.phase);
    octaveMean += s;
    const u = x / DROP_IN_LENGTH;
    shapeMean += (6 * u * (1 - u)) / DROP_IN_LENGTH;   // slope per unit depth
    n++;
  }
  octaveMean /= n;
  shapeMean /= n;

  const needed = (OPENING_SLOPE - drift - octaveMean) / shapeMean;
  return Math.max(DROP_IN_DEPTH, needed);
}

/**
 * Octave shapes, coarse to fine.
 *
 * What is being budgeted here is *gradient*, not amplitude — the rider only ever
 * feels the derivative. An octave contributes `amp × freq` to the slope, so
 * halving amplitude while halving wavelength contributes exactly as much tilt as
 * the octave above it. The first pass did that across five octaves and produced
 * a 65° mountainside built from ripples nobody could see.
 *
 * So amplitude falls slower than wavelength, and each octave's slope share is
 * roughly half its predecessor's: 0.33, 0.20, 0.12, 0.07. The big rollers own
 * the ride and the fine detail is texture that never tilts the fox.
 */
const OCTAVES = [
  { amp: 66, wavelength: 1250 },
  { amp: 18, wavelength: 560 },
  { amp: 4.6, wavelength: 250 },
  { amp: 1.2, wavelength: 110 },
];

export function createTerrain({ seed = 7, length = 12000 } = {}) {
  const rng = mulberry32(seed ^ 0x5eed);
  const octaves = OCTAVES.map((o) => ({
    amp: o.amp * (0.82 + rng() * 0.36),
    freq: (Math.PI * 2) / o.wavelength,
    phase: rng() * Math.PI * 2,
  }));
  return {
    seed, length, octaves,
    drift: DRIFT,
    baseY: BASE_Y,
    dropDepth: solveDropDepth(octaves, DRIFT),
    chasms: [],
    kickers: [],
  };
}

/**
 * A terrain with one constant gradient and no features.
 *
 * Exported rather than hand-rolled in tests so there is a single definition of
 * what a terrain object *is* — a test that builds the shape by hand silently
 * breaks the moment a new field like `kickers` is added.
 */
export function createRamp(slope, { baseY = 200, length = 40000 } = {}) {
  // baseY is offset by the drop-in so a ramp really is one constant gradient;
  // tests reason about pure slope and should not inherit the opening descent.
  // dropDepth 0: a ramp is one constant gradient, and tests reasoning about pure
  // slope should not inherit the opening descent.
  return {
    seed: 0, length, octaves: [], drift: slope, baseY,
    dropDepth: 0, chasms: [], kickers: [],
  };
}

/** The notional surface at x, ignoring chasms. Always a number. */
export function surfaceY(terrain, x) {
  let y = terrain.baseY + x * terrain.drift + dropIn(terrain, x);
  for (const o of terrain.octaves) y += o.amp * Math.sin(x * o.freq + o.phase);
  for (const k of terrain.kickers) {
    const d = (x - k.x) / k.w;
    if (d > -4 && d < 4) y -= k.amp * Math.exp(-d * d);
  }
  return y;
}

/**
 * dy/dx of the surface. Positive means descending, because y grows downward.
 * Exact rather than a finite difference — see the note at the top of the file.
 */
export function slopeAt(terrain, x) {
  let s = terrain.drift + dropInSlope(terrain, x);
  for (const o of terrain.octaves) s += o.amp * o.freq * Math.cos(x * o.freq + o.phase);
  for (const k of terrain.kickers) {
    const d = (x - k.x) / k.w;
    if (d > -4 && d < 4) s += (2 * k.amp * d * Math.exp(-d * d)) / k.w;
  }
  return s;
}

/**
 * Add kicker ramps: small, sharp, deliberate launch bumps.
 *
 * Rolling sine terrain almost never throws a rider off on its own. Launching
 * needs the surface to curve away faster than gravity can pull the fox down —
 * v²·κ > g·cosθ — and the smooth octaves have nowhere near that curvature at
 * riding speed, which left about eight moments of air in an entire descent.
 *
 * Cranking the fine octaves would buy curvature at the cost of tilting the whole
 * mountain into chatter, because those octaves add gradient everywhere. A
 * Gaussian bump instead puts curvature exactly where it is wanted and none
 * anywhere else — and, being an analytic function, it differentiates exactly
 * like the octaves do, so the rider still reads one clean gradient.
 */
export function addKickers(terrain, { seed = 5, spacing = 470 } = {}) {
  const rng = mulberry32(seed ^ 0x11cc);

  // Width matters far more than height. Curvature goes as amp/w², so narrowing a
  // ramp from 50px to 32px triples its kick while barely changing how tall it
  // looks — the first pass built wide gentle mounds that needed 260-410px/s to
  // launch from, against an actual average ride speed of about 190.
  for (let x = 520; x < terrain.length - 400; x += spacing * (0.6 + rng() * 0.9)) {
    if (inChasm(terrain, x)) continue;
    terrain.kickers.push({ x, amp: 15 + rng() * 9, w: 30 + rng() * 14 });
  }

  return terrain;
}

/**
 * A kicker with its peak on the lip of every chasm. Leaving the ground at the
 * crest of a ramp converts downhill motion into horizontal motion, which is
 * exactly the trade that gets you across a gap — and it is what turns "tap to
 * survive" into "tap to fly".
 *
 * Separate from addKickers because chasms are placed *after* the general ramps:
 * the speed profile that decides where a chasm is fair has to be measured on a
 * mountain with no holes in it yet.
 */
export function addLipKickers(terrain, { seed = 5 } = {}) {
  const rng = mulberry32(seed ^ 0x7a11);
  for (const c of terrain.chasms) {
    terrain.kickers.push({ x: c.x0 - 12, amp: 19 + rng() * 8, w: 32 + rng() * 10 });
  }
  return terrain;
}

/**
 * d²y/dx² of the surface. Positive is a crest, because y grows downward.
 *
 * The rider needs this to know when the ground has curved away faster than
 * gravity can hold it down. Like the gradient it is exact, which matters here
 * even more: curvature is a second derivative, and estimating one numerically
 * off a sampled surface is where noise gets amplified into false launches.
 */
export function curvatureAt(terrain, x) {
  let k = dropInCurvature(terrain, x);
  for (const o of terrain.octaves) k -= o.amp * o.freq * o.freq * Math.sin(x * o.freq + o.phase);
  for (const g of terrain.kickers) {
    const d = (x - g.x) / g.w;
    if (d > -4 && d < 4) k += (2 * g.amp * Math.exp(-d * d) * (1 - 2 * d * d)) / (g.w * g.w);
  }
  return k;
}

/** Surface angle in radians. */
export function angleAt(terrain, x) {
  return Math.atan(slopeAt(terrain, x));
}

export function inChasm(terrain, x) {
  for (const c of terrain.chasms) {
    if (x > c.x0 && x < c.x1) return c;
  }
  return null;
}

/** Ground height at x, or null over a chasm. */
export function groundY(terrain, x) {
  return inChasm(terrain, x) ? null : surfaceY(terrain, x);
}

/** Mean gradient over a span — how much run-up a point has behind it. */
export function meanSlope(terrain, x0, x1, step = 30) {
  let sum = 0;
  let n = 0;
  for (let x = x0; x <= x1; x += step) { sum += slopeAt(terrain, x); n++; }
  return n ? sum / n : 0;
}

/**
 * Add chasms.
 *
 * Placement is about the *approach*, not the lip. Choosing a spot by its local
 * gradient looks reasonable and plays badly: a steep point often sits just past
 * a climb, so the fox crests it at minimum speed and drops straight in with no
 * chance to clear. A chasm is only fair if the rider arrives carrying speed, so
 * a site needs a sustained descent behind it — and a far lip no higher than the
 * near one, since landing uphill eats the arc that was meant to cross the gap.
 *
 * Width is bounded by the reach the real controller actually has; see
 * test/ride.test.mjs, which flies it over the widest chasm the generator can
 * emit and asserts it lands on the far side.
 */
export const RUN_UP = 480;

export function addChasms(terrain, {
  seed = 3, first = 1500, spacing = 950, maxWidth = 150, minWidth = 82,
  canClear = () => true,
} = {}) {
  const rng = mulberry32(seed ^ 0xc4a5);
  let x = first;

  while (x < terrain.length - 800) {
    let probe = x;
    let guard = 0;
    let chosen = 0;

    while (guard++ < 700 && !chosen) {
      // Measured up to 80px short of the lip: the ramp that will later be put
      // on the lip itself is not run-up, and including it flatters the approach.
      const runUp = meanSlope(terrain, probe - RUN_UP, probe - 80);
      if (runUp > 0.09 && slopeAt(terrain, probe) > 0.03) {
        // Try the widest gap first and narrow until one is provably clearable.
        // A chasm that has to shrink is better than one placed anyway.
        for (let w = maxWidth; w >= minWidth; w -= 8) {
          const drop = surfaceY(terrain, probe + w) - surfaceY(terrain, probe);
          if (drop < -8) continue;
          if (!canClear(probe, w, drop)) continue;
          chosen = w * (0.9 + rng() * 0.1);
          break;
        }
      }
      if (!chosen) probe += 14;
    }
    if (!chosen) break;

    terrain.chasms.push({ x0: probe, x1: probe + chosen });
    x = probe + chosen + spacing * (0.65 + rng() * 0.8);
  }
  return terrain;
}

/**
 * The lowest surface point over a span — used to place scenery and to size the
 * silhouette fills so they never reveal a gap under the mountain.
 */
export function lowestBetween(terrain, x0, x1, step = 24) {
  let lowest = -Infinity;
  for (let x = x0; x <= x1; x += step) lowest = Math.max(lowest, surfaceY(terrain, x));
  return lowest;
}
