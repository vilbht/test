// spin.mjs — the shield-pulse flourish: the fox spins up, becomes the Firefox
// mark for a moment, and unwinds back into itself.
//
// The drawing lives in js/art/, but the timing lives here because the parts that
// can actually be wrong are arithmetic, not pixels: the fox must finish facing
// the way it started, the mark must be fully gone before the fox is visible
// again, and a spin must always end. Those are assertions, so they belong in a
// pure module the tests can drive.

const TAU = Math.PI * 2;

export const SPIN = Object.freeze({
  duration: 1.15,

  // Whole turns, and it has to be whole: the fox is drawn rotated by this, so a
  // fractional count would leave it permanently tilted once the spin ended.
  turns: 3,

  // Cross-fade schedule as fractions of the spin. The mark comes in after the
  // fox has already built up speed — morphing from a standstill reads as a
  // substitution, morphing from a blur reads as a transformation.
  markIn: 0.28,
  markFull: 0.42,
  markOut: 0.60,
  markGone: 0.76,

  // A second pulse only restarts the flourish once the mark has gone. Earlier
  // than that and mashing the key strobes between fox and logo.
  restartAfter: 0.78,
});

export function createSpin() {
  return { active: false, t: 0, angle: 0, prevAngle: 0 };
}

/** Ease in and out, so angular speed peaks in the middle where the mark is. */
function smootherstep(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Start a spin, or ignore the request if one is already mid-morph.
 * @returns whether a spin actually started
 */
export function triggerSpin(spin) {
  if (spin.active && spin.t < SPIN.restartAfter) return false;
  spin.active = true;
  spin.t = 0;
  spin.angle = 0;
  spin.prevAngle = 0;
  return true;
}

export function stepSpin(spin, dt) {
  if (!spin.active) {
    spin.prevAngle = spin.angle;
    spin.angle = 0;
    return false;
  }

  spin.t += dt / SPIN.duration;
  spin.prevAngle = spin.angle;

  if (spin.t >= 1) {
    spin.active = false;
    spin.t = 0;
    spin.angle = 0;
    return true;                     // finished this step
  }

  spin.angle = SPIN.turns * TAU * smootherstep(spin.t);
  return false;
}

/** Ramp from 0 to 1 across [a, b], smoothed. */
function ramp(t, a, b) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return smootherstep((t - a) / (b - a));
}

/** How much of the Firefox mark is showing, 0..1. */
export function markMix(spin) {
  if (!spin.active) return 0;
  const t = spin.t;
  if (t < SPIN.markFull) return ramp(t, SPIN.markIn, SPIN.markFull);
  if (t > SPIN.markOut) return 1 - ramp(t, SPIN.markOut, SPIN.markGone);
  return 1;
}

/** How much of the fox is showing. The two always sum to one. */
export function foxMix(spin) {
  return 1 - markMix(spin);
}

/** Radians turned since the previous step — what the motion blur is drawn from. */
export function spinDelta(spin) {
  return spin.angle - spin.prevAngle;
}
