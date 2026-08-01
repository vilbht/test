// spin.mjs — the shield-pulse flourish: the fox spins up, holds as the Firefox
// mark, and unwinds back into itself.
//
// The drawing lives in js/art/, but the timing lives here because the parts that
// can actually be wrong are arithmetic, not pixels: the fox must finish facing
// the way it started, the mark must be upright and stationary while it is being
// read, and a spin must always end. Those are assertions, so they belong in a
// pure module the tests can drive.

const TAU = Math.PI * 2;

export const SPIN = Object.freeze({
  duration: 1.9,

  // Whole turns either side of the hold, and they have to be whole. The mark is
  // drawn rotated by the first, and the fox by the sum — a fractional count
  // would leave the logo tilted while it is being read, and the fox tilted for
  // good once the spin ended.
  turnsIn: 2,
  turnsOut: 2,

  // The rotation stops completely between these. This is the whole point of the
  // effect: a mark that is still spinning is a smear, and a smear cannot be
  // recognised however long it is left on screen. Roughly half a second of
  // absolute stillness is what makes it legible.
  holdStart: 0.40,
  holdEnd: 0.66,

  // Cross-fade schedule. The mark reaches full opacity *before* the rotation
  // stops and starts fading *after* it restarts, so the hold is entirely
  // occupied by a mark that is both solid and motionless.
  markIn: 0.22,
  markFull: 0.37,
  markOut: 0.68,
  markGone: 0.80,

  // A second pulse only restarts the flourish once the mark has gone. Earlier
  // than that and mashing the key strobes between fox and logo.
  restartAfter: 0.86,
});

export function createSpin() {
  return { active: false, t: 0, angle: 0, prevAngle: 0 };
}

/** Ease in and out — zero velocity at both ends of each ramp. */
function smootherstep(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Total rotation at a point in the flourish.
 *
 * Two eased ramps with a plateau between them. Because each ramp lands on a
 * whole number of turns and eases out into it, the rotation arrives at the hold
 * already stopped — there is no separate braking step to tune, and no risk of
 * the mark drifting a few degrees while the player is looking at it.
 */
export function spinAngle(t) {
  const { turnsIn, turnsOut, holdStart, holdEnd } = SPIN;

  if (t <= holdStart) {
    return TAU * turnsIn * smootherstep(t / holdStart);
  }
  if (t <= holdEnd) {
    return TAU * turnsIn;
  }
  const u = (t - holdEnd) / (1 - holdEnd);
  return TAU * (turnsIn + turnsOut * smootherstep(u));
}

/**
 * Start a spin, or ignore the request if one is already mid-flourish.
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

  spin.angle = spinAngle(spin.t);
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

/** True while the mark is upright, solid and still. */
export function isHolding(spin) {
  return spin.active && spin.t >= SPIN.holdStart && spin.t <= SPIN.holdEnd;
}

/** Radians turned since the previous step — what the motion blur is drawn from. */
export function spinDelta(spin) {
  return spin.angle - spin.prevAngle;
}
